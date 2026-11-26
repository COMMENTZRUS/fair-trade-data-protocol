import { ethers } from "ethers";
import { ACCESS_PERMISSIONS_ABI, CLIENT_CONFIG_ABI } from "@ftdp/sdk";

export interface PermissionGrantView {
  requiredFlags: bigint;
  readRoles: bigint;
  expires: bigint;
}

export interface ChainBridge {
  hasWriteRole(deploymentId: string, signer: string): Promise<boolean>;
  getDeploymentIdForKey(keyAddress: string): Promise<string>;
  getPermissions(
    grantorDeploymentId: string,
    granteeDeploymentId: string,
    dataId: string
  ): Promise<PermissionGrantView>;
  canRead(params: {
    grantee: string;
    grantorDeploymentId: string;
    uidHash: string;
    dataId: string;
    merkleFlags: bigint;
    merkleProof: string[];
  }): Promise<boolean>;
  commitOptInMerkleRoot(deploymentId: string, merkleRoot: string): Promise<{ txHash: string }>;
}

const EXTENDED_ACCESS_ABI = [
  ...ACCESS_PERMISSIONS_ABI,
  "function getPermissions(bytes32 grantorDeploymentId, bytes32 granteeDeploymentId, bytes32 dataId) view returns (uint256 requiredFlags, uint256 readRoles, uint256 expires)",
  "event AccessSet(bytes32 indexed grantorDeploymentId, bytes32 indexed granteeDeploymentId, bytes32 indexed dataId, uint256 requiredFlags, uint256 readRoles, uint256 expires)",
];

const EXTENDED_CONFIG_ABI = [
  ...CLIENT_CONFIG_ABI,
  "function getDeploymentId(address key) view returns (bytes32)",
];

export class EthersChainBridge implements ChainBridge {
  private readonly clientConfig: ethers.Contract;
  private readonly accessPermissions: ethers.Contract;
  private readonly accessPermissionsWriter?: ethers.Contract;

  constructor(params: {
    rpcUrl: string;
    clientConfigAddress: string;
    accessPermissionsAddress: string;
    operatorPrivateKey?: string;
  }) {
    const provider = new ethers.JsonRpcProvider(params.rpcUrl);
    this.clientConfig = new ethers.Contract(params.clientConfigAddress, EXTENDED_CONFIG_ABI, provider);
    this.accessPermissions = new ethers.Contract(params.accessPermissionsAddress, EXTENDED_ACCESS_ABI, provider);
    if (params.operatorPrivateKey) {
      const signer = new ethers.Wallet(params.operatorPrivateKey, provider);
      this.accessPermissionsWriter = this.accessPermissions.connect(signer) as ethers.Contract;
    }
  }

  async hasWriteRole(deploymentId: string, signer: string): Promise<boolean> {
    const roleWrite = await this.clientConfig.ROLE_WRITE();
    const roleAdmin = await this.clientConfig.ROLE_ADMIN();
    const [canWrite, isAdmin] = await Promise.all([
      this.clientConfig.hasRole(deploymentId, signer, roleWrite),
      this.clientConfig.hasRole(deploymentId, signer, roleAdmin),
    ]);
    return Boolean(canWrite || isAdmin);
  }

  async getDeploymentIdForKey(keyAddress: string): Promise<string> {
    return String(await this.clientConfig.getDeploymentId(keyAddress));
  }

  async getPermissions(
    grantorDeploymentId: string,
    granteeDeploymentId: string,
    dataId: string
  ): Promise<PermissionGrantView> {
    const res = await this.accessPermissions.getPermissions(grantorDeploymentId, granteeDeploymentId, dataId);
    return {
      requiredFlags: BigInt(res.requiredFlags ?? res[0] ?? 0n),
      readRoles: BigInt(res.readRoles ?? res[1] ?? 0n),
      expires: BigInt(res.expires ?? res[2] ?? 0n),
    };
  }

  async canRead(params: {
    grantee: string;
    grantorDeploymentId: string;
    uidHash: string;
    dataId: string;
    merkleFlags: bigint;
    merkleProof: string[];
  }): Promise<boolean> {
    return Boolean(
      await this.accessPermissions.canRead(
        params.grantee,
        params.grantorDeploymentId,
        params.uidHash,
        params.dataId,
        params.merkleFlags,
        params.merkleProof
      )
    );
  }

  async commitOptInMerkleRoot(deploymentId: string, merkleRoot: string): Promise<{ txHash: string }> {
    if (!this.accessPermissionsWriter) {
      throw new Error("FTDP_OPERATOR_PRIVATE_KEY not configured on gateway for setOptInMerkleRoot");
    }
    const tx = await this.accessPermissionsWriter.setOptInMerkleRoot(deploymentId, merkleRoot);
    const receipt = await tx.wait();
    return { txHash: receipt?.hash || tx.hash };
  }
}
