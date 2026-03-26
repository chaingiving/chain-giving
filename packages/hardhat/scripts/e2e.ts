/**
 * E2E script: runs the full default Chain.Giving flow on a local Hardhat node.
 *
 * Prerequisites: `yarn chain` running in another terminal.
 * Usage:        `yarn e2e`  (or `npx hardhat run scripts/e2e.ts`)
 */
import { ethers } from "hardhat";

// Explicit gas limit to avoid ethers over-estimating on contract-deploying txs,
// which can exceed the localhost node's default gas cap.
const GAS = { gasLimit: 10_000_000 };

async function main() {
  const signers = await ethers.getSigners();
  const [deployer, donor1, donor2, beneficiary1, beneficiary2] = signers;

  console.log("=== Chain.Giving E2E — Default Flow ===\n");
  console.log("Deployer  :", deployer.address);
  console.log("Donor 1   :", donor1.address);
  console.log("Donor 2   :", donor2.address);
  console.log("Beneficiary1:", beneficiary1.address);
  console.log("Beneficiary2:", beneficiary2.address);
  console.log();

  // ── 1. Get the CGProgram deployed by hardhat-deploy ─────────────────
  console.log("1. Fetching deployed CGProgram...");
  const program = await ethers.getContract("CGProgram", deployer);
  const programAddr = await program.getAddress();
  console.log("   CGProgram at:", programAddr);

  const tokenAddr = await program.token();
  const token = await ethers.getContractAt("CGToken", tokenAddr);
  console.log("   CGToken   deployed at:", tokenAddr);
  console.log("   Token name:", await token.name(), "| symbol:", await token.symbol());
  console.log();

  // ── 2. Set crowdfunding ──────────────────────────────────────────────
  const TARGET = ethers.parseEther("10");
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  const deadline = now + 7 * 24 * 60 * 60; // 1 week

  console.log(
    "2. Setting crowdfunding — target:",
    ethers.formatEther(TARGET),
    "ETH, deadline:",
    new Date(deadline * 1000).toISOString(),
  );
  await (await program.setCrowdfunding(TARGET, deadline, GAS)).wait();

  const cfAddr = await program.crowdfunding();
  console.log("   CGCrowdfunding deployed at:", cfAddr);
  console.log();

  // ── 3. Create distributions ──────────────────────────────────────────
  console.log("3. Creating 2 distributions...");
  await (await program.createDistribution(GAS)).wait();
  await (await program.createDistribution(GAS)).wait();

  const dist0Addr = await program.distributions(0);
  const dist1Addr = await program.distributions(1);
  console.log("   Distribution 0:", dist0Addr);
  console.log("   Distribution 1:", dist1Addr);
  console.log();

  // ── 4. Set beneficiaries ─────────────────────────────────────────────
  const AMOUNT_B1 = 5000n;
  const AMOUNT_B2 = 3000n;

  console.log("4. Setting beneficiaries...");
  console.log("   Dist 0 → Beneficiary1 gets", AMOUNT_B1.toString(), "FOOD");
  console.log("   Dist 1 → Beneficiary2 gets", AMOUNT_B2.toString(), "FOOD");
  await (await program.setBeneficiaries(0, [beneficiary1.address], [AMOUNT_B1], GAS)).wait();
  await (await program.setBeneficiaries(1, [beneficiary2.address], [AMOUNT_B2], GAS)).wait();
  console.log();

  // ── 5. Mark distributions ready (mints tokens) ──────────────────────
  console.log("5. Marking distributions ready (minting tokens)...");
  await (await program.markDistributionReady(0, GAS)).wait();
  await (await program.markDistributionReady(1, GAS)).wait();
  console.log("   Token total supply:", (await token.totalSupply()).toString(), "FOOD");
  console.log();

  // ── 6. Donors contribute ─────────────────────────────────────────────
  const DONATION_1 = ethers.parseEther("7");
  const DONATION_2 = ethers.parseEther("3");

  console.log("6. Donors contributing...");
  console.log("   Donor1 contributes", ethers.formatEther(DONATION_1), "ETH");
  await (await program.connect(donor1).contribute({ value: DONATION_1, ...GAS })).wait();
  console.log("   Donor2 contributes", ethers.formatEther(DONATION_2), "ETH");
  await (await program.connect(donor2).contribute({ value: DONATION_2, ...GAS })).wait();

  const cfBalance = await ethers.provider.getBalance(cfAddr);
  console.log("   Crowdfunding balance:", ethers.formatEther(cfBalance), "ETH");
  console.log();

  // ── 7. Execute — withdraw funds + distribute tokens atomically ──────
  console.log("7. Executing program (withdraw + distribute)...");
  const ownerBalBefore = await ethers.provider.getBalance(deployer.address);
  const tx = await program.execute(GAS);
  const receipt = await tx.wait();
  const gasCost = receipt!.gasUsed * receipt!.gasPrice;
  const ownerBalAfter = await ethers.provider.getBalance(deployer.address);

  const fundsReceived = ownerBalAfter - ownerBalBefore + gasCost;
  console.log("   Funds received by owner:", ethers.formatEther(fundsReceived), "ETH");
  console.log("   Beneficiary1 FOOD balance:", (await token.balanceOf(beneficiary1.address)).toString());
  console.log("   Beneficiary2 FOOD balance:", (await token.balanceOf(beneficiary2.address)).toString());
  console.log();

  // ── 8. Verify final state ────────────────────────────────────────────
  const state = await program.state();
  const stateNames = ["ACTIVE", "EXECUTING", "COMPLETED", "CANCELLED"];
  console.log("8. Final program state:", stateNames[Number(state)]);
  console.log();

  // ── Summary ──────────────────────────────────────────────────────────
  const ok =
    state === 2n &&
    (await token.balanceOf(beneficiary1.address)) === AMOUNT_B1 &&
    (await token.balanceOf(beneficiary2.address)) === AMOUNT_B2 &&
    fundsReceived === TARGET;

  if (ok) {
    console.log("✅ E2E PASSED — Full default flow completed successfully.");
  } else {
    console.error("❌ E2E FAILED — Unexpected final state.");
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
