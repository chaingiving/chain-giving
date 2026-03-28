/**
 * E2E script: runs comprehensive Chain.Giving flows on a local Hardhat node.
 *
 * Covers:
 *   1. Happy-path with fungible (unlimited supply) tokens
 *   2. Multi-token-type program (fungible + capped badge)
 *   3. NFT distribution (maxSupply = 1)
 *   4. Cancellation with donor refunds
 *   5. ExceedsTotalSupply aggregate cap enforcement
 *   6. Lock-distributions mode enforcement
 *
 * Prerequisites: `yarn chain` running in another terminal, then `yarn deploy`.
 * Usage:        `yarn e2e`  (or `npx hardhat run scripts/e2e.ts`)
 */
import { ethers } from "hardhat";
import { Signer } from "ethers";
import { CGProgram, CGToken, CGCrowdfunding } from "../typechain-types";

const TX_OVERRIDES = { gasLimit: 10_000_000 } as const;

const ProgramState = { ACTIVE: 0n, EXECUTING: 1n, COMPLETED: 2n, CANCELLED: 3n } as const;
const CrowdfundingState = { UNFUNDED: 0n, FUNDED: 1n, WITHDRAWN: 2n, CANCELLED: 3n } as const;

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`   FAIL: ${msg}`);
    failed++;
  } else {
    console.log(`   OK: ${msg}`);
    passed++;
  }
}

/**
 * Expect a call to revert. Pass a callback that sends and waits for the tx.
 * The revert may occur at gas-estimation, send, or wait — this handles all cases.
 * Note: With interval mining (auto: false), ethers may not decode the specific
 * custom error name from the receipt. We verify the revert happened; specific
 * error names are validated in the unit test suite.
 */
async function expectRevert(fn: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await fn();
    assert(false, `${label} — expected revert but succeeded`);
  } catch {
    assert(true, label);
  }
}

async function deployProgram(owner: Signer, name: string, lockDistributions: boolean): Promise<CGProgram> {
  // Deploy the unified component factory
  const componentFactoryF = await ethers.getContractFactory("CGComponentFactory", owner);
  const componentFactory = await componentFactoryF.deploy(TX_OVERRIDES);
  await componentFactory.waitForDeployment();

  const factory = await ethers.getContractFactory("CGProgram", owner);
  const program = await factory.deploy(
    await owner.getAddress(),
    name,
    lockDistributions,
    await componentFactory.getAddress(),
    TX_OVERRIDES,
  );
  await program.waitForDeployment();
  return program as unknown as CGProgram;
}

async function getToken(program: CGProgram): Promise<CGToken> {
  const tokenAddr = await program.token();
  return ethers.getContractAt("CGToken", tokenAddr) as unknown as CGToken;
}

async function getCrowdfunding(program: CGProgram): Promise<CGCrowdfunding> {
  const cfAddr = await program.crowdfunding();
  return ethers.getContractAt("CGCrowdfunding", cfAddr) as unknown as CGCrowdfunding;
}

