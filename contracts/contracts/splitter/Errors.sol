// SPDX-License-Identifier: MIT
// Adapted from Constant-Time Splitter (Copyright 2022-2025 Dingbat Soy LLC) — see LICENSE-NOTICE.md
pragma solidity ^0.8.24;

error AlreadyInitialized();
error NotInitializer();
error NotFound();
error NotUpstreamAdmin();
error NotOwner();
error NotMinter();
error InvalidAddress();
error InvalidSignature();
error SignatureExpired();
error TokenNotSupportedBySplitter(address token);
error SupportedTokenNotAvailableForRecover(address token);
error TransferFailed(address token, address recipient, uint256 amount);
error WithdrawProhibited();
error InsufficientFunds(uint256 requested, uint256 available);
error TokenAlreadySupported(address token);
error EmptyTokenList();
