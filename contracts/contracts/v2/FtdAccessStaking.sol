// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FtdAccessStaking
/// @notice Modular v2 FTD token staking contract gating network read/write access and Mobile Node participation.
contract FtdAccessStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct StakePosition {
        uint256 stakedAmount;
        uint256 pendingUnstake;
        uint256 unstakeAvailableAt;
    }

    IERC20 public immutable ftdToken;
    uint256 public minReadWriteStake;
    uint256 public minMobileNodeStake;
    uint256 public unstakeCooldown;

    uint256 public totalStaked;
    mapping(address => StakePosition) public positions;

    event Staked(address indexed account, uint256 amount, uint256 totalAccountStake);
    event UnstakeRequested(address indexed account, uint256 amount, uint256 availableAt);
    event UnstakeWithdrawn(address indexed account, uint256 amount);
    event ThresholdsUpdated(uint256 minReadWriteStake, uint256 minMobileNodeStake, uint256 unstakeCooldown);

    error ZeroAmount();
    error InsufficientStake(uint256 requested, uint256 available);
    error CooldownNotElapsed(uint256 nowTs, uint256 availableAt);
    error NothingToWithdraw();
    error InvalidAddress();

    constructor(
        address ftdToken_,
        address initialOwner,
        uint256 minReadWriteStake_,
        uint256 minMobileNodeStake_,
        uint256 unstakeCooldown_
    ) Ownable(initialOwner) {
        if (ftdToken_ == address(0)) revert InvalidAddress();
        ftdToken = IERC20(ftdToken_);
        minReadWriteStake = minReadWriteStake_;
        minMobileNodeStake = minMobileNodeStake_;
        unstakeCooldown = unstakeCooldown_;
    }

    function setThresholds(
        uint256 minReadWriteStake_,
        uint256 minMobileNodeStake_,
        uint256 unstakeCooldown_
    ) external onlyOwner {
        minReadWriteStake = minReadWriteStake_;
        minMobileNodeStake = minMobileNodeStake_;
        unstakeCooldown = unstakeCooldown_;
        emit ThresholdsUpdated(minReadWriteStake_, minMobileNodeStake_, unstakeCooldown_);
    }

    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        ftdToken.safeTransferFrom(msg.sender, address(this), amount);
        StakePosition storage pos = positions[msg.sender];
        pos.stakedAmount += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount, pos.stakedAmount);
    }

    function requestUnstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        StakePosition storage pos = positions[msg.sender];
        if (pos.stakedAmount < amount) revert InsufficientStake(amount, pos.stakedAmount);
        pos.stakedAmount -= amount;
        totalStaked -= amount;
        pos.pendingUnstake += amount;
        pos.unstakeAvailableAt = block.timestamp + unstakeCooldown;
        emit UnstakeRequested(msg.sender, amount, pos.unstakeAvailableAt);
    }

    function withdrawUnstaked() external nonReentrant {
        StakePosition storage pos = positions[msg.sender];
        uint256 amt = pos.pendingUnstake;
        if (amt == 0) revert NothingToWithdraw();
        if (block.timestamp < pos.unstakeAvailableAt) {
            revert CooldownNotElapsed(block.timestamp, pos.unstakeAvailableAt);
        }
        pos.pendingUnstake = 0;
        pos.unstakeAvailableAt = 0;
        ftdToken.safeTransfer(msg.sender, amt);
        emit UnstakeWithdrawn(msg.sender, amt);
    }

    function hasNetworkAccess(address account) external view returns (bool) {
        return positions[account].stakedAmount >= minReadWriteStake;
    }

    function isActiveMobileNode(address account) external view returns (bool) {
        return positions[account].stakedAmount >= minMobileNodeStake;
    }
}
