// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IClientConfigManager {
    function ROLE_ADMIN() external view returns (uint256);

    function ROLE_GRANT() external view returns (uint256);

    function ROLE_READ() external view returns (uint256);

    function ROLE_WRITE() external view returns (uint256);

    function ROLE_SUPERUSER() external view returns (uint256);

    function getDeploymentId(address key) external view returns (bytes32);

    function keyToId(address key) external view returns (bytes32);

    function hasRole(bytes32 deploymentId, address key, uint256 role) external view returns (bool);

    function deploymentExists(bytes32 deploymentId) external view returns (bool);
}
