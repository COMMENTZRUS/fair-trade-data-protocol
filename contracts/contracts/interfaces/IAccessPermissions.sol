// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAccessPermissions {
    struct PermissionGrant {
        uint256 requiredFlags;
        uint256 readRoles;
        uint256 expires;
    }

    function setPermissionsAdmin(
        bytes32 grantorDeploymentId,
        bytes32 granteeDeploymentId,
        bytes32 dataId,
        uint256 requiredFlags,
        uint256 readRoles,
        uint256 expires
    ) external;

    function getPermissions(
        bytes32 grantorDeploymentId,
        bytes32 granteeDeploymentId,
        bytes32 dataId
    ) external view returns (PermissionGrant memory);

    function canRead(
        address grantee,
        bytes32 grantorDeploymentId,
        bytes32 uid,
        bytes32 dataId,
        uint256 merkleFlags,
        bytes32[] calldata merkleProof
    ) external view returns (bool);
}
