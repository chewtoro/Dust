// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

/**
 * @title DustConsolidator
 * @author Dust Team
 * @notice Consolidates cross-chain crypto dust into USDC or ETH on Base L2
 * @dev Integrates with Chainlink CCIP for cross-chain messaging and handles token swaps
 */
contract DustConsolidator is CCIPReceiver, Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant MAX_SERVICE_FEE = 500; // 5% max
    uint256 public constant MIN_CONSOLIDATION_USD = 1e6; // $1 minimum (6 decimals)

    // ============ Immutables ============
    address public immutable usdc;
    address public immutable weth;

    // ============ State Variables ============
    address public paymaster;
    address public swapRouter; // 0x Exchange Proxy or Uniswap Router
    address public backend; // Authorized backend for job management
    
    uint256 public serviceFeePercent = 100; // 1% default (basis points)
    uint256 public totalFeesCollected;
    uint256 public totalConsolidated;

    mapping(bytes32 => ConsolidationJob) public jobs;
    mapping(address => bytes32[]) public userJobs;
    mapping(uint64 => bool) public supportedSourceChains;
    mapping(uint64 => address) public trustedSenders; // chainSelector => sender address

    // ============ Structs ============
    struct ConsolidationJob {
        address user;
        address targetAsset;
        uint256 expectedAmount;
        uint256 receivedAmount;
        uint256 swappedAmount;
        uint256 netAmount;
        uint256 gasCostUSD;
        uint256 serviceFee;
        JobStatus status;
        uint64[] sourceChains;
        uint256 createdAt;
        uint256 completedAt;
    }

    enum JobStatus {
        Created,
        Receiving,
        Swapping,
        Settling,
        Complete,
        Failed,
        Refunded
    }

    // ============ Events ============
    event JobCreated(
        bytes32 indexed jobId,
        address indexed user,
        address targetAsset,
        uint256 expectedAmount
    );
    event AssetReceived(
        bytes32 indexed jobId,
        uint64 indexed sourceChain,
        address token,
        uint256 amount
    );
    event SwapExecuted(
        bytes32 indexed jobId,
        address fromToken,
        address toToken,
        uint256 amountIn,
        uint256 amountOut
    );
    event JobCompleted(
        bytes32 indexed jobId,
        address indexed user,
        uint256 netAmount,
        uint256 gasCost,
        uint256 serviceFee
    );
    event JobFailed(bytes32 indexed jobId, string reason);
    event JobRefunded(bytes32 indexed jobId, address indexed user, uint256 amount);
    event ServiceFeeUpdated(uint256 oldFee, uint256 newFee);
    event ChainAdded(uint64 chainSelector, address trustedSender);
    event ChainRemoved(uint64 chainSelector);

    // ============ Errors ============
    error InvalidAmount();
    error InvalidTargetAsset();
    error InvalidJobStatus();
    error JobNotFound();
    error UnauthorizedSender();
    error UnsupportedSourceChain();
    error SwapFailed();
    error SlippageExceeded();
    error InsufficientOutput();
    error FeeTooHigh();
    error ZeroAddress();

    // ============ Modifiers ============
    modifier onlyBackend() {
        if (msg.sender != backend && msg.sender != owner()) revert UnauthorizedSender();
        _;
    }

    modifier validJob(bytes32 jobId) {
        if (jobs[jobId].user == address(0)) revert JobNotFound();
        _;
    }

    // ============ Constructor ============
    constructor(
        address _ccipRouter,
        address _usdc,
        address _weth,
        address _swapRouter
    ) CCIPReceiver(_ccipRouter) Ownable(msg.sender) {
        if (_usdc == address(0) || _weth == address(0)) revert ZeroAddress();
        usdc = _usdc;
        weth = _weth;
        swapRouter = _swapRouter;
    }

    // ============ External Functions ============

    /**
     * @notice Creates a new consolidation job
     * @param user The user's address on Base
     * @param targetAsset USDC or WETH address
     * @param expectedAmount Expected total amount to receive
     * @param sourceChains Array of source chain selectors
     * @return jobId The unique job identifier
     */
    function createJob(
        address user,
        address targetAsset,
        uint256 expectedAmount,
        uint64[] calldata sourceChains
    ) external onlyBackend whenNotPaused returns (bytes32) {
        if (targetAsset != usdc && targetAsset != weth) revert InvalidTargetAsset();
        if (user == address(0)) revert ZeroAddress();
        if (expectedAmount == 0) revert InvalidAmount();

        bytes32 jobId = keccak256(
            abi.encodePacked(user, block.timestamp, userJobs[user].length)
        );

        jobs[jobId] = ConsolidationJob({
            user: user,
            targetAsset: targetAsset,
            expectedAmount: expectedAmount,
            receivedAmount: 0,
            swappedAmount: 0,
            netAmount: 0,
            gasCostUSD: 0,
            serviceFee: 0,
            status: JobStatus.Created,
            sourceChains: sourceChains,
            createdAt: block.timestamp,
            completedAt: 0
        });

        userJobs[user].push(jobId);

        emit JobCreated(jobId, user, targetAsset, expectedAmount);
        return jobId;
    }

    /**
     * @notice CCIP receiver - handles incoming cross-chain messages
     * @param message The CCIP message
     */
    function _ccipReceive(
        Client.Any2EVMMessage memory message
    ) internal override nonReentrant whenNotPaused {
        uint64 sourceChain = message.sourceChainSelector;
        
        // Verify source chain is supported
        if (!supportedSourceChains[sourceChain]) revert UnsupportedSourceChain();
        
        // Verify sender is trusted
        address sender = abi.decode(message.sender, (address));
        if (sender != trustedSenders[sourceChain]) revert UnauthorizedSender();

        // Decode message data
        (bytes32 jobId, address token, uint256 amount) = abi.decode(
            message.data,
            (bytes32, address, uint256)
        );

        ConsolidationJob storage job = jobs[jobId];
        if (job.user == address(0)) revert JobNotFound();

        // Update job status
        if (job.status == JobStatus.Created) {
            job.status = JobStatus.Receiving;
        }

        job.receivedAmount += amount;

        // Handle received tokens from CCIP
        if (message.destTokenAmounts.length > 0) {
            // Tokens were transferred via CCIP token transfer
            // They're already in this contract
        }

        emit AssetReceived(jobId, sourceChain, token, amount);
    }

    /**
     * @notice Execute swap via DEX aggregator
     * @param jobId The consolidation job ID
     * @param fromToken Token to swap from
     * @param amount Amount to swap
     * @param minAmountOut Minimum output amount (slippage protection)
     * @param swapData Encoded swap calldata from 0x API
     */
    function executeSwap(
        bytes32 jobId,
        address fromToken,
        uint256 amount,
        uint256 minAmountOut,
        bytes calldata swapData
    ) external onlyBackend validJob(jobId) nonReentrant {
        ConsolidationJob storage job = jobs[jobId];
        
        if (job.status != JobStatus.Receiving && job.status != JobStatus.Swapping) {
            revert InvalidJobStatus();
        }

        job.status = JobStatus.Swapping;

        // Get balance before swap
        uint256 balanceBefore = IERC20(job.targetAsset).balanceOf(address(this));

        // Approve swap router
        IERC20(fromToken).safeIncreaseAllowance(swapRouter, amount);

        // Execute swap
        (bool success,) = swapRouter.call(swapData);
        if (!success) revert SwapFailed();

        // Calculate output
        uint256 balanceAfter = IERC20(job.targetAsset).balanceOf(address(this));
        uint256 amountOut = balanceAfter - balanceBefore;

        if (amountOut < minAmountOut) revert SlippageExceeded();

        job.swappedAmount += amountOut;

        emit SwapExecuted(jobId, fromToken, job.targetAsset, amount, amountOut);
    }

    /**
     * @notice Settle the consolidation job and transfer funds to user
     * @param jobId The consolidation job ID
     * @param gasCostUSD Total gas cost in USD (6 decimals)
     */
    function settleJob(
        bytes32 jobId,
        uint256 gasCostUSD
    ) external onlyBackend validJob(jobId) nonReentrant {
        ConsolidationJob storage job = jobs[jobId];

        if (job.status != JobStatus.Swapping && job.status != JobStatus.Receiving) {
            revert InvalidJobStatus();
        }

        job.status = JobStatus.Settling;

        uint256 totalAmount = job.swappedAmount > 0 ? job.swappedAmount : job.receivedAmount;
        
        if (totalAmount < MIN_CONSOLIDATION_USD) {
            _failJob(jobId, "Amount below minimum");
            return;
        }

        // Calculate fees
        uint256 serviceFee = (totalAmount * serviceFeePercent) / FEE_DENOMINATOR;
        uint256 totalFees = gasCostUSD + serviceFee;

        if (totalAmount <= totalFees) {
            _failJob(jobId, "Insufficient amount for fees");
            return;
        }

        uint256 netAmount = totalAmount - totalFees;

        // Update job
        job.netAmount = netAmount;
        job.gasCostUSD = gasCostUSD;
        job.serviceFee = serviceFee;
        job.status = JobStatus.Complete;
        job.completedAt = block.timestamp;

        // Update totals
        totalFeesCollected += serviceFee;
        totalConsolidated += netAmount;

        // Transfer to user
        IERC20(job.targetAsset).safeTransfer(job.user, netAmount);

        // Transfer service fee to owner
        if (serviceFee > 0) {
            IERC20(job.targetAsset).safeTransfer(owner(), serviceFee);
        }

        emit JobCompleted(jobId, job.user, netAmount, gasCostUSD, serviceFee);
    }

    /**
     * @notice Refund user for a failed job
     * @param jobId The consolidation job ID
     */
    function refundJob(bytes32 jobId) external onlyBackend validJob(jobId) nonReentrant {
        ConsolidationJob storage job = jobs[jobId];

        if (job.status != JobStatus.Failed) revert InvalidJobStatus();

        uint256 refundAmount = job.swappedAmount > 0 ? job.swappedAmount : job.receivedAmount;
        
        if (refundAmount > 0) {
            job.status = JobStatus.Refunded;
            IERC20(job.targetAsset).safeTransfer(job.user, refundAmount);
            emit JobRefunded(jobId, job.user, refundAmount);
        }
    }

    // ============ Internal Functions ============

    function _failJob(bytes32 jobId, string memory reason) internal {
        jobs[jobId].status = JobStatus.Failed;
        emit JobFailed(jobId, reason);
    }

    // ============ Admin Functions ============

    function addSupportedChain(uint64 chainSelector, address trustedSender) external onlyOwner {
        if (trustedSender == address(0)) revert ZeroAddress();
        supportedSourceChains[chainSelector] = true;
        trustedSenders[chainSelector] = trustedSender;
        emit ChainAdded(chainSelector, trustedSender);
    }

    function removeSupportedChain(uint64 chainSelector) external onlyOwner {
        supportedSourceChains[chainSelector] = false;
        delete trustedSenders[chainSelector];
        emit ChainRemoved(chainSelector);
    }

    function setServiceFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_SERVICE_FEE) revert FeeTooHigh();
        emit ServiceFeeUpdated(serviceFeePercent, newFee);
        serviceFeePercent = newFee;
    }

    function setBackend(address _backend) external onlyOwner {
        if (_backend == address(0)) revert ZeroAddress();
        backend = _backend;
    }

    function setPaymaster(address _paymaster) external onlyOwner {
        paymaster = _paymaster;
    }

    function setSwapRouter(address _swapRouter) external onlyOwner {
        if (_swapRouter == address(0)) revert ZeroAddress();
        swapRouter = _swapRouter;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Emergency withdrawal of stuck tokens
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    // ============ View Functions ============

    function getJob(bytes32 jobId) external view returns (ConsolidationJob memory) {
        return jobs[jobId];
    }

    function getUserJobs(address user) external view returns (bytes32[] memory) {
        return userJobs[user];
    }

    function getUserJobCount(address user) external view returns (uint256) {
        return userJobs[user].length;
    }

    function isChainSupported(uint64 chainSelector) external view returns (bool) {
        return supportedSourceChains[chainSelector];
    }

    function getStats() external view returns (
        uint256 _totalConsolidated,
        uint256 _totalFeesCollected,
        uint256 _serviceFeePercent
    ) {
        return (totalConsolidated, totalFeesCollected, serviceFeePercent);
    }

    // ============ Receive ETH ============
    receive() external payable {}
}
