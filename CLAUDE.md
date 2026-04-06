# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

---

## Project: Chain.Giving

Chain.Giving is a **Hardhat-flavored SE-2 dApp** for charitable giving programs. Organizations create funding programs with ETH crowdfunding + ERC-1155 token distribution (vouchers, badges, tickets).

## Running Tests

```bash
# Run all contract tests
cd packages/hardhat && yarn test

# Run a single test file
cd packages/hardhat && yarn test test/CGProgram.ts

# Run with gas reporting (already enabled by default in yarn test)
REPORT_GAS=true yarn workspace @se-2/hardhat test
```

## Smart Contract Architecture

Five contracts form a hierarchy. Only deploy `CGRegistry` — it bootstraps the rest:

```
CGRegistry                  ← entry point; deployer-owned directory
  └─ CGOrganization         ← groups programs, one owner per org
       └─ CGProgram         ← orchestrates one campaign (ACTIVE → EXECUTING → COMPLETED/CANCELLED)
            ├─ CGToken      ← ERC-1155 multi-token; one per program; minted by CGProgram only
            ├─ CGCrowdfunding ← ETH escrow (UNFUNDED → FUNDED → WITHDRAWN / CANCELLED)
            └─ CGDistribution ← beneficiary list + token airdrop (DRAFT → READY → DISTRIBUTED)
```

**Factory chain** (keeps bytecode under 24 KB):
- `CGComponentFactory` — deploys `CGToken`, `CGCrowdfunding`, `CGDistribution`
- `CGProgramFactory` — deploys `CGProgram` (authorized callers only)
- Ownership of `CGProgramFactory` is transferred to `CGRegistry` post-deploy so it can authorize new orgs

**Deployment** is a single script: `packages/hardhat/deploy/01_deploy_cg_registry.ts`  
Tag: `CGRegistry` (also tags `CGProgramFactory` and `CGComponentFactory`)

## Key Design Constraints

- **`lockDistributions` flag**: when `true` on a `CGProgram`, beneficiary lists and distributions cannot change once any ETH contribution exists. Check this before allowing edits in the UI.
- **Soulbound tokens**: `CGToken` enforces per-type `transferable`/`burnable` flags. `CGDistribution` contracts are granted `authorizedTransferrer` status so they can airdrop non-transferable tokens.
- **Token types** are ERC-1155 IDs defined on `CGToken`: `maxSupply=0` → unlimited fungible, `maxSupply=1` → unique NFT, `maxSupply=N` → capped semi-fungible.
- **Execution is atomic**: `CGProgram.execute()` withdraws ETH to owner and distributes all tokens in one transaction.

## Frontend Contract Interaction Pattern

The frontend uses **hand-written ABIs** (not `deployedContracts.ts`) for the core contracts:

| File | Used for |
|------|----------|
| `packages/nextjs/contracts/cgProgramAbi.ts` | All `CGProgram` reads/writes |
| `packages/nextjs/contracts/cgOrganizationAbi.ts` | `CGOrganization` reads |
| `packages/nextjs/contracts/cgTokenAbi.ts` | `CGToken` reads/writes via `useCGTokenWrite` |

Contract calls use raw `useReadContract` / `useWriteContract` from wagmi (not SE-2 scaffold hooks), because contracts are addressed dynamically (not by name from `deployedContracts.ts`).

`CGRegistry` and `CGProgramFactory` are used via `useScaffoldReadContract` / `useScaffoldWriteContract` because they are in `deployedContracts.ts`.

## App Routes

| Route | Purpose |
|-------|---------|
| `/` | Home — shows connected wallet QR code |
| `/organizations` | List all orgs from `CGRegistry` |
| `/organization/[address]` | Org detail + program list |
| `/programs` | List all programs across all orgs |
| `/program/[address]` | Full program management UI (crowdfunding, distributions, token types) |
| `/token/[address]` | Token type viewer for a `CGToken` contract |
| `/wallet/[address]` | Wallet — shows all tokens held across programs |
