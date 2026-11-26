import { Contract, ContractRunner, Signature, Signer } from "ethers";
import { HolderShareUpdate } from "./types";

export const ADMIN_SPLITTER_ABI = [
  "function owner() view returns (address)",
  "function upstreamSplitter() view returns (address)",
  "function shares(address shareholder) view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function totalReceived(address token) view returns (uint256)",
  "function totalAllotment(address shareholder, address token) view returns (uint256)",
  "function availableAllotment(address shareholder, address token) view returns (uint256)",
  "function withdrawn(address shareholder, address token) view returns (uint256)",
  "function supportedTokensAll() view returns (address[])",
  "function beneficiary(address user) view returns (address)",
  "function nonces(address owner) view returns (uint256)",
  "function setShares(address shareholder, uint256 newShares)",
  "function setSharesMulti((address shareholder, uint256 shares)[] hs)",
  "function setSharesMultiMeta((address shareholder, uint256 shares)[] hsm, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function setBeneficiary(address beneficiary_)",
  "function setBeneficiaryMeta(address user, address beneficiary_, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function withdraw(address shareholder, address tokenAddress, uint256 amount)",
  "function withdrawAll(address shareholder, address tokenAddress) returns (uint256)",
];

export const DATA_UNION_FACTORY_ABI = [
  "function allUnions(uint256 idx) view returns (address)",
  "function getUnionCount() view returns (uint256)",
  "function isDataUnion(address addr) view returns (bool)",
  "function unionInfo(address addr) view returns (address splitter, address sharesToken, address upstreamSplitter, address creator, uint8 kind, string name, uint256 createdAt)",
  "function createAdminDataUnion(string salt, string name, address admin, address[] tokens, address upstreamSplitter, uint256 configOptions) returns (address)",
  "function createERC20DataUnion(string salt, string tokenName, string tokenSymbol, uint256 initialSupply, address recipient, address minter, address[] tokens, address upstreamSplitter, uint256 configOptions) returns (address, address)",
  "function createVotesDataUnion(string salt, string tokenName, string tokenSymbol, uint256 initialSupply, address recipient, address minter, address[] tokens, address upstreamSplitter, uint256 configOptions) returns (address, address)",
];

export const MARKET_ABI = [
  "function nextOfferId() view returns (uint256)",
  "function getOffer(uint256 offerId) view returns (uint256 id, bytes32 deploymentId, bytes32 dataId, address paymentToken, uint256 pricePerSecond, uint256 minDuration, uint256 maxDuration, address beneficiary, uint256 requiredFlags, uint256 readRoles, bool active)",
  "function getCost(uint256 offerId, uint256 duration) view returns (uint256 cost, address paymentToken, uint256 expires)",
  "function addOffer(bytes32 deploymentId, bytes32 dataId, address paymentToken, uint256 pricePerSecond, uint256 minDuration, uint256 maxDuration, address beneficiary, uint256 requiredFlags, uint256 readRoles) returns (uint256)",
  "function purchase(uint256[] offerIds, bytes32 recipientDeploymentId, uint256 duration) payable",
];

export const ACCESS_PERMISSIONS_ABI = [
  "function optInMerkleRoots(bytes32 deploymentId) view returns (bytes32)",
  "function setOptInMerkleRoot(bytes32 deploymentId, bytes32 merkleRoot)",
  "function canRead(address grantee, bytes32 grantorDeploymentId, bytes32 uid, bytes32 dataId, uint256 merkleFlags, bytes32[] merkleProof) view returns (bool)",
];

export const CLIENT_CONFIG_ABI = [
  "function ROLE_ADMIN() view returns (uint256)",
  "function ROLE_GRANT() view returns (uint256)",
  "function ROLE_READ() view returns (uint256)",
  "function ROLE_WRITE() view returns (uint256)",
  "function registerDeployment(bytes32 deploymentId, address adminKey, uint256 expires)",
  "function setKey(bytes32 deploymentId, address key, uint256 roles, uint256 expires)",
  "function setKeyMeta(bytes32 deploymentId, address signer, address key, uint256 roles, uint256 expires, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function nonces(address owner) view returns (uint256)",
  "function hasRole(bytes32 deploymentId, address key, uint256 role) view returns (bool)",
];

export interface SignedMetaPayload {
  deadline: bigint;
  v: number;
  r: string;
  s: string;
}

/**
 * Signs an EIP-712 `SetSharesMulti` payload for AdminControlledSplitter.setSharesMultiMeta().
 */
export async function signSetSharesMultiMeta(
  signer: Pick<Signer, "signTypedData">,
  params: {
    splitterAddress: string;
    chainId: bigint;
    updates: HolderShareUpdate[];
    nonce: bigint;
    deadline: bigint;
  }
): Promise<SignedMetaPayload> {
  const sigHex = await signer.signTypedData(
    {
      name: "FTDPDataUnion",
      version: "1",
      chainId: params.chainId,
      verifyingContract: params.splitterAddress,
    },
    {
      HolderAndShares: [
        { name: "shareholder", type: "address" },
        { name: "shares", type: "uint256" },
      ],
      SetSharesMulti: [
        { name: "updates", type: "HolderAndShares[]" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    {
      updates: params.updates,
      nonce: params.nonce,
      deadline: params.deadline,
    }
  );
  const { v, r, s } = Signature.from(sigHex);
  return { deadline: params.deadline, v, r, s };
}

/**
 * Signs an EIP-712 `SetBeneficiary` payload for gasless payout routing.
 */
export async function signSetBeneficiaryMeta(
  signer: Pick<Signer, "signTypedData">,
  params: {
    splitterAddress: string;
    chainId: bigint;
    user: string;
    beneficiary: string;
    nonce: bigint;
    deadline: bigint;
  }
): Promise<SignedMetaPayload> {
  const sigHex = await signer.signTypedData(
    {
      name: "FTDPDataUnion",
      version: "1",
      chainId: params.chainId,
      verifyingContract: params.splitterAddress,
    },
    {
      SetBeneficiary: [
        { name: "user", type: "address" },
        { name: "beneficiary", type: "address" },
        { name: "deadline", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    },
    {
      user: params.user,
      beneficiary: params.beneficiary,
      deadline: params.deadline,
      nonce: params.nonce,
    }
  );
  const { v, r, s } = Signature.from(sigHex);
  return { deadline: params.deadline, v, r, s };
}

export class DataUnionClient {
  public readonly factory?: Contract;
  public readonly market?: Contract;
  public readonly accessPermissions?: Contract;
  public readonly clientConfig?: Contract;

  constructor(
    public readonly runner: ContractRunner,
    addresses: {
      factory?: string;
      market?: string;
      accessPermissions?: string;
      clientConfig?: string;
    }
  ) {
    if (addresses.factory) this.factory = new Contract(addresses.factory, DATA_UNION_FACTORY_ABI, runner);
    if (addresses.market) this.market = new Contract(addresses.market, MARKET_ABI, runner);
    if (addresses.accessPermissions) {
      this.accessPermissions = new Contract(addresses.accessPermissions, ACCESS_PERMISSIONS_ABI, runner);
    }
    if (addresses.clientConfig) {
      this.clientConfig = new Contract(addresses.clientConfig, CLIENT_CONFIG_ABI, runner);
    }
  }

  splitter(splitterAddress: string): Contract {
    return new Contract(splitterAddress, ADMIN_SPLITTER_ABI, this.runner);
  }
}
