# Deploying Your Own Instance

The program IDs in this bundle are **devnet-only** demo deployments. They are
upgradeable, and the upgrade authority is held by the original author, not
you. They do not exist on mainnet.

**Before using real funds, deploy your own programs/contracts** so that you
control the program IDs and upgrade authority. Do not point production code at
the devnet program IDs below.

| Program | Devnet ID (demo only) | Location |
|---|---|---|
| Splitter (SPL / transfer-hook) | `5L2JmoDTzvb16VfBeNozP8jZBUjQUaA4JB4FzrmqTpLy` | `multisplitter-solana-spl` |
| Splitter (admin-controlled) | `AufGGM2SdGnPgu1cVLZWwwjKM7BUWosFiEmQ6jYBNnWm` | `multisplitter-solana-admin` |
| Transfer hook (referenced by `scripts/transfer.ts` only) | `EpzDyxiALMpGSBzD32HKmuA7w4cbHq1PeaV7XsZiWPKK` | not included |

---

## Solana

Toolchain: Anchor 0.32.1 (`multisplitter-solana-spl`), Anchor 0.30.1
(`multisplitter-solana-admin`), Solana CLI, Node/Yarn.

### 1. Generate your own program ID

From the program directory (`multisplitter-solana-spl` or
`multisplitter-solana-admin`):

```sh
yarn install
anchor build          # creates target/deploy/multi_splitter_solana-keypair.json
anchor keys sync      # writes the new ID into declare_id!() and Anchor.toml
anchor build          # rebuild with the new ID
```

Keep `target/deploy/*-keypair.json` safe. It determines your program address.

### 2. Configure the cluster

In `Anchor.toml`, add a section for the target cluster and set the provider:

```toml
[programs.mainnet]
multi_splitter_solana = "<YOUR_PROGRAM_ID>"

[provider]
cluster = "mainnet"            # or a custom RPC URL
wallet = "~/.config/solana/id.json"   # your deployer / upgrade-authority wallet
```

### 3. Deploy

```sh
anchor deploy --provider.cluster mainnet
```

Consider transferring upgrade authority to a multisig, or making the program
immutable, once it is final:

```sh
solana program set-upgrade-authority <YOUR_PROGRAM_ID> --new-upgrade-authority <MULTISIG>
# or
solana program set-upgrade-authority <YOUR_PROGRAM_ID> --final
```

### 4. Fill in script placeholders (`multisplitter-solana-spl/scripts/`)

- `deploy-splitter.ts`: set `OWNER` (currently `REPLACE_WITH_OWNER_PUBKEY`)
  and `TEST1_MINT` / `SPLIT_MINTS` to the tokens you want to split.
- `deploy-devnet.ts`: set `RECIPIENT` (currently `REPLACE_WITH_RECIPIENT_PUBKEY`).
- `transfer.ts`: update `SPLITTER_PROGRAM_ID` and `HOOK_PROGRAM_ID` to your
  deployed IDs.

The scripts will throw on startup until the placeholders are replaced.

### 5. Update the GUI (`multisplitter-solana-gui`)

- Copy the new IDL and types from the program build:
  - `target/idl/multi_splitter_solana.json` → `src/solana/idl/multi_splitter_solana.json`
  - `target/types/multi_splitter_solana.ts` → `src/solana/types/multi_splitter_solana.ts`
- `src/App.tsx`: change `DEVNET_URI` to your mainnet RPC endpoint, and update
  the "Set wallet to Solana devnet" notice.
- Remove `?cluster=devnet` from explorer links in `src/SolExplorerLink.tsx`,
  `src/UserStats.tsx`, and `src/SplitterStats.tsx`.
- Align `@coral-xyz/anchor` in `package.json` with the Anchor version used to
  build the program.

---

## Ethereum / EVM (`multisplitter-eth`)

No deployments are configured; `hardhat.config.ts` has no networks.

1. Add your network(s) to `hardhat.config.ts` (RPC URL and deployer key via
   environment variables; do not commit keys). `.env` is already gitignored.
2. Run the tests: `npx hardhat test`.
3. Write a deploy script (e.g. Hardhat Ignition or `scripts/deploy.ts`) for the
   splitter variant(s) you need (see `contracts/splitter/`), then deploy.
4. Verify the contracts on the block explorer.

### GUI (`multisplitter-eth-gui`)

- `src/chainConfig.ts`: replace `DEPLOYED_ADDRESS` with your deployed address
  for each chain you support, and add entries for any other chain IDs.
- If you changed the contracts, regenerate `src/typechain-types` from the
  Hardhat build (`npx hardhat compile` produces `typechain-types/`).

---

## Checklist before real funds

- [ ] Your own program IDs / contract addresses everywhere (no demo IDs remain)
- [ ] Upgrade authority / ownership held by a wallet or multisig you control
- [ ] RPC endpoints and explorer links point at the intended network
- [ ] Placeholders (`REPLACE_WITH_*`, `DEPLOYED_ADDRESS`) all filled in
- [ ] Independent security review of the contracts/programs
