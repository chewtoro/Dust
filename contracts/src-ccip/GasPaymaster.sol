// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GasPaymaster
 * @author Dust Team
 * @notice Fronts gas costs for dust consolidation, recovers from final amount
 * @dev Implements simplified ERC-4337 paymaster pattern for Base
 */
contract GasPaymaster is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ State Variables ============
    address public dustConsolidator;
    address public entryPoint;
    
    uint256 public maxGasPerUser = 0.01 ether;
    uint256 public maxGasPerJob = 0.005 ether;
    uint256 public totalGasPool;
    uint256 public totalGasSponsored;
    uint256 public totalGasRecovered;

    mapping(address => uint256) public userSponsoredGas;
    mapping(address => uint256) public userJobCount;
    mapping(address => bool) public authorizedSponsors;
    mapping(bytes32 => GasRecord) public gasRecords;

    // Rate limiting
    mapping(address => uint256) public lastJobTimestamp;
    uint256 public minJobInterval = 1 hours;

    // ============ Structs ============
    struct GasRecord {
        address user;
        uint256 gasSponsored;
        uint256 gasPriceWei;
        uint256 ethPriceUSD;  // 8 decimals (Chainlink format)
        uint256 gasCostUSD;   // 6 decimals (USDC format)
        bool recovered;
        uint256 timestamp;
    }

    // ============ Events ============
    event GasSponsored(
        address indexed user,
        bytes32 indexed jobId,
        uint256 gasAmount,
        uint256 estimatedCostUSD
    );
    event GasRecovered(bytes32 indexed jobId, uint256 gasCostUSD);
    event GasPoolFunded(address indexed funder, uint256 amount);
    event GasPoolWithdrawn(address indexed to, uint256 amount);
    event AuthorizedSponsorUpdated(address indexed sponsor, bool authorized);
    event ConsolidatorUpdated(address indexed oldConsolidator, address indexed newConsolidator);
    event RateLimitUpdated(uint256 oldInterval, uint256 newInterval);

    // ============ Errors ============
    error UnauthorizedSponsor();
    error UnauthorizedCaller();
    error UserGasLimitExceeded();
    error JobGasLimitExceeded();
    error InsufficientGasPool();
    error InvalidJobId();
    error AlreadyRecovered();
    error RateLimitExceeded();
    error ZeroAddress();
    error ZeroAmount();

    // ============ Modifiers ============
    modifier onlyAuthorized() {
        if (!authorizedSponsors[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedSponsor();
        }
        _;
    }

    modifier onlyConsolidatorOrAuthorized() {
        if (msg.sender != dustConsolidator && !authorizedSponsors[msg.sender] && msg.sender != owner()) {
            revert UnauthorizedCaller();
        }
        _;
    }

    // ============ Constructor ============
    constructor(address _dustConsolidator, address _entryPoint) Ownable(msg.sender) {
        dustConsolidator = _dustConsolidator;
        entryPoint = _entryPoint;
    }

    // ============ External Functions ============

    /**
     * @notice Sponsor gas for a user's consolidation
     * @param user The user address
     * @param jobId The consolidation job ID
     * @param estimatedGas Estimated gas units needed
     * @param ethPriceUSD Current ETH price (8 decimals)
     * @return gasCostUSD Estimated gas cost in USD (6 decimals)
     */
    function sponsorGas(
        address user,
        bytes32 jobId,
        uint256 estimatedGas,
        uint256 ethPriceUSD
    ) external onlyAuthorized nonReentrant returns (uint256 gasCostUSD) {
        // Rate limiting
        if (block.timestamp - lastJobTimestamp[user] < minJobInterval) {
            revert RateLimitExceeded();
        }

        uint256 gasValue = estimatedGas * tx.gasprice;

        // Check limits
        if (userSponsoredGas[user] + gasValue > maxGasPerUser) {
            revert UserGasLimitExceeded();
        }
        if (gasValue > maxGasPerJob) {
            revert JobGasLimitExceeded();
        }
        if (address(this).balance < gasValue) {
            revert InsufficientGasPool();
        }

        // Calculate USD cost: (gasValue * ethPriceUSD) / 1e18 / 1e8 * 1e6
        // Simplified: (gasValue * ethPriceUSD) / 1e20
        gasCostUSD = (gasValue * ethPriceUSD) / 1e20;

        // Record sponsorship
        gasRecords[jobId] = GasRecord({
            user: user,
            gasSponsored: gasValue,
            gasPriceWei: tx.gasprice,
            ethPriceUSD: ethPriceUSD,
            gasCostUSD: gasCostUSD,
            recovered: false,
            timestamp: block.timestamp
        });

        // Update state
        userSponsoredGas[user] += gasValue;
        userJobCount[user]++;
        totalGasSponsored += gasValue;
        lastJobTimestamp[user] = block.timestamp;

        emit GasSponsored(user, jobId, gasValue, gasCostUSD);

        return gasCostUSD;
    }

    /**
     * @notice Update gas cost after actual execution
     * @param jobId The consolidation job ID
     * @param actualGasUsed Actual gas units used
     * @param ethPriceUSD Current ETH price (8 decimals)
     */
    function updateGasCost(
        bytes32 jobId,
        uint256 actualGasUsed,
        uint256 ethPriceUSD
    ) external onlyAuthorized {
        GasRecord storage record = gasRecords[jobId];
        if (record.user == address(0)) revert InvalidJobId();
        if (record.recovered) revert AlreadyRecovered();

        uint256 actualGasValue = actualGasUsed * record.gasPriceWei;
        record.gasCostUSD = (actualGasValue * ethPriceUSD) / 1e20;
        record.ethPriceUSD = ethPriceUSD;
    }

    /**
     * @notice Mark gas as recovered from consolidated funds
     * @param jobId The consolidation job ID
     */
    function markGasRecovered(bytes32 jobId) external onlyConsolidatorOrAuthorized {
        GasRecord storage record = gasRecords[jobId];
        if (record.user == address(0)) revert InvalidJobId();
        if (record.recovered) revert AlreadyRecovered();

        record.recovered = true;
        totalGasRecovered += record.gasCostUSD;

        emit GasRecovered(jobId, record.gasCostUSD);
    }

    /**
     * @notice Get gas cost for a job in USD
     * @param jobId The consolidation job ID
     * @return Gas cost in USD (6 decimals)
     */
    function getGasCostUSD(bytes32 jobId) external view returns (uint256) {
        return gasRecords[jobId].gasCostUSD;
    }

    /**
     * @notice Check if user can create a new job (rate limiting)
     * @param user User address
     * @return canCreate Whether user can create a job
     * @return waitTime Seconds until user can create next job
     */
    function canCreateJob(address user) external view returns (bool canCreate, uint256 waitTime) {
        uint256 timeSinceLastJob = block.timestamp - lastJobTimestamp[user];
        if (timeSinceLastJob >= minJobInterval) {
            return (true, 0);
        }
        return (false, minJobInterval - timeSinceLastJob);
    }

    // ============ Admin Functions ============

    /**
     * @notice Fund the gas pool
     */
    function fundGasPool() external payable {
        if (msg.value == 0) revert ZeroAmount();
        totalGasPool += msg.value;
        emit GasPoolFunded(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw from gas pool
     * @param amount Amount to withdraw
     * @param to Recipient address
     */
    function withdrawFromPool(uint256 amount, address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (amount > address(this).balance) revert InsufficientGasPool();
        
        payable(to).transfer(amount);
        emit GasPoolWithdrawn(to, amount);
    }

    /**
     * @notice Add or remove authorized sponsor
     * @param sponsor Address to authorize/deauthorize
     * @param authorized Whether to authorize
     */
    function setAuthorizedSponsor(address sponsor, bool authorized) external onlyOwner {
        if (sponsor == address(0)) revert ZeroAddress();
        authorizedSponsors[sponsor] = authorized;
        emit AuthorizedSponsorUpdated(sponsor, authorized);
    }

    /**
     * @notice Set dust consolidator address
     * @param _dustConsolidator New consolidator address
     */
    function setDustConsolidator(address _dustConsolidator) external onlyOwner {
        if (_dustConsolidator == address(0)) revert ZeroAddress();
        emit ConsolidatorUpdated(dustConsolidator, _dustConsolidator);
        dustConsolidator = _dustConsolidator;
    }

    /**
     * @notice Set max gas limits
     */
    function setGasLimits(uint256 _maxGasPerUser, uint256 _maxGasPerJob) external onlyOwner {
        maxGasPerUser = _maxGasPerUser;
        maxGasPerJob = _maxGasPerJob;
    }

    /**
     * @notice Set rate limiting interval
     */
    function setMinJobInterval(uint256 _minJobInterval) external onlyOwner {
        emit RateLimitUpdated(minJobInterval, _minJobInterval);
        minJobInterval = _minJobInterval;
    }

    /**
     * @notice Reset user's sponsored gas counter (for support cases)
     * @param user User address
     */
    function resetUserGas(address user) external onlyOwner {
        userSponsoredGas[user] = 0;
        lastJobTimestamp[user] = 0;
    }

    // ============ View Functions ============

    function getGasPoolBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getUserStats(address user) external view returns (
        uint256 sponsored,
        uint256 jobCount,
        uint256 lastJob,
        bool canCreateNow
    ) {
        sponsored = userSponsoredGas[user];
        jobCount = userJobCount[user];
        lastJob = lastJobTimestamp[user];
        canCreateNow = (block.timestamp - lastJob) >= minJobInterval;
    }

    function getGasRecord(bytes32 jobId) external view returns (GasRecord memory) {
        return gasRecords[jobId];
    }

    function getStats() external view returns (
        uint256 poolBalance,
        uint256 sponsored,
        uint256 recovered,
        uint256 outstanding
    ) {
        poolBalance = address(this).balance;
        sponsored = totalGasSponsored;
        recovered = totalGasRecovered;
        outstanding = sponsored > recovered ? sponsored - recovered : 0;
    }

    // ============ ERC-4337 Paymaster Interface (Simplified) ============

    /**
     * @notice Validate paymaster user operation
     * @dev Called by EntryPoint to validate if paymaster will sponsor
     */
    function validatePaymasterUserOp(
        bytes calldata, /* userOp */
        bytes32, /* userOpHash */
        uint256 maxCost
    ) external view returns (bytes memory context, uint256 validationData) {
        require(msg.sender == entryPoint, "Must be EntryPoint");
        require(address(this).balance >= maxCost, "Insufficient balance");
        return ("", 0); // 0 = valid
    }

    /**
     * @notice Post operation hook
     * @dev Called by EntryPoint after operation execution
     */
    function postOp(
        uint8, /* mode */
        bytes calldata, /* context */
        uint256 actualGasCost
    ) external {
        require(msg.sender == entryPoint, "Must be EntryPoint");
        totalGasSponsored += actualGasCost;
    }

    // ============ Receive ETH ============
    receive() external payable {
        totalGasPool += msg.value;
        emit GasPoolFunded(msg.sender, msg.value);
    }
}
