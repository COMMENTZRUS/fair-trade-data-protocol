// SPDX-License-Identifier: MIT
// Adapted from Constant-Time Splitter (Copyright 2022-2025 Dingbat Soy LLC) — see LICENSE-NOTICE.md
pragma solidity ^0.8.24;

import "./IShared.sol";
import "./IBeneficiary.sol";

interface ISplitter is IShared, IBeneficiary {
    function totalReceived(address tokenAddress) external view returns (uint256);

    function totalWithdrawn(address tokenAddress) external view returns (uint256);

    function tokenSupported(address tokenAddress) external view returns (bool);

    function supportedTokensAll() external view returns (address[] memory);

    /// @notice Total lifetime allotment for `shareholder` in `tokenAddress`.
    function totalAllotment(address shareholder, address tokenAddress) external view returns (uint256);

    function withdrawn(address shareholder, address tokenAddress) external view returns (uint256);

    /// @notice Unwithdrawn claimable allotment (`totalAllotment - withdrawn`).
    function availableAllotment(address shareholder, address tokenAddress) external view returns (uint256);

    /// @notice MUST be called before `totalShares()` changes.
    function saveRPS() external;

    /// @notice MUST be called before `shareholder`'s shares change.
    function saveAccrual(address shareholder) external;

    function withdraw(address shareholder, address tokenAddress, uint256 amount) external;

    function withdrawAll(address shareholder, address tokenAddress) external returns (uint256);
}
