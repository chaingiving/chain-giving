# Chain.Giving Smart Contracts

## PoC Scope

Minimum viable contract set to demonstrate the three core whitepaper modules — **Crowdfunding**, **Distribution**, and **Program** — on an EVM chain. The PoC intentionally defers: NFT tokens, scheduled/automatic distributions, progressive withdrawals, on-chain organization identity governance, and provider token-burn/fiat settlement.

## Contract Overview

| Contract | Purpose |
|---|---|
| `CGToken` | ERC-20 token minted by an organization for a specific program (e.g. voucher, proof of participation). One token contract per program. |
| `CGCrowdfunding` | Collects ETH donations toward a funding target. Holds funds in escrow until the target is met, then allows the organization to withdraw. Supports donor refunds on cancellation. |
| `CGDistribution` | Holds a list of beneficiary addresses and token amounts. Transitions through INACTIVE -> READY -> DISTRIBUTED. Transfers tokens to beneficiaries on execution. |
| `CGProgram` | Orchestrates one crowdfunding and one-or-more distributions. Enforces the rule that crowdfunding withdrawal and distribution execution happen together. |

## Contract Details

### 1. CGToken

Simple ERC-20 token with controlled minting. One deployment per program.

- Inherits: `ERC20`, `Ownable`
- Owner: the `CGProgram` contract (or the organization address if used standalone)

**Key functions:**

| Function | Access | Description |
|---|---|---|
| `constructor(name, symbol, owner)` | — | Deploy with token name (e.g. "Food Voucher") and symbol |
| `mint(to, amount)` | `onlyOwner` | Mint tokens to the distribution holding address |
| `burn(amount)` | any holder | Burn tokens (for provider redemption flow — future use) |

### 2. CGCrowdfunding

Manages a single fundraising campaign in ETH.

**State enum:** `UNFUNDED | FUNDED | WITHDRAWN | CANCELLED`

**Storage:**

| Field | Type | Description |
|---|---|---|
| `owner` | `address` | Organization that created the crowdfunding |
| `target` | `uint256` | Funding target in wei |
| `deadline` | `uint256` | Unix timestamp after which the campaign can be cancelled if unfunded |
| `state` | `State` | Current lifecycle state |
| `contributions` | `mapping(address => uint256)` | Per-donor contribution tracking (for refunds) |
| `totalRaised` | `uint256` | Running total of contributions |

**Key functions:**

| Function | Access | Description |
|---|---|---|
| `constructor(owner, target, deadline)` | — | Initialise in UNFUNDED state |
| `contribute()` | `payable`, anyone | Donate ETH. Reverts if past deadline or already funded/cancelled. Updates `contributions` and `totalRaised`. Transitions to FUNDED if target met. |
| `cancelContribution()` | contributor | Withdraw own contribution while state is UNFUNDED. |
| `withdraw(to)` | `onlyOwner` | Transfer full balance to `to`. Only callable when FUNDED. Transitions to WITHDRAWN. |
| `cancel()` | `onlyOwner` | Cancel the crowdfunding. Only if UNFUNDED. Transitions to CANCELLED. |
| `refund()` | contributor | Claim refund after CANCELLED state. |

**Events:** `ContributionReceived`, `ContributionCancelled`, `CrowdfundingFunded`, `CrowdfundingCancelled`, `FundsWithdrawn`, `RefundClaimed`

### 3. CGDistribution

Manages the allocation of tokens from a holding address to a list of beneficiaries.

**State enum:** `INACTIVE | READY | DISTRIBUTED`

**Storage:**

| Field | Type | Description |
|---|---|---|
| `owner` | `address` | Organization or Program contract |
| `token` | `IERC20` | The token to distribute |
| `beneficiaries` | `address[]` | List of recipient addresses |
| `amounts` | `uint256[]` | Corresponding token amounts |
| `state` | `State` | Current lifecycle state |

**Key functions:**

| Function | Access | Description |
|---|---|---|
| `constructor(owner, token)` | — | Deploy in INACTIVE state |
| `setBeneficiaries(addresses[], amounts[])` | `onlyOwner` | Set or replace the beneficiary list. Only when INACTIVE. |
| `markReady()` | `onlyOwner` | Transition to READY. Requires the contract holds enough tokens to cover all allocations. |
| `distribute()` | `onlyOwner` | Transfer tokens to all beneficiaries. Transitions to DISTRIBUTED. |

**Events:** `BeneficiariesSet`, `DistributionReady`, `TokensDistributed`

### 4. CGProgram

Top-level contract that ties crowdfunding and distributions together.

**Storage:**

