// SPDX-License-Identifier: MIT
// Adapted from Constant-Time Splitter (Copyright 2022-2025 Dingbat Soy LLC) — see LICENSE-NOTICE.md
pragma solidity ^0.8.24;

interface IBeneficiary {
    /// @notice Returns the payout beneficiary for `user` (defaults to `user` if unset).
    function beneficiary(address user) external view returns (address);

    function setBeneficiary(address beneficiary_) external;

    function setBeneficiaryMeta(
        address user,
        address beneficiary_,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
