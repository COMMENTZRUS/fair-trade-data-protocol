// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IClientConfigManager.sol";
import "../interfaces/IAccessPermissions.sol";

/// @title ComputeToDataEscrow
/// @notice Modular v2 Compute-to-Data job escrow: AI labs & buyers lock payment against an active
///         FTDP AccessPermissions grant; authorized compute workers/TEEs execute over consented records
///         without exposing raw data, releasing payment directly to the Data Union MultiSplitter beneficiary.
contract ComputeToDataEscrow is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum JobStatus {
        OPEN,
        COMPLETED,
        REFUNDED
    }

    struct ComputeJob {
        uint256 id;
        address buyer;
        bytes32 buyerDeploymentId;
        bytes32 grantorDeploymentId;
        bytes32 dataId;
        bytes32 algorithmHash;
        address paymentToken; // address(0) for native ETH, or ERC-20 (USDC / FTD)
        uint256 paymentAmount;
        address beneficiary; // Data Union MultiSplitter contract
        uint256 deadline;
        bytes32 resultCidHash;
        bytes32 attestationHash;
        JobStatus status;
    }

    IClientConfigManager public immutable clientConfig;
    IAccessPermissions public immutable accessPermissions;

    uint256 public nextJobId = 1;
    mapping(address => bool) public authorizedWorkers;
    mapping(uint256 => ComputeJob) public jobs;

    event WorkerAuthorized(address indexed worker, bool authorized);
    event JobSubmitted(
        uint256 indexed jobId,
        address indexed buyer,
        bytes32 indexed grantorDeploymentId,
        bytes32 dataId,
        bytes32 algorithmHash,
        address beneficiary,
        address paymentToken,
        uint256 paymentAmount,
        uint256 deadline
    );
    event JobCompleted(
        uint256 indexed jobId,
        address indexed worker,
        bytes32 resultCidHash,
        bytes32 attestationHash,
        address beneficiary,
        uint256 paidAmount
    );
    event JobRefunded(uint256 indexed jobId, address indexed buyer, uint256 refundedAmount);

    error InvalidAddress();
    error InvalidParams();
    error Unauthorized();
    error NoActiveAccessGrant();
    error JobNotOpen(uint256 jobId);
    error DeadlineNotReached(uint256 nowTs, uint256 deadline);
    error InsufficientNativePayment(uint256 required, uint256 provided);
    error TransferFailed();

    constructor(address clientConfig_, address accessPermissions_, address initialOwner) Ownable(initialOwner) {
        if (clientConfig_ == address(0) || accessPermissions_ == address(0)) revert InvalidAddress();
        clientConfig = IClientConfigManager(clientConfig_);
        accessPermissions = IAccessPermissions(accessPermissions_);
    }

    function setAuthorizedWorker(address worker, bool authorized) external onlyOwner {
        if (worker == address(0)) revert InvalidAddress();
        authorizedWorkers[worker] = authorized;
        emit WorkerAuthorized(worker, authorized);
    }

    function submitJob(
        bytes32 grantorDeploymentId,
        bytes32 dataId,
        bytes32 algorithmHash,
        address paymentToken,
        uint256 paymentAmount,
        address beneficiary,
        uint256 deadline
    ) external payable nonReentrant returns (uint256 jobId) {
        if (beneficiary == address(0)) revert InvalidAddress();
        if (algorithmHash == bytes32(0) || paymentAmount == 0 || deadline <= block.timestamp) {
            revert InvalidParams();
        }

        bytes32 buyerDepId = clientConfig.getDeploymentId(msg.sender);
        if (buyerDepId == bytes32(0)) revert Unauthorized();

        // Verify buyer holds an active AccessPermissions grant for this dataset (or wildcard)
        IAccessPermissions.PermissionGrant memory grant = accessPermissions.getPermissions(
            grantorDeploymentId,
            buyerDepId,
            dataId
        );
        if (grant.expires == 0 && dataId != bytes32(0)) {
            grant = accessPermissions.getPermissions(grantorDeploymentId, buyerDepId, bytes32(0));
        }
        if (grant.expires <= block.timestamp) revert NoActiveAccessGrant();

        // Lock payment in escrow
        if (paymentToken == address(0)) {
            if (msg.value < paymentAmount) revert InsufficientNativePayment(paymentAmount, msg.value);
            if (msg.value > paymentAmount) {
                (bool refundOk, ) = payable(msg.sender).call{value: msg.value - paymentAmount}("");
                if (!refundOk) revert TransferFailed();
            }
        } else {
            if (msg.value != 0) revert InvalidParams();
            IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), paymentAmount);
        }

        jobId = nextJobId++;
        jobs[jobId] = ComputeJob({
            id: jobId,
            buyer: msg.sender,
            buyerDeploymentId: buyerDepId,
            grantorDeploymentId: grantorDeploymentId,
            dataId: dataId,
            algorithmHash: algorithmHash,
            paymentToken: paymentToken,
            paymentAmount: paymentAmount,
            beneficiary: beneficiary,
            deadline: deadline,
            resultCidHash: bytes32(0),
            attestationHash: bytes32(0),
            status: JobStatus.OPEN
        });

        emit JobSubmitted(
            jobId,
            msg.sender,
            grantorDeploymentId,
            dataId,
            algorithmHash,
            beneficiary,
            paymentToken,
            paymentAmount,
            deadline
        );
    }

    /// @notice Authorized compute worker / enclave (or grantor admin) attests job result & releases funds to Data Union.
    function completeJob(
        uint256 jobId,
        bytes32 resultCidHash,
        bytes32 attestationHash
    ) external nonReentrant {
        ComputeJob storage job = jobs[jobId];
        if (job.id == 0 || job.status != JobStatus.OPEN) revert JobNotOpen(jobId);
        if (resultCidHash == bytes32(0)) revert InvalidParams();

        bool isGrantorAdmin = clientConfig.hasRole(job.grantorDeploymentId, msg.sender, clientConfig.ROLE_ADMIN());
        if (!authorizedWorkers[msg.sender] && !isGrantorAdmin && msg.sender != owner()) {
            revert Unauthorized();
        }

        job.status = JobStatus.COMPLETED;
        job.resultCidHash = resultCidHash;
        job.attestationHash = attestationHash;

        _payout(job.paymentToken, job.beneficiary, job.paymentAmount);

        emit JobCompleted(jobId, msg.sender, resultCidHash, attestationHash, job.beneficiary, job.paymentAmount);
    }

    function refundExpiredJob(uint256 jobId) external nonReentrant {
        ComputeJob storage job = jobs[jobId];
        if (job.id == 0 || job.status != JobStatus.OPEN) revert JobNotOpen(jobId);
        if (block.timestamp < job.deadline) revert DeadlineNotReached(block.timestamp, job.deadline);

        job.status = JobStatus.REFUNDED;
        _payout(job.paymentToken, job.buyer, job.paymentAmount);

        emit JobRefunded(jobId, job.buyer, job.paymentAmount);
    }

    function _payout(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok, ) = payable(to).call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
