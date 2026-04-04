# Chain.Giving

**On-chain fundraising and transparent token distribution for non-profit organizations.**

> 📄 **[Read the Whitepaper (handcrafted, not vibe-coded)](docs/Chain.Giving%20Whitepaper%20v0.2.md)**

Chain.Giving enables non-profit organizations to run transparent crowdfunding campaigns on Ethereum. Donors contribute ETH, and upon reaching funding goals, beneficiaries automatically receive ERC-1155 tokens — redeemable vouchers, proof-of-participation badges, or any on-chain asset — that represent how donated funds will be deployed.

Built on [Scaffold-ETH 2](https://scaffoldeth.io) with Hardhat, Next.js, RainbowKit, Wagmi, Viem, and TypeScript.

---

## How It Works

The system is organized in three layers:

**Organization → Program → Distribution**

1. **Organizations** (`CGOrganization`) are created by the registry owner and represent a non-profit or charity. Each organization can run multiple programs.
2. **Programs** (`CGProgram`) are the core unit: each ties a crowdfunding campaign to one or more token distributions.
3. **Token Distributions** (`CGDistribution`) define which beneficiary wallets receive which ERC-1155 tokens once the program is executed.

### Program Lifecycle

```
ACTIVE → (crowdfunding funded + distributions ready) → execute() → COMPLETED
                                                     ↘ cancel()  → CANCELLED
```

- While `ACTIVE`, the owner defines token types, sets a crowdfunding target/deadline, lists beneficiaries, and marks distributions ready (tokens are pre-minted to the distribution contract).
- Contributors send ETH via `contribute()`.
- Once funded, `execute()` withdraws ETH to the owner and triggers all distributions atomically.
- If the program is cancelled, contributors can reclaim their ETH.

### Token Types (`CGToken` — ERC-1155)

Each program deploys its own `CGToken` contract. Token types are flexible:

| `maxSupply` | Behavior |
|---|---|
| `0` | Unlimited fungible token |
| `1` | Unique NFT |
| `N` | Capped supply (badge, ticket, voucher) |

Each type independently configures:
- **Transferable** — holders can freely transfer; or **soulbound** (only the program/distribution can move them)
- **Burnable** — holders can burn; or burn-disabled

---

## Smart Contracts

| Contract | Description |
|---|---|
| `CGRegistry` | Directory of all organizations; only the registry owner can create orgs |
| `CGOrganization` | Groups programs under one owner |
| `CGProgramFactory` | Factory for deploying `CGProgram` instances |
| `CGComponentFactory` | Factory for deploying `CGToken`, `CGCrowdfunding`, `CGDistribution` |
| `CGProgram` | Orchestrates crowdfunding + distributions for one campaign |
| `CGToken` | ERC-1155 multi-token contract (one per program) |
| `CGCrowdfunding` | Holds ETH contributions; tracks funding target and deadline |
| `CGDistribution` | Holds pre-minted tokens and distributes to beneficiaries on execution |

Source: `packages/hardhat/contracts/`

---

## Frontend Pages

| Route | Description |
|---|---|
| `/` | Home — connected wallet QR code and account info |
| `/organizations` | Browse all registered organizations |
| `/organization/[address]` | Organization detail and its programs |
| `/programs` | Browse all programs |
| `/program/[address]` | Program detail: token types, crowdfunding, distributions |
| `/token/[address]` | Token contract detail |
| `/wallet/[address]` | View tokens held by a wallet across all programs |
| `/debug` | SE-2 contract debugger |
| `/blockexplorer` | Local block explorer |

---

## Requirements

- [Node.js >= v20.18.3](https://nodejs.org/en/download/)
- [Yarn v1](https://classic.yarnpkg.com/en/docs/install/) or [v2+](https://yarnpkg.com/getting-started/install)
- [Git](https://git-scm.com/downloads)

---

## Development Quickstart

**1. Install dependencies**

```bash
yarn install
```

**2. Start a local Hardhat node**

```bash
yarn chain
```

**3. Deploy contracts**

```bash
yarn deploy
```

**4. Start the frontend**

```bash
yarn start
```

Visit `http://localhost:3000`.

---

## Common Commands

```bash
# Development
yarn chain          # Start local Hardhat node
yarn deploy         # Deploy contracts to local network
yarn start          # Start Next.js frontend

# Deploy a specific contract
yarn deploy --tags CGRegistry

# Code quality
yarn lint           # Lint both packages
yarn format         # Format both packages

# Testing
yarn hardhat:test   # Run Hardhat contract tests

# Build
yarn next:build     # Build the Next.js frontend
yarn compile        # Compile Solidity contracts

# Deploy to a live network
yarn deploy --network sepolia
yarn deploy --network mainnet

# Frontend deployment
yarn vercel:yolo --prod
```

---

## Project Structure

```
packages/
  hardhat/
    contracts/        # Solidity smart contracts
    deploy/           # Hardhat-deploy scripts
    test/             # Contract tests
    hardhat.config.ts
  nextjs/
    app/              # Next.js App Router pages
    components/       # Shared UI components
    hooks/            # SE-2 contract interaction hooks
    contracts/        # Auto-generated ABIs (deployedContracts.ts)
    scaffold.config.ts
docs/
  Chain.Giving Whitepaper v0.2.md
  tech-specs/
```

---

## Configuration

- **Target network**: `packages/nextjs/scaffold.config.ts`
- **Hardhat networks**: `packages/hardhat/hardhat.config.ts`
- **Frontend env / API keys**: `packages/nextjs/scaffold.config.ts`

---

## Contract Interaction (Frontend)

The frontend uses Scaffold-ETH 2 hooks for all contract interactions:

```typescript
// Read
const { data } = useScaffoldReadContract({
  contractName: "CGRegistry",
  functionName: "organizationCount",
});

// Write
const { writeContractAsync } = useScaffoldWriteContract({
  contractName: "CGProgram",
});
await writeContractAsync({ functionName: "execute" });
```

Use `useScaffoldReadContract`, `useScaffoldWriteContract`, and `useScaffoldEventHistory` from `~~/hooks/scaffold-eth`.
