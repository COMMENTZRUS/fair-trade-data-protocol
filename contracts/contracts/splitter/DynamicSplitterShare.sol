// SPDX-License-Identifier: MIT
// Adapted & hardened from Constant-Time Splitter (Copyright 2022-2025 Dingbat Soy LLC) — see LICENSE-NOTICE.md
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "./SplitterShare.sol";
import "../interfaces/InitializableShare.sol";
import "./Errors.sol";

/// @title DynamicSplitterShare
/// @notice Clone-safe ERC-20 Data Union share token with custom per-union name/symbol, EIP-2612 permit,
///         and optional role-gated mint/burn for dynamic contributor share issuance.
contract DynamicSplitterShare is SplitterShare, InitializableShare, ERC20Permit {
    address public initializer;
    address public minter;

    string private _tokenName;
    string private _tokenSymbol;

    event MinterUpdated(address indexed newMinter);

    constructor() ERC20("FTDP Union Share", "FTDU") ERC20Permit("FTDPUnionShare") {
        initializer = msg.sender;
    }

    function name() public view virtual override returns (string memory) {
        return bytes(_tokenName).length > 0 ? _tokenName : "FTDP Union Share";
    }

    function symbol() public view virtual override returns (string memory) {
        return bytes(_tokenSymbol).length > 0 ? _tokenSymbol : "FTDU";
    }

    function init(
        address splitter_,
        string calldata name_,
        string calldata symbol_,
        uint256 mintAmount,
        address sendTo,
        address minter_
    ) public virtual override {
        if (address(splitter) != address(0)) revert AlreadyInitialized();
        if (splitter_ == address(0)) revert InvalidAddress();
        if (initializer != address(0) && msg.sender != initializer) revert NotInitializer();
        splitter = ISplitter(splitter_);
        _tokenName = name_;
        _tokenSymbol = symbol_;
        minter = minter_;
        if (mintAmount > 0) {
            if (sendTo == address(0)) revert InvalidAddress();
            _mint(sendTo, mintAmount);
        }
    }

    function mint(address to, uint256 amount) external {
        if (minter == address(0) || msg.sender != minter) revert NotMinter();
        _mint(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }

    function setMinter(address newMinter) external {
        if (minter == address(0) || msg.sender != minter) revert NotMinter();
        minter = newMinter;
        emit MinterUpdated(newMinter);
    }

    function _update(address from, address to, uint256 amount) internal virtual override {
        _notifySplitterBeforeSharesChange(from, to);
        super._update(from, to, amount);
    }
}