async function futureDeadline(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  if (!block) throw new Error("Failed to fetch latest block");
  return block.timestamp + 7 * 24 * 60 * 60;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Scenario 1 — Happy-path with fungible tokens (unlimited supply)
// ═══════════════════════════════════════════════════════════════════════════════
async function scenario1(signers: Signer[]) {
  const [owner, donor1, donor2, beneficiary1, beneficiary2] = signers;
  console.log("\n━━━ Scenario 1: Happy-path with fungible tokens ━━━\n");

  const program = await deployProgram(owner, "Fungible Flow", false);
  console.log("   Program deployed at:", await program.getAddress());

  const token = await getToken(program);

  // Define a fungible token type (unlimited supply)
  await (await program.defineTokenType("Food Voucher", "FOOD", 0, "", TX_OVERRIDES)).wait();
  const tokenId = 0n;
  console.log("   Defined token type: Food Voucher (FOOD), tokenId=0, unlimited supply");

  // Set crowdfunding
  const TARGET = ethers.parseEther("10");
  await (await program.setCrowdfunding(TARGET, await futureDeadline(), TX_OVERRIDES)).wait();
  console.log("   Crowdfunding at:", await program.crowdfunding());

  // Create 2 distributions for the same token type
  await (await program.createDistribution(tokenId, TX_OVERRIDES)).wait();
  await (await program.createDistribution(tokenId, TX_OVERRIDES)).wait();

  // Set beneficiaries (raw integer amounts)
  const AMOUNT_B1 = 5000n;
  const AMOUNT_B2 = 3000n;
  const b1Addr = await beneficiary1.getAddress();
  const b2Addr = await beneficiary2.getAddress();
  await (await program.setBeneficiaries(0, [b1Addr], [AMOUNT_B1], TX_OVERRIDES)).wait();
  await (await program.setBeneficiaries(1, [b2Addr], [AMOUNT_B2], TX_OVERRIDES)).wait();
  console.log("   Beneficiaries set: B1=5000 FOOD, B2=3000 FOOD");

  // Mark distributions ready (mints tokens)
  await (await program.markDistributionReady(0, TX_OVERRIDES)).wait();
  await (await program.markDistributionReady(1, TX_OVERRIDES)).wait();
  console.log("   Distributions marked ready (tokens minted)");

  // Donors contribute
  await (await program.connect(donor1).contribute({ value: ethers.parseEther("7"), ...TX_OVERRIDES })).wait();
  await (await program.connect(donor2).contribute({ value: ethers.parseEther("3"), ...TX_OVERRIDES })).wait();
  console.log("   Donors contributed: 7 + 3 = 10 ETH");

  // Execute
  const ownerAddr = await owner.getAddress();
  const ownerBalBefore = await ethers.provider.getBalance(ownerAddr);
  const tx = await program.execute(TX_OVERRIDES);
  const receipt = await tx.wait();
  const gasCost = receipt!.gasUsed * receipt!.gasPrice;
  const ownerBalAfter = await ethers.provider.getBalance(ownerAddr);
  const fundsReceived = ownerBalAfter - ownerBalBefore + gasCost;

  // Verify
  assert((await program.state()) === ProgramState.COMPLETED, "Program state is COMPLETED");
  assert((await token.balanceOf(b1Addr, tokenId)) === AMOUNT_B1, `Beneficiary1 received ${AMOUNT_B1} FOOD`);
  assert((await token.balanceOf(b2Addr, tokenId)) === AMOUNT_B2, `Beneficiary2 received ${AMOUNT_B2} FOOD`);
  assert(fundsReceived === TARGET, "Owner received exactly 10 ETH");
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Scenario 2 — Multi-token-type (fungible + capped badge)
// ═══════════════════════════════════════════════════════════════════════════════
async function scenario2(signers: Signer[]) {
  const [owner, donor1, , beneficiary1, beneficiary2] = signers;
  console.log("\n━━━ Scenario 2: Multi-token-type (fungible + capped badge) ━━━\n");

  const program = await deployProgram(owner, "Multi Token", false);
  const token = await getToken(program);

  // Define two token types
  await (await program.defineTokenType("Meal Voucher", "MEAL", 0, "", TX_OVERRIDES)).wait();
  const mealId = 0n;
  await (await program.defineTokenType("Volunteer Badge", "BADGE", 50, "ipfs://badge-meta", TX_OVERRIDES)).wait();
  const badgeId = 1n;
  console.log("   Defined: MEAL (unlimited), BADGE (maxSupply=50)");

  // Verify token types via view function
  const types = await program.getTokenTypes();
  assert(types.length === 2, "getTokenTypes returns 2 types");
  assert(types[0].maxSupply === 0n, "MEAL has unlimited supply");
  assert(types[1].maxSupply === 50n, "BADGE has maxSupply=50");
  assert(types[1].uri === "ipfs://badge-meta", "BADGE has correct URI");

  // Set crowdfunding
  const TARGET = ethers.parseEther("5");
  await (await program.setCrowdfunding(TARGET, await futureDeadline(), TX_OVERRIDES)).wait();

  // Create distributions: one for meals, one for badges
  await (await program.createDistribution(mealId, TX_OVERRIDES)).wait();
  await (await program.createDistribution(badgeId, TX_OVERRIDES)).wait();

  // Set beneficiaries
  const b1Addr = await beneficiary1.getAddress();
  const b2Addr = await beneficiary2.getAddress();
  await (await program.setBeneficiaries(0, [b1Addr, b2Addr], [100n, 200n], TX_OVERRIDES)).wait();
  await (await program.setBeneficiaries(1, [b1Addr, b2Addr], [1n, 1n], TX_OVERRIDES)).wait();
  console.log("   Beneficiaries set for both distributions");

  // Mark ready + fund + execute
  await (await program.markDistributionReady(0, TX_OVERRIDES)).wait();
  await (await program.markDistributionReady(1, TX_OVERRIDES)).wait();
  await (await program.connect(donor1).contribute({ value: TARGET, ...TX_OVERRIDES })).wait();
  await (await program.execute(TX_OVERRIDES)).wait();

  // Verify
  assert((await program.state()) === ProgramState.COMPLETED, "Program state is COMPLETED");
  assert((await token.balanceOf(b1Addr, mealId)) === 100n, "B1 got 100 MEAL");
  assert((await token.balanceOf(b2Addr, mealId)) === 200n, "B2 got 200 MEAL");
  assert((await token.balanceOf(b1Addr, badgeId)) === 1n, "B1 got 1 BADGE");
  assert((await token.balanceOf(b2Addr, badgeId)) === 1n, "B2 got 1 BADGE");

  // Verify totalMinted updates
  const typesAfter = await program.getTokenTypes();
  assert(typesAfter[0].totalMinted === 300n, "MEAL totalMinted=300");
  assert(typesAfter[1].totalMinted === 2n, "BADGE totalMinted=2");
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Scenario 3 — NFT distribution (maxSupply = 1, unique per beneficiary)
// ═══════════════════════════════════════════════════════════════════════════════
async function scenario3(signers: Signer[]) {
  const [owner, donor1, , beneficiary1] = signers;
  console.log("\n━━━ Scenario 3: NFT distribution (maxSupply=1) ━━━\n");

  const program = await deployProgram(owner, "NFT Program", false);
  const token = await getToken(program);

  // Define a unique NFT type
  await (await program.defineTokenType("Certificate", "CERT", 1, "ipfs://cert-meta", TX_OVERRIDES)).wait();
  const nftId = 0n;
  console.log("   Defined: CERT (maxSupply=1, NFT)");

  // Set crowdfunding
  await (await program.setCrowdfunding(ethers.parseEther("1"), await futureDeadline(), TX_OVERRIDES)).wait();

  // Create distribution — one beneficiary gets the unique token
  await (await program.createDistribution(nftId, TX_OVERRIDES)).wait();
  const b1Addr = await beneficiary1.getAddress();
  await (await program.setBeneficiaries(0, [b1Addr], [1n], TX_OVERRIDES)).wait();
  console.log("   Single beneficiary gets the unique NFT");

  // Mark ready, fund, execute
  await (await program.markDistributionReady(0, TX_OVERRIDES)).wait();
  await (await program.connect(donor1).contribute({ value: ethers.parseEther("1"), ...TX_OVERRIDES })).wait();
  await (await program.execute(TX_OVERRIDES)).wait();

  // Verify
  assert((await program.state()) === ProgramState.COMPLETED, "Program state is COMPLETED");
  assert((await token.balanceOf(b1Addr, nftId)) === 1n, "Beneficiary1 holds the NFT");

  // Verify the token type is fully minted
  const types = await program.getTokenTypes();
  assert(types[0].totalMinted === 1n, "CERT totalMinted=1 (fully minted)");
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Scenario 4 — Cancellation with donor refunds
// ═══════════════════════════════════════════════════════════════════════════════
async function scenario4(signers: Signer[]) {
  const [owner, donor1, donor2] = signers;
  console.log("\n━━━ Scenario 4: Cancellation with donor refunds ━━━\n");

  const program = await deployProgram(owner, "Cancel Flow", false);

  // Set crowdfunding
  await (await program.setCrowdfunding(ethers.parseEther("10"), await futureDeadline(), TX_OVERRIDES)).wait();
  const cf = await getCrowdfunding(program);

  // Donors contribute (but not enough to reach target)
  const DONATION_1 = ethers.parseEther("3");
  const DONATION_2 = ethers.parseEther("2");
  await (await program.connect(donor1).contribute({ value: DONATION_1, ...TX_OVERRIDES })).wait();
  await (await program.connect(donor2).contribute({ value: DONATION_2, ...TX_OVERRIDES })).wait();
  console.log("   Donors contributed: 3 + 2 = 5 ETH (under 10 ETH target)");

  assert((await cf.state()) === CrowdfundingState.UNFUNDED, "Crowdfunding is still UNFUNDED");

  // Owner cancels the program
  await (await program.cancel(TX_OVERRIDES)).wait();
  assert((await program.state()) === ProgramState.CANCELLED, "Program state is CANCELLED");
  assert((await cf.state()) === CrowdfundingState.CANCELLED, "Crowdfunding state is CANCELLED");
  console.log("   Program and crowdfunding cancelled");

  // Donors claim refunds
  const d1Addr = await donor1.getAddress();
  const d2Addr = await donor2.getAddress();

  const d1Before = await ethers.provider.getBalance(d1Addr);
  const tx1 = await cf.connect(donor1).refund(TX_OVERRIDES);
  const r1 = await tx1.wait();
  const d1After = await ethers.provider.getBalance(d1Addr);
  const d1Refunded = d1After - d1Before + r1!.gasUsed * r1!.gasPrice;
  assert(d1Refunded === DONATION_1, "Donor1 refunded exactly 3 ETH");

  const d2Before = await ethers.provider.getBalance(d2Addr);
  const tx2 = await cf.connect(donor2).refund(TX_OVERRIDES);
  const r2 = await tx2.wait();
  const d2After = await ethers.provider.getBalance(d2Addr);
  const d2Refunded = d2After - d2Before + r2!.gasUsed * r2!.gasPrice;
  assert(d2Refunded === DONATION_2, "Donor2 refunded exactly 2 ETH");
  console.log("   Both donors fully refunded");
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Scenario 5 — ExceedsTotalSupply aggregate cap enforcement
// ═══════════════════════════════════════════════════════════════════════════════
async function scenario5(signers: Signer[]) {
  const [owner, , , beneficiary1, beneficiary2] = signers;
  console.log("\n━━━ Scenario 5: ExceedsTotalSupply aggregate cap enforcement ━━━\n");

  const program = await deployProgram(owner, "Cap Enforcement", false);

  // Define a capped token type: maxSupply = 10
  await (await program.defineTokenType("Limited Badge", "LBDG", 10, "", TX_OVERRIDES)).wait();
  const tokenId = 0n;
  console.log("   Defined: LBDG (maxSupply=10)");

  // Create two distributions for the same capped token
  await (await program.createDistribution(tokenId, TX_OVERRIDES)).wait();
  await (await program.createDistribution(tokenId, TX_OVERRIDES)).wait();

  // Set dist 0: 6 tokens, dist 1: 4 tokens — total = 10, exactly at cap
  const b1Addr = await beneficiary1.getAddress();
  const b2Addr = await beneficiary2.getAddress();
  await (await program.setBeneficiaries(0, [b1Addr], [6n], TX_OVERRIDES)).wait();
  console.log("   Dist 0: 6 tokens (within cap)");

  await (await program.setBeneficiaries(1, [b2Addr], [4n], TX_OVERRIDES)).wait();
  console.log("   Dist 1: 4 tokens (total=10, exactly at cap)");

  // Verify the distributions are set correctly
  const dist0 = await program.getDistributionInfo(0);
  assert(dist0.totalRequired === 6n, "Dist 0 totalRequired=6");
  const dist1 = await program.getDistributionInfo(1);
  assert(dist1.totalRequired === 4n, "Dist 1 totalRequired=4");

  // Try to update dist 1 to 5 tokens — total would be 11, exceeding cap
  await expectRevert(
    async () => (await program.setBeneficiaries(1, [b2Addr], [5n], TX_OVERRIDES)).wait(),
    "Setting 6+5=11 reverts (ExceedsTotalSupply)",
  );
  console.log("   Aggregate cap enforcement working correctly");
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Scenario 6 — Lock-distributions mode enforcement
// ═══════════════════════════════════════════════════════════════════════════════
async function scenario6(signers: Signer[]) {
  const [owner, donor1, , beneficiary1] = signers;
  console.log("\n━━━ Scenario 6: Lock-distributions mode enforcement ━━━\n");

  // Deploy with lockDistributions = true
  const program = await deployProgram(owner, "Locked Program", true);
  assert((await program.lockDistributions()) === true, "lockDistributions is true");

  // Define token type and set up crowdfunding
  await (await program.defineTokenType("Token", "TKN", 0, "", TX_OVERRIDES)).wait();
  const tokenId = 0n;
  await (await program.setCrowdfunding(ethers.parseEther("5"), await futureDeadline(), TX_OVERRIDES)).wait();

  // 6a. Contributions should fail with no distributions
  await expectRevert(
    async () => (await program.connect(donor1).contribute({ value: ethers.parseEther("1"), ...TX_OVERRIDES })).wait(),
    "Contribution rejected: no distributions yet",
  );

  // Create distribution and set beneficiaries
  await (await program.createDistribution(tokenId, TX_OVERRIDES)).wait();
  const b1Addr = await beneficiary1.getAddress();
  await (await program.setBeneficiaries(0, [b1Addr], [100n], TX_OVERRIDES)).wait();

  // 6b. Contributions should fail when distribution is not READY
  await expectRevert(
    async () => (await program.connect(donor1).contribute({ value: ethers.parseEther("1"), ...TX_OVERRIDES })).wait(),
    "Contribution rejected: distribution not READY",
  );

  // Mark distribution ready
  await (await program.markDistributionReady(0, TX_OVERRIDES)).wait();
  console.log("   Distribution marked READY");

  // 6c. Now contributions should succeed
  await (await program.connect(donor1).contribute({ value: ethers.parseEther("1"), ...TX_OVERRIDES })).wait();
  const cf = await getCrowdfunding(program);
  assert((await cf.totalRaised()) === ethers.parseEther("1"), "Contribution accepted: totalRaised is 1 ETH");

  // 6d. Creating new distributions should fail after contributions exist
  await expectRevert(
    async () => (await program.createDistribution(tokenId, TX_OVERRIDES)).wait(),
    "createDistribution rejected: contributions already exist",
  );

  // 6e. Changing beneficiaries should fail after contributions exist
  await expectRevert(
    async () => (await program.setBeneficiaries(0, [b1Addr], [200n], TX_OVERRIDES)).wait(),
    "setBeneficiaries rejected: contributions already exist",
  );
  console.log("   Lock-distributions enforcement working correctly");
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  const signers = await ethers.getSigners();
  if (signers.length < 5) {
    throw new Error("Need at least 5 signers. Make sure you're running on a local Hardhat node.");
  }

  const addresses = await Promise.all(signers.slice(0, 5).map(s => s.getAddress()));
  console.log("=== Chain.Giving E2E — Comprehensive Test Suite ===");
  console.log(`Accounts: owner=${addresses[0]}`);
  console.log(`          donor1=${addresses[1]}`);
  console.log(`          donor2=${addresses[2]}`);
  console.log(`          beneficiary1=${addresses[3]}`);
  console.log(`          beneficiary2=${addresses[4]}`);

  await scenario1(signers);
  await scenario2(signers);
  await scenario3(signers);
  await scenario4(signers);
  await scenario5(signers);
  await scenario6(signers);

  // ── Summary ──────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

  if (failed > 0) {
    console.error("\nE2E FAILED");
    process.exitCode = 1;
  } else {
    console.log("\nE2E PASSED — All scenarios completed successfully.");
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
