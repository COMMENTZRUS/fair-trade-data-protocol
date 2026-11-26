// SPDX-License-Identifier: MIT
// Adapted & hardened from Constant-Time Splitter (Copyright 2022-2025 Dingbat Soy LLC) — see LICENSE-NOTICE.md
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IShared.sol";
import "../interfaces/ISplitter.sol";
import "./Beneficiary.sol";
import "./Errors.sol";

// Bitmask configuration options
uint256 constant CONFIG_REQUIRE_SELF_WITHDRAW = 1;

/// @title AbstractSplitter
/// @notice Constant-Time Splitting (CTS) accounting engine for multi-token FTDP Data Unions.
/// @dev Hardened vs upstream:
///  - Fixed `saveRPS()` early-return bug (`continue` instead of `return`) so all supported tokens account properly.
///  - Guarded against sub-precision dust truncation (`deltaRPS == 0` skips accounting until dust accumulates).
///  - Uses `SafeERC20`, low-level ETH `.call`, and `ReentrancyGuard`.
abstract contract AbstractSplitter is IShared, Beneficiary, ISplitter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    event NewAmountAccounted(address indexed token, uint256 amount);
    event Withdrawal(
        address indexed shareholder,
        address indexed token,
        address indexed to,
        uint256 amount
    );
    event AddSupportedToken(address indexed token);

    // All quantities in BalanceInfo increase monotonically
    struct BalanceInfo {
        uint256 accrual;
        uint256 withdrawn;
        uint256 RPS_atLastShareChange;
    }

    function totalShares() public view virtual override returns (uint256);

    function shares(address shareholder) public view virtual override returns (uint256);

    // Fixed-point Receipts Per Share (scaled by 1e18)
    mapping(address => uint256) internal lastRecordedRPS;

    // Total lifetime token receipts already folded into lastRecordedRPS
    mapping(address => uint256) internal lastRecordedTotalReceipts;

    mapping(address => uint256) public override totalWithdrawn;
    // (shareholder => (token => BalanceInfo))
    mapping(address => mapping(address => BalanceInfo)) public balanceInfo;

    address[] public supportedTokens;
    mapping(address => bool) private supportedTokensMap;
    uint256 public configOptions;

    function supportedTokensLength() public view returns (uint256) {
        return supportedTokens.length;
    }

    function supportedTokensAll() public view override returns (address[] memory) {
        return supportedTokens;
    }

    receive() external payable virtual {
        if (!tokenSupported(address(0))) revert TokenNotSupportedBySplitter(address(0));
    }

    fallback() external payable virtual {
        revert("noFallback");
    }

    /// @notice Lifetime tokens received by this splitter = current balance + total withdrawn.
    function totalReceived(address tokenAddress) public view virtual override returns (uint256) {
        uint256 bal = tokenAddress == address(0)
            ? address(this).balance
            : IERC20(tokenAddress).balanceOf(address(this));
        return bal + totalWithdrawn[tokenAddress];
    }

    function _unaccountedTokens(address tokenAddress) internal view returns (uint256) {
        uint256 received = totalReceived(tokenAddress);
        uint256 recorded = lastRecordedTotalReceipts[tokenAddress];
        return received > recorded ? received - recorded : 0;
    }

    /// @notice Current global Receipts Per Share (1e18 fixed point).
    function receiptsPerShare(address tokenAddress) public view virtual returns (uint256) {
        uint256 ts = totalShares();
        if (ts == 0) return lastRecordedRPS[tokenAddress];
        uint256 unaccountedRPS = (1e18 * _unaccountedTokens(tokenAddress)) / ts;
        return lastRecordedRPS[tokenAddress] + unaccountedRPS;
    }

    function _unrecordedAllotment(
        address shareholder,
        address tokenAddress
    ) internal view returns (uint256) {
        if (totalShares() == 0) return 0;
        BalanceInfo storage bal = balanceInfo[shareholder][tokenAddress];
        return (shares(shareholder) * (receiptsPerShare(tokenAddress) - bal.RPS_atLastShareChange)) / 1e18;
    }

    function totalAllotment(
        address shareholder,
        address tokenAddress
    ) public view override returns (uint256) {
        if (!tokenSupported(tokenAddress)) return 0;
        BalanceInfo storage bal = balanceInfo[shareholder][tokenAddress];
        return bal.accrual + _unrecordedAllotment(shareholder, tokenAddress);
    }

    function withdrawn(
        address shareholder,
        address tokenAddress
    ) public view virtual override returns (uint256) {
        if (!tokenSupported(tokenAddress)) return 0;
        return balanceInfo[shareholder][tokenAddress].withdrawn;
    }

    function availableAllotment(
        address shareholder,
        address tokenAddress
    ) public view override returns (uint256) {
        return totalAllotment(shareholder, tokenAddress) - withdrawn(shareholder, tokenAddress);
    }

    function tokenSupported(address token) public view virtual override returns (bool) {
        return supportedTokensMap[token];
    }

    /// @dev Supported tokens must be registered before any shares exist.
    function _addSupportedToken(address token) internal {
        if (totalShares() != 0) revert AlreadyInitialized();
        if (tokenSupported(token)) revert TokenAlreadySupported(token);
        supportedTokens.push(token);
        supportedTokensMap[token] = true;
        emit AddSupportedToken(token);
    }

    function _withdraw(
        address shareholder,
        address tokenAddress,
        address to,
        uint256 amount
    ) internal virtual {
        if (amount == 0) return;
        uint256 availableForWithdraw = availableAllotment(shareholder, tokenAddress);
        if (availableForWithdraw < amount) {
            revert InsufficientFunds(amount, availableForWithdraw);
        }
        BalanceInfo storage bal = balanceInfo[shareholder][tokenAddress];
        bal.withdrawn += amount;
        totalWithdrawn[tokenAddress] += amount;
        emit Withdrawal(shareholder, tokenAddress, to, amount);

        if (tokenAddress == address(0)) {
            (bool ok, ) = payable(to).call{value: amount}("");
            if (!ok) revert TransferFailed(address(0), to, amount);
        } else {
            IERC20(tokenAddress).safeTransfer(to, amount);
        }
    }

    function _executeWithdraw(address shareholder, address tokenAddress, uint256 amount) internal {
        if ((configOptions & CONFIG_REQUIRE_SELF_WITHDRAW) != 0 && msg.sender != shareholder) {
            revert WithdrawProhibited();
        }
        address to = beneficiary(shareholder);
        _withdraw(shareholder, tokenAddress, to, amount);
    }

    /// @notice Anyone can pull accrued tokens from an upstream splitter into this splitter.
    function pullAllFromUpstream(ISplitter upstreamSplitter, address tokenAddress) public {
        upstreamSplitter.withdrawAll(address(this), tokenAddress);
    }

    /// @notice Fold unaccounted token receipts into `lastRecordedRPS`. MUST be called before `totalShares()` changes.
    function saveRPS() public virtual override {
        uint256 ts = totalShares();
        if (ts == 0) return;
        uint256 len = supportedTokens.length;
        for (uint256 i = 0; i < len; i++) {
            address token = supportedTokens[i];
            uint256 unaccountedTokens = _unaccountedTokens(token);
            if (unaccountedTokens == 0) continue;
            uint256 deltaRPS = (1e18 * unaccountedTokens) / ts;
            if (deltaRPS == 0) continue;
            lastRecordedTotalReceipts[token] += unaccountedTokens;
            emit NewAmountAccounted(token, unaccountedTokens);
            lastRecordedRPS[token] += deltaRPS;
        }
    }

    /// @notice Checkpoint `shareholder`'s unrecorded allotment into `accrual`. MUST be called before shares change.
    function saveAccrual(address shareholder) public virtual override {
        uint256 len = supportedTokens.length;
        for (uint256 i = 0; i < len; i++) {
            address token = supportedTokens[i];
            BalanceInfo storage bal = balanceInfo[shareholder][token];
            bal.accrual += _unrecordedAllotment(shareholder, token);
            bal.RPS_atLastShareChange = receiptsPerShare(token);
        }
    }

    function withdraw(
        address shareholder,
        address tokenAddress,
        uint256 amount
    ) public virtual override nonReentrant {
        _executeWithdraw(shareholder, tokenAddress, amount);
    }

    function withdrawAll(
        address shareholder,
        address tokenAddress
    ) public virtual override nonReentrant returns (uint256) {
        uint256 amount = availableAllotment(shareholder, tokenAddress);
        _executeWithdraw(shareholder, tokenAddress, amount);
        return amount;
    }
}
