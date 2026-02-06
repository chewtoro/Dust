// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title DustConsolidatorMVP
 * @author Dust Team
 * @notice MVP version - consolidates tokens on Base L2 (no cross-chain yet)
 * @dev Phase 1: Single-chain consolidation. Phase 2 will add CCIP.
 */
contract DustConsolidatorMVP is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ============ Constants ============
    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant MAX_SERVICE_FEE = 500; // 5% max
    uint256 public constant MIN_CONSOLIDATION = 1e6; // $1 minimum (6 decimals for USDC)

    // ============ State Variables ============
    address public immutable usdc;
    address public immutable weth;
    address public swapRouter;
    address public backend;
    
    uint256 public serviceFeePercent = 100; // 1% default
    uint256 public totalFeesCollected;
    uint256 public totalConsolidated;

    mapping(bytes32 => ConsolidationJob) public jobs;
    mapping(address => bytes32[]) public userJobs;

    // ============ Structs ============
    struct ConsolidationJob {
        address user;
        address targetAsset;
        uint256 inputAmount;
        uint256 outputAmount;
        uint256 serviceFee;
        JobStatus status;
        uint256 createdAt;
        uint256 completedAt;
    }

    enum JobStatus {
        Created,
        Processing,
        Complete,
        Failed,
        Refunded
    }

    // ============ Events ============
    event JobCreated(bytes32 indexed jobId, address indexed user, address targetAsset, uint256 amount);
    event JobCompleted(bytes32 indexed jobId, address indexed user, uint256 netAmount, uint256 fee);
    event JobFailed(bytes32 indexed jobId, string reason);
    event ServiceFeeUpdated(uint256 oldFee, uint256 newFee);

    // ============ Errors ============
    error InvalidAmount();
    error InvalidTargetAsset();
    error InvalidJobStatus();
    error JobNotFound();
    error UnauthorizedSender();
    error FeeTooHigh();
    error ZeroAddress();

    // ============ Modifiers ============
    modifier onlyBackend() {
        if (msg.sender != backend && msg.sender != owner()) revert UnauthorizedSender();
        _;
    }

    // ============ Constructor ============
    constructor(
        address _usdc,
        address _weth,
        address _swapRouter
    ) Ownable(msg.sender) {
        if (_usdc == address(0) || _weth == address(0)) revert ZeroAddress();
        usdc = _usdc;
        weth = _weth;
        swapRouter = _swapRouter;
    }

    // ============ External Functions ============

    /**
     * @notice Create and execute a consolidation job in one tx
     * @param user User receiving the consolidated funds
     * @param targetAsset USDC or WETH
     * @param inputToken Token to consolidate
     * @param inputAmount Amount of input token
     * @param minOutputAmount Minimum output (slippage protection)
     * @param swapData Encoded swap calldata (from 0x API)
     */
    function consolidate(
        address user,
        address targetAsset,
        address inputToken,
        uint256 inputAmount,
        uint256 minOutputAmount,
        bytes calldata swapData
    ) external onlyBackend whenNotPaused nonReentrant returns (bytes32 jobId) {
        if (targetAsset != usdc && targetAsset != weth) revert InvalidTargetAsset();
        if (user == address(0)) revert ZeroAddress();
        if (inputAmount == 0) revert InvalidAmount();

        // Create job ID
        jobId = keccak256(abi.encodePacked(user, block.timestamp, userJobs[user].length));

        // Transfer tokens from user (requires approval)
        IERC20(inputToken).safeTransferFrom(msg.sender, address(this), inputAmount);

        uint256 outputAmount;

        // If input == target, no swap needed
        if (inputToken == targetAsset) {
            outputAmount = inputAmount;
        } else {
            // Execute swap
            uint256 balanceBefore = IERC20(targetAsset).balanceOf(address(this));
            
            IERC20(inputToken).safeIncreaseAllowance(swapRouter, inputAmount);
            (bool success,) = swapRouter.call(swapData);
            require(success, "Swap failed");
            
            outputAmount = IERC20(targetAsset).balanceOf(address(this)) - balanceBefore;
            require(outputAmount >= minOutputAmount, "Slippage exceeded");
        }

        // Calculate fee
        uint256 serviceFee = (outputAmount * serviceFeePercent) / FEE_DENOMINATOR;
        uint256 netAmount = outputAmount - serviceFee;

        require(netAmount >= MIN_CONSOLIDATION, "Amount too small");

        // Create job record
        jobs[jobId] = ConsolidationJob({
            user: user,
            targetAsset: targetAsset,
            inputAmount: inputAmount,
            outputAmount: netAmount,
            serviceFee: serviceFee,
            status: JobStatus.Complete,
            createdAt: block.timestamp,
            completedAt: block.timestamp
        });
        userJobs[user].push(jobId);

        // Update totals
        totalFeesCollected += serviceFee;
        totalConsolidated += netAmount;

        // Transfer to user
        IERC20(targetAsset).safeTransfer(user, netAmount);

        // Transfer fee to owner
        if (serviceFee > 0) {
            IERC20(targetAsset).safeTransfer(owner(), serviceFee);
        }

        emit JobCreated(jobId, user, targetAsset, inputAmount);
        emit JobCompleted(jobId, user, netAmount, serviceFee);

        return jobId;
    }

    /**
     * @notice Direct deposit (no swap) - for same-asset consolidation
     */
    function depositDirect(
        address user,
        address asset,
        uint256 amount
    ) external onlyBackend whenNotPaused nonReentrant returns (bytes32 jobId) {
        if (asset != usdc && asset != weth) revert InvalidTargetAsset();
        if (amount == 0) revert InvalidAmount();

        // Transfer from sender
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);

        // Calculate fee
        uint256 serviceFee = (amount * serviceFeePercent) / FEE_DENOMINATOR;
        uint256 netAmount = amount - serviceFee;

        jobId = keccak256(abi.encodePacked(user, block.timestamp, userJobs[user].length));

        jobs[jobId] = ConsolidationJob({
            user: user,
            targetAsset: asset,
            inputAmount: amount,
            outputAmount: netAmount,
            serviceFee: serviceFee,
            status: JobStatus.Complete,
            createdAt: block.timestamp,
            completedAt: block.timestamp
        });
        userJobs[user].push(jobId);

        totalFeesCollected += serviceFee;
        totalConsolidated += netAmount;

        IERC20(asset).safeTransfer(user, netAmount);
        if (serviceFee > 0) {
            IERC20(asset).safeTransfer(owner(), serviceFee);
        }

        emit JobCreated(jobId, user, asset, amount);
        emit JobCompleted(jobId, user, netAmount, serviceFee);
    }

    // ============ Admin Functions ============

    function setServiceFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_SERVICE_FEE) revert FeeTooHigh();
        emit ServiceFeeUpdated(serviceFeePercent, newFee);
        serviceFeePercent = newFee;
    }

    function setBackend(address _backend) external onlyOwner {
        if (_backend == address(0)) revert ZeroAddress();
        backend = _backend;
    }

    function setSwapRouter(address _swapRouter) external onlyOwner {
        if (_swapRouter == address(0)) revert ZeroAddress();
        swapRouter = _swapRouter;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

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

    function getStats() external view returns (uint256, uint256, uint256) {
        return (totalConsolidated, totalFeesCollected, serviceFeePercent);
    }

    receive() external payable {}
}
