// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IClientConfigManager.sol";
import "../interfaces/IAccessPermissions.sol";

/// @title Market
/// @notice FTDP on-chain data marketplace routing purchase proceeds directly into Data Union MultiSplitters
///         and granting time-bounded, consent-scoped read access via `AccessPermissions`.
contract Market is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Offer {
        uint256 id;
        bytes32 deploymentId;
        bytes32 dataId;
        address paymentToken; // address(0) for native token, or ERC-20 address (USDC / FTD)
        uint256 pricePerSecond;
        uint256 minDuration;
        uint256 maxDuration;
        address beneficiary; // Data Union Tier-1 MultiSplitter contract (or operator address)
        uint256 requiredFlags;
        uint256 readRoles;
        bool active;
    }

    IClientConfigManager public immutable clientConfig;
    IAccessPermissions public immutable accessPermissions;

    uint256 public nextOfferId = 1;
    mapping(uint256 => Offer) private _offers;
    mapping(bytes32 => uint256[]) private _deploymentOfferIds;

    event OfferPosted(
        uint256 indexed offerId,
        bytes32 indexed deploymentId,
        bytes32 indexed dataId,
        address beneficiary,
        address paymentToken,
        uint256 pricePerSecond
    );
    event OfferRemoved(uint256 indexed offerId, bytes32 indexed deploymentId);
    event OfferPurchased(
        uint256 indexed offerId,
        address indexed buyer,
        bytes32 indexed recipientDeploymentId,
        address beneficiary,
        address paymentToken,
        uint256 cost,
        uint256 expires
    );

    error Unauthorized();
    error InvalidAddress();
    error InvalidOffer();
    error OfferInactive(uint256 offerId);
    error InvalidDuration(uint256 duration, uint256 minDuration, uint256 maxDuration);
    error InsufficientNativePayment(uint256 required, uint256 provided);
    error TransferFailed();
    error EmptyOfferList();

    constructor(address clientConfig_, address accessPermissions_) {
        if (clientConfig_ == address(0) || accessPermissions_ == address(0)) revert InvalidAddress();
        clientConfig = IClientConfigManager(clientConfig_);
        accessPermissions = IAccessPermissions(accessPermissions_);
    }

    /// @notice Post a dataset / Data Union access offer. `beneficiary` should typically be a Data Union MultiSplitter.
    function addOffer(
        bytes32 deploymentId,
        bytes32 dataId,
        address paymentToken,
        uint256 pricePerSecond,
        uint256 minDuration,
        uint256 maxDuration,
        address beneficiary,
        uint256 requiredFlags,
        uint256 readRoles
    ) external returns (uint256 offerId) {
        bool isAdmin = clientConfig.hasRole(deploymentId, msg.sender, clientConfig.ROLE_ADMIN());
        bool isGrantor = clientConfig.hasRole(deploymentId, msg.sender, clientConfig.ROLE_GRANT());
        if (!isAdmin && !isGrantor) revert Unauthorized();
        if (beneficiary == address(0)) revert InvalidAddress();
        if (minDuration == 0 || (maxDuration != 0 && maxDuration < minDuration)) revert InvalidOffer();

        offerId = nextOfferId++;
        _offers[offerId] = Offer({
            id: offerId,
            deploymentId: deploymentId,
            dataId: dataId,
            paymentToken: paymentToken,
            pricePerSecond: pricePerSecond,
            minDuration: minDuration,
            maxDuration: maxDuration,
            beneficiary: beneficiary,
            requiredFlags: requiredFlags,
            readRoles: readRoles == 0 ? clientConfig.ROLE_READ() : readRoles,
            active: true
        });
        _deploymentOfferIds[deploymentId].push(offerId);

        emit OfferPosted(offerId, deploymentId, dataId, beneficiary, paymentToken, pricePerSecond);
    }

    function removeOffer(uint256 offerId) external {
        Offer storage offer = _offers[offerId];
        if (!offer.active) revert OfferInactive(offerId);
        bool isAdmin = clientConfig.hasRole(offer.deploymentId, msg.sender, clientConfig.ROLE_ADMIN());
        bool isGrantor = clientConfig.hasRole(offer.deploymentId, msg.sender, clientConfig.ROLE_GRANT());
        if (!isAdmin && !isGrantor) revert Unauthorized();

        offer.active = false;
        emit OfferRemoved(offerId, offer.deploymentId);
    }

    function getOffer(uint256 offerId) external view returns (Offer memory) {
        return _offers[offerId];
    }

    function getDeploymentOfferIds(bytes32 deploymentId) external view returns (uint256[] memory) {
        return _deploymentOfferIds[deploymentId];
    }

    function getCost(
        uint256 offerId,
        uint256 duration
    ) public view returns (uint256 cost, address paymentToken, uint256 expires) {
        Offer storage offer = _offers[offerId];
        if (!offer.active) revert OfferInactive(offerId);
        if (duration < offer.minDuration || (offer.maxDuration != 0 && duration > offer.maxDuration)) {
            revert InvalidDuration(duration, offer.minDuration, offer.maxDuration);
        }
        cost = offer.pricePerSecond * duration;
        paymentToken = offer.paymentToken;
        expires = block.timestamp + duration;
    }

    /// @notice Purchase access to one or more offers. Funds route directly to each offer's Data Union beneficiary.
    function purchase(
        uint256[] calldata offerIds,
        bytes32 recipientDeploymentId,
        uint256 duration
    ) external payable nonReentrant {
        if (offerIds.length == 0) revert EmptyOfferList();
        if (!clientConfig.deploymentExists(recipientDeploymentId)) revert InvalidOffer();

        uint256 totalNativeRequired = 0;

        for (uint256 i = 0; i < offerIds.length; i++) {
            uint256 offerId = offerIds[i];
            Offer storage offer = _offers[offerId];
            (uint256 cost, address paymentToken, uint256 expires) = getCost(offerId, duration);

            if (paymentToken == address(0)) {
                totalNativeRequired += cost;
                if (msg.value < totalNativeRequired) {
                    revert InsufficientNativePayment(totalNativeRequired, msg.value);
                }
                if (cost > 0) {
                    (bool ok, ) = payable(offer.beneficiary).call{value: cost}("");
                    if (!ok) revert TransferFailed();
                }
            } else if (cost > 0) {
                IERC20(paymentToken).safeTransferFrom(msg.sender, offer.beneficiary, cost);
            }

            // Extend existing grant expiration if the buyer already holds an active grant
            IAccessPermissions.PermissionGrant memory existing = accessPermissions.getPermissions(
                offer.deploymentId,
                recipientDeploymentId,
                offer.dataId
            );
            uint256 newExpires = existing.expires > block.timestamp ? existing.expires + duration : expires;

            accessPermissions.setPermissionsAdmin(
                offer.deploymentId,
                recipientDeploymentId,
                offer.dataId,
                offer.requiredFlags,
                offer.readRoles,
                newExpires
            );

            emit OfferPurchased(
                offerId,
                msg.sender,
                recipientDeploymentId,
                offer.beneficiary,
                paymentToken,
                cost,
                newExpires
            );
        }

        // Refund any excess native token sent
        if (msg.value > totalNativeRequired) {
            (bool refundOk, ) = payable(msg.sender).call{value: msg.value - totalNativeRequired}("");
            if (!refundOk) revert TransferFailed();
        }
    }
}
