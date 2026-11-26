// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./interfaces/InitializableSplitter.sol";
import "./interfaces/InitializableShare.sol";
import "./splitter/AdminControlledSplitter.sol";
import "./splitter/ERC20SharesSplitter.sol";
import "./splitter/DynamicSplitterShare.sol";
import "./splitter/VotesSplitterShare.sol";

/// @title DataUnionFactory
/// @notice Deterministic EIP-1167 factory & on-chain registry for FTDP Data Unions
///         (Tier-1 Root Unions and cascading Tier-2 App Sub-Splitters).
contract DataUnionFactory is Ownable {
    enum UnionKind {
        ADMIN_CONTROLLED,
        ERC20_SHARES,
        VOTES_GOVERNED
    }

    struct DataUnionInfo {
        address splitter;
        address sharesToken; // address(0) for ADMIN_CONTROLLED
        address upstreamSplitter;
        address creator;
        UnionKind kind;
        string name;
        uint256 createdAt;
    }

    address public immutable adminSplitterImpl;
    address public immutable erc20SplitterImpl;
    address public immutable dynamicShareImpl;
    address public immutable votesShareImpl;

    address[] public defaultTrackedTokens;
    address[] public allUnions;
    mapping(address => bool) public isDataUnion;
    mapping(address => DataUnionInfo) public unionInfo;

    event DefaultTrackedTokensUpdated(address[] tokens);
    event DataUnionCreated(
        address indexed splitter,
        address indexed sharesToken,
        address indexed upstreamSplitter,
        UnionKind kind,
        string name,
        address creator
    );

    constructor(address[] memory defaultTrackedTokens_, address initialOwner) Ownable(initialOwner) {
        // Deploy non-reinitializable implementation singletons (owner/initializer locked to factory)
        adminSplitterImpl = address(new AdminControlledSplitter(address(this)));
        erc20SplitterImpl = address(new ERC20SharesSplitter());
        dynamicShareImpl = address(new DynamicSplitterShare());
        votesShareImpl = address(new VotesSplitterShare());

        defaultTrackedTokens = defaultTrackedTokens_;
        emit DefaultTrackedTokensUpdated(defaultTrackedTokens_);
    }

    function setDefaultTrackedTokens(address[] calldata tokens) external onlyOwner {
        defaultTrackedTokens = tokens;
        emit DefaultTrackedTokensUpdated(tokens);
    }

    function getUnionCount() external view returns (uint256) {
        return allUnions.length;
    }

    function predictAddress(
        address implementation,
        address creator,
        string calldata salt
    ) external view returns (address) {
        bytes32 derivedSalt = keccak256(abi.encodePacked(creator, salt));
        return Clones.predictDeterministicAddress(implementation, derivedSalt, address(this));
    }

    /// @notice Deploy a contribution-weighted AdminControlledSplitter Data Union (Tier-1 Root or Tier-2 Sub-Splitter).
    function createAdminDataUnion(
        string calldata salt,
        string calldata name,
        address admin,
        address[] calldata tokens,
        address upstreamSplitter,
        uint256 configOptions
    ) external returns (address splitter) {
        address[] memory splitTokens = _resolveTokens(tokens);
        bytes32 derivedSalt = keccak256(abi.encodePacked(msg.sender, salt));
        splitter = Clones.cloneDeterministic(adminSplitterImpl, derivedSalt);
        InitializableSplitter(splitter).init(admin, splitTokens, upstreamSplitter, configOptions);

        _registerUnion(splitter, address(0), upstreamSplitter, UnionKind.ADMIN_CONTROLLED, name);
    }

    /// @notice Deploy a tokenized ERC-20 Data Union (`ERC20SharesSplitter` + `DynamicSplitterShare`).
    function createERC20DataUnion(
        string memory salt,
        string memory tokenName,
        string memory tokenSymbol,
        uint256 initialSupply,
        address recipient,
        address minter,
        address[] memory tokens,
        address upstreamSplitter,
        uint256 configOptions
    ) external returns (address splitter, address sharesToken) {
        (splitter, sharesToken) = _cloneAndInitSplitter(
            salt,
            erc20SplitterImpl,
            dynamicShareImpl,
            tokens,
            upstreamSplitter,
            configOptions
        );
        InitializableShare(sharesToken).init(splitter, tokenName, tokenSymbol, initialSupply, recipient, minter);
        _registerUnion(splitter, sharesToken, upstreamSplitter, UnionKind.ERC20_SHARES, tokenName);
    }

    /// @notice Deploy a DAO-governed ERC20Votes Data Union (`ERC20SharesSplitter` + `VotesSplitterShare`).
    function createVotesDataUnion(
        string memory salt,
        string memory tokenName,
        string memory tokenSymbol,
        uint256 initialSupply,
        address recipient,
        address minter,
        address[] memory tokens,
        address upstreamSplitter,
        uint256 configOptions
    ) external returns (address splitter, address sharesToken) {
        (splitter, sharesToken) = _cloneAndInitSplitter(
            salt,
            erc20SplitterImpl,
            votesShareImpl,
            tokens,
            upstreamSplitter,
            configOptions
        );
        InitializableShare(sharesToken).init(splitter, tokenName, tokenSymbol, initialSupply, recipient, minter);
        _registerUnion(splitter, sharesToken, upstreamSplitter, UnionKind.VOTES_GOVERNED, tokenName);
    }

    function _cloneAndInitSplitter(
        string memory salt,
        address splitterImpl,
        address shareImpl,
        address[] memory tokens,
        address upstreamSplitter,
        uint256 configOptions
    ) internal returns (address splitter, address sharesToken) {
        address[] memory splitTokens = _resolveTokens(tokens);
        bytes32 derivedSalt = keccak256(abi.encodePacked(msg.sender, salt));
        splitter = Clones.cloneDeterministic(splitterImpl, derivedSalt);
        sharesToken = Clones.cloneDeterministic(shareImpl, derivedSalt);
        InitializableSplitter(splitter).init(sharesToken, splitTokens, upstreamSplitter, configOptions);
    }

    function _resolveTokens(address[] memory tokens) internal view returns (address[] memory) {
        if (tokens.length > 0) {
            return tokens;
        }
        if (defaultTrackedTokens.length == 0) revert EmptyTokenList();
        return defaultTrackedTokens;
    }

    function _registerUnion(
        address splitter,
        address sharesToken,
        address upstreamSplitter,
        UnionKind kind,
        string memory name
    ) internal {
        isDataUnion[splitter] = true;
        unionInfo[splitter] = DataUnionInfo({
            splitter: splitter,
            sharesToken: sharesToken,
            upstreamSplitter: upstreamSplitter,
            creator: msg.sender,
            kind: kind,
            name: name,
            createdAt: block.timestamp
        });
        allUnions.push(splitter);

        emit DataUnionCreated(splitter, sharesToken, upstreamSplitter, kind, name, msg.sender);
    }
}
