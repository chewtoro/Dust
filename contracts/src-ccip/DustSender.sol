// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";

/**
 * @title DustSender
 * @author Dust Team
 * @notice Deployed on source chains to send dust to Base via CCIP
 * @dev Handles token approvals and CCIP message sending
 */
contract DustSender is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ State Variables ============
    IRouterClient public immutable ccipRouter;
    IERC20 public immutable linkToken;
    
    uint64 public immutable destinationChainSelector; // Base chain selector
    address public dustConsolidator; // DustConsolidator address on Base
    address public backend;
    
    bool public paused;

    mapping(address => bool) public supportedTokens;
    mapping(bytes32 => SendRecord) public sendRecords;

    // ============ Structs ============
    struct SendRecord {
        address user;
        address token;
        uint256 amount;
        bytes32 jobId;
        bytes32 ccipMessageId;
        uint256 timestamp;
        bool success;
    }

    // ============ Events ============
    event DustSent(
        bytes32 indexed jobId,
        address indexed user,
        address token,
        uint256 amount,
        bytes32 ccipMessageId
    );
    event TokenSupportUpdated(address indexed token, bool supported);
    event BackendUpdated(address indexed oldBackend, address indexed newBackend);
    event ConsolidatorUpdated(address indexed newConsolidator);

    // ============ Errors ============
    error Paused();
    error UnsupportedToken();
    error UnauthorizedCaller();
    error InsufficientLinkBalance();
    error ZeroAddress();
    error ZeroAmount();
    error TransferFailed();

    // ============ Modifiers ============
    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier onlyBackend() {
        if (msg.sender != backend && msg.sender != owner()) revert UnauthorizedCaller();
        _;
    }

    // ============ Constructor ============
    constructor(
        address _ccipRouter,
        address _linkToken,
        uint64 _destinationChainSelector,
        address _dustConsolidator
    ) Ownable(msg.sender) {
        ccipRouter = IRouterClient(_ccipRouter);
        linkToken = IERC20(_linkToken);
        destinationChainSelector = _destinationChainSelector;
        dustConsolidator = _dustConsolidator;
    }

    // ============ External Functions ============

    /**
     * @notice Send tokens to Base for consolidation
     * @param jobId The consolidation job ID
     * @param token Token address to send
     * @param amount Amount to send
     * @param user User address (for tracking)
     * @return messageId CCIP message ID
     */
    function sendDust(
        bytes32 jobId,
        address token,
        uint256 amount,
        address user
    ) external onlyBackend whenNotPaused nonReentrant returns (bytes32 messageId) {
        if (!supportedTokens[token]) revert UnsupportedToken();
        if (amount == 0) revert ZeroAmount();

        // Build CCIP message
        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](1);
        tokenAmounts[0] = Client.EVMTokenAmount({
            token: token,
            amount: amount
        });

        bytes memory data = abi.encode(jobId, token, amount);

        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(dustConsolidator),
            data: data,
            tokenAmounts: tokenAmounts,
            feeToken: address(linkToken),
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: 300_000})
            )
        });

        // Get fee estimate
        uint256 fees = ccipRouter.getFee(destinationChainSelector, message);

        if (linkToken.balanceOf(address(this)) < fees) {
            revert InsufficientLinkBalance();
        }

        // Approve router to spend tokens
        IERC20(token).safeIncreaseAllowance(address(ccipRouter), amount);
        
        // Approve router to spend LINK for fees
        linkToken.approve(address(ccipRouter), fees);

        // Send CCIP message
        messageId = ccipRouter.ccipSend(destinationChainSelector, message);

        // Record send
        sendRecords[messageId] = SendRecord({
            user: user,
            token: token,
            amount: amount,
            jobId: jobId,
            ccipMessageId: messageId,
            timestamp: block.timestamp,
            success: true
        });

        emit DustSent(jobId, user, token, amount, messageId);

        return messageId;
    }

    /**
     * @notice Estimate CCIP fees for sending tokens
     * @param token Token address
     * @param amount Amount to send
     * @return fees LINK token fees required
     */
    function estimateFees(
        address token,
        uint256 amount
    ) external view returns (uint256 fees) {
        Client.EVMTokenAmount[] memory tokenAmounts = new Client.EVMTokenAmount[](1);
        tokenAmounts[0] = Client.EVMTokenAmount({
            token: token,
            amount: amount
        });

        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(dustConsolidator),
            data: abi.encode(bytes32(0), token, amount),
            tokenAmounts: tokenAmounts,
            feeToken: address(linkToken),
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: 300_000})
            )
        });

        return ccipRouter.getFee(destinationChainSelector, message);
    }

    /**
     * @notice Send native ETH to Base
     * @dev Wraps ETH to WETH first, then sends via CCIP
     */
    function sendNativeETH(
        bytes32 jobId,
        address user,
        address weth
    ) external payable onlyBackend whenNotPaused nonReentrant returns (bytes32 messageId) {
        if (msg.value == 0) revert ZeroAmount();
        
        // Wrap ETH to WETH
        (bool success,) = weth.call{value: msg.value}("");
        if (!success) revert TransferFailed();

        // Now send WETH via CCIP
        return this.sendDust(jobId, weth, msg.value, user);
    }

    // ============ Admin Functions ============

    function setSupportedToken(address token, bool supported) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        supportedTokens[token] = supported;
        emit TokenSupportUpdated(token, supported);
    }

    function setBackend(address _backend) external onlyOwner {
        if (_backend == address(0)) revert ZeroAddress();
        emit BackendUpdated(backend, _backend);
        backend = _backend;
    }

    function setDustConsolidator(address _dustConsolidator) external onlyOwner {
        if (_dustConsolidator == address(0)) revert ZeroAddress();
        dustConsolidator = _dustConsolidator;
        emit ConsolidatorUpdated(_dustConsolidator);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    /**
     * @notice Withdraw LINK tokens (for fee recovery)
     */
    function withdrawLink(address to, uint256 amount) external onlyOwner {
        linkToken.transfer(to, amount);
    }

    /**
     * @notice Withdraw any ERC20 tokens (emergency)
     */
    function withdrawTokens(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    // ============ View Functions ============

    function getSendRecord(bytes32 messageId) external view returns (SendRecord memory) {
        return sendRecords[messageId];
    }

    function getLinkBalance() external view returns (uint256) {
        return linkToken.balanceOf(address(this));
    }

    function isTokenSupported(address token) external view returns (bool) {
        return supportedTokens[token];
    }

    // ============ Receive ETH ============
    receive() external payable {}
}