| Field | Type | Description |
|---|---|---|
| `owner` | `address` | Organization that created the program |
| `name` | `string` | Human-readable program name |
| `lockDistributions` | `bool` | If `true`, all distributions must be READY before the crowdfunding can accept contributions. Set at construction, immutable. |
| `crowdfunding` | `CGCrowdfunding` | Associated crowdfunding (optional — `address(0)` if none) |
| `token` | `CGToken` | The program's token |
| `distributions` | `CGDistribution[]` | One or more distributions |
| `state` | `State` | `ACTIVE | EXECUTING | COMPLETED | CANCELLED` |

**Lock-distributions mode:**

When `lockDistributions` is `true`, the program enforces that donors can see the final beneficiary list before contributing:

- `CGCrowdfunding.contribute()` reverts unless **every** distribution in the program is in `READY` state.
- `setBeneficiaries()` and `createDistribution()` revert once the crowdfunding has received any contribution (`totalRaised > 0`).

This is enforced by `CGProgram` acting as the owner of both the crowdfunding and distribution contracts, proxying calls through modifier checks. When `lockDistributions` is `false` (the default), no additional constraints are applied — the program behaves as before.

**Key functions:**

| Function | Access | Description |
|---|---|---|
| `constructor(owner, name, lockDistributions)` | — | Create program and deploy its `CGToken`. `lockDistributions` sets the distribution-lock policy (immutable). |
| `setCrowdfunding(target, deadline)` | `onlyOwner` | Deploy and attach a `CGCrowdfunding` |
| `createDistribution()` | `onlyOwner` | Deploy a new `CGDistribution` linked to the program's token and add it to the list. Reverts if `lockDistributions` is `true` and crowdfunding has received contributions. |
| `setBeneficiaries(distributionIndex, addresses[], amounts[])` | `onlyOwner` | Proxy call to a distribution's `setBeneficiaries`. Reverts if `lockDistributions` is `true` and crowdfunding has received contributions. |
| `execute()` | `onlyOwner` | Core PoC action: withdraws crowdfunding funds to the organization, mints tokens, and distributes them to beneficiaries — all in one transaction. Requires crowdfunding FUNDED and all distributions READY. |
| `cancel()` | `onlyOwner` | Cancel the program. Cancels crowdfunding (enabling refunds) and voids distributions. |

**Events:** `ProgramCreated`, `ProgramExecuted`, `ProgramCancelled`

## Deployment Order

### Default flow (`lockDistributions = false`)

1. Organization calls `CGProgram` constructor → deploys program + token
2. Organization calls `setCrowdfunding(target, deadline)` → deploys crowdfunding
3. Organization calls `createDistribution()` (one or more times) → deploys distribution(s)
4. Organization sets beneficiaries on each distribution
5. Organization mints tokens to distribution contracts and marks them READY
6. Donors contribute to the crowdfunding
7. Once funded, organization calls `execute()` → withdraws funds + distributes tokens atomically

### Locked-distributions flow (`lockDistributions = true`)

Steps 1–5 are the same, but step 6 now **requires** all distributions to be READY. Once any donor contributes, steps 3 and 4 are blocked — the beneficiary list is frozen on-chain.

1. Organization calls `CGProgram` constructor with `lockDistributions = true`
2. Organization calls `setCrowdfunding(target, deadline)` → deploys crowdfunding
3. Organization calls `createDistribution()` (one or more times) → deploys distribution(s)
4. Organization sets beneficiaries on each distribution via `setBeneficiaries()`
5. Organization mints tokens to distribution contracts and marks them READY
6. Donors contribute to the crowdfunding — contributions revert unless all distributions are READY
7. Once funded, organization calls `execute()` → withdraws funds + distributes tokens atomically

## PoC Simplifications

| Whitepaper feature | PoC approach | Future enhancement |
|---|---|---|
| Fungible + non-fungible tokens | ERC-20 only | Add ERC-721 / ERC-1155 tokens |
| Scheduled distributions | Manual trigger only | Add time-based auto-execution |
| Progressive withdrawal | Full withdrawal only | Add milestone-based partial withdrawal |
| Organization identity / governance | Any address can be an organization | Add on-chain registry with governance vetting |
| Provider burn / fiat settlement | Not implemented | Add provider role, burn-to-redeem, off-chain settlement hooks |
| Multiple crowdfundings per program | Zero or one | Support multiple funding rounds |
| Completion conditions | `wait_until_funded` only | Add `wait_until_end_date` |
| Donation currency | ETH only | Add ERC-20 stablecoin support |

## File Structure

```
packages/hardhat/contracts/
  CGToken.sol
  CGCrowdfunding.sol
  CGDistribution.sol
  CGProgram.sol
```
