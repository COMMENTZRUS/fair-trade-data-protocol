// SPDX-License-Identifier: MIT
// Adapted from Constant-Time Splitter (Copyright 2022-2025 Dingbat Soy LLC) — see LICENSE-NOTICE.md
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/Nonces.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "../interfaces/IBeneficiary.sol";
import "./Errors.sol";

/// @notice Allows shareholders to route withdrawals to an alternate beneficiary, including via gasless EIP-712 signatures.
contract Beneficiary is EIP712, IBeneficiary, Nonces {
    event SetBeneficiary(address indexed user, address indexed beneficiary);

    bytes32 private constant _SETBENEFICIARY_TYPEHASH =
        keccak256("SetBeneficiary(address user,address beneficiary,uint256 deadline,uint256 nonce)");

    mapping(address => address) private beneficiaries;

    constructor() EIP712("FTDPDataUnion", "1") {}

    function beneficiary(address user) public view override returns (address) {
        address b = beneficiaries[user];
        return b == address(0) ? user : b;
    }

    function setBeneficiary(address beneficiary_) public override {
        _setBeneficiary(msg.sender, beneficiary_);
    }

    function setBeneficiaryMeta(
        address user,
        address beneficiary_,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public override {
        if (block.timestamp >= deadline) revert SignatureExpired();
        bytes32 structHash = keccak256(
            abi.encode(_SETBENEFICIARY_TYPEHASH, user, beneficiary_, deadline, _useNonce(user))
        );
        bytes32 hash = _hashTypedDataV4(structHash);
        if (user != ECDSA.recover(hash, v, r, s)) revert InvalidSignature();
        _setBeneficiary(user, beneficiary_);
    }

    function _setBeneficiary(address user, address beneficiary_) internal virtual {
        beneficiaries[user] = beneficiary_;
        emit SetBeneficiary(user, beneficiary_);
    }

    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
