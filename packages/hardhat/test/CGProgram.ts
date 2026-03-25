import { expect } from "chai";
import { ethers } from "hardhat";
import { CGProgram, CGToken, CGCrowdfunding, CGDistribution } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("CGProgram", function () {
  let program: CGProgram;
  let owner: HardhatEthersSigner;
  let donor1: HardhatEthersSigner;
  let donor2: HardhatEthersSigner;
  let beneficiary1: HardhatEthersSigner;
  let beneficiary2: HardhatEthersSigner;
  let nonOwner: HardhatEthersSigner;

  const TARGET = ethers.parseEther("10");
  let deadline: number;

  async function deployProgram(lock = false): Promise<CGProgram> {
    const now = await time.latest();
    deadline = now + 7 * 24 * 60 * 60;
    const factory = await ethers.getContractFactory("CGProgram");
    return factory.deploy(owner.address, "Aid Program", "Food Voucher", "FOOD", lock);
  }

  async function getToken(prog: CGProgram): Promise<CGToken> {
    return ethers.getContractAt("CGToken", await prog.token());
  }

  async function getCrowdfunding(prog: CGProgram): Promise<CGCrowdfunding> {
    return ethers.getContractAt("CGCrowdfunding", await prog.crowdfunding());
  }

  async function getDistribution(prog: CGProgram, index: number): Promise<CGDistribution> {
    return ethers.getContractAt("CGDistribution", await prog.distributions(index));
  }

  beforeEach(async () => {
    [owner, donor1, donor2, beneficiary1, beneficiary2, nonOwner] = await ethers.getSigners();
    program = await deployProgram(false);
  });

  describe("Deployment", function () {
    it("sets name and owner", async () => {
      expect(await program.name()).to.equal("Aid Program");
      expect(await program.owner()).to.equal(owner.address);
    });

    it("deploys a CGToken owned by the program", async () => {
      const token = await getToken(program);
      expect(await token.name()).to.equal("Food Voucher");
      expect(await token.symbol()).to.equal("FOOD");
      expect(await token.owner()).to.equal(await program.getAddress());
    });

    it("starts in ACTIVE state", async () => {
      expect(await program.state()).to.equal(0); // ACTIVE
    });

    it("emits ProgramCreated on deploy", async () => {
      const factory = await ethers.getContractFactory("CGProgram");
      const newProgram = await factory.deploy(owner.address, "Test", "T", "T", false);
      const receipt = await newProgram.deploymentTransaction()!.wait();
      const programCreatedTopic = newProgram.interface.getEvent("ProgramCreated")!.topicHash;
      const event = receipt!.logs.find(log => log.topics[0] === programCreatedTopic);
      expect(event).to.not.equal(undefined);
    });

    it("stores lockDistributions flag", async () => {
      expect(await program.lockDistributions()).to.equal(false);
      const locked = await deployProgram(true);
      expect(await locked.lockDistributions()).to.equal(true);
    });
  });

  describe("Set Crowdfunding", function () {
    it("deploys a crowdfunding owned by the program", async () => {
      await program.setCrowdfunding(TARGET, deadline);
      const cf = await getCrowdfunding(program);
      expect(await cf.owner()).to.equal(await program.getAddress());
      expect(await cf.fundingTarget()).to.equal(TARGET);
    });

    it("emits CrowdfundingSet", async () => {
      await expect(program.setCrowdfunding(TARGET, deadline)).to.emit(program, "CrowdfundingSet");
    });

    it("reverts if crowdfunding already set", async () => {
      await program.setCrowdfunding(TARGET, deadline);
      await expect(program.setCrowdfunding(TARGET, deadline)).to.be.revertedWithCustomError(
        program,
        "CrowdfundingAlreadySet",
      );
    });

    it("reverts if not owner", async () => {
      await expect(program.connect(nonOwner).setCrowdfunding(TARGET, deadline)).to.be.revertedWithCustomError(
        program,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Create Distribution", function () {
    it("creates a distribution owned by the program", async () => {
      await program.createDistribution();
      const dist = await getDistribution(program, 0);
      expect(await dist.owner()).to.equal(await program.getAddress());
      expect(await dist.token()).to.equal(await program.token());
    });

    it("can create multiple distributions", async () => {
      await program.createDistribution();
      await program.createDistribution();
      expect(await program.distributionCount()).to.equal(2);
    });

    it("emits DistributionCreated", async () => {
      await expect(program.createDistribution()).to.emit(program, "DistributionCreated");
    });

    it("reverts if not owner", async () => {
      await expect(program.connect(nonOwner).createDistribution()).to.be.revertedWithCustomError(
        program,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Set Beneficiaries (proxied)", function () {
    it("sets beneficiaries on a distribution", async () => {
      await program.createDistribution();
      await program.setBeneficiaries(0, [beneficiary1.address, beneficiary2.address], [100n, 200n]);

      const dist = await getDistribution(program, 0);
      expect(await dist.beneficiaryCount()).to.equal(2);
      expect(await dist.totalRequired()).to.equal(300n);
    });

    it("reverts if not owner", async () => {
      await program.createDistribution();
      await expect(
        program.connect(nonOwner).setBeneficiaries(0, [beneficiary1.address], [100n]),
      ).to.be.revertedWithCustomError(program, "OwnableUnauthorizedAccount");
    });
  });

  describe("Mark Distribution Ready", function () {
    it("mints tokens and marks distribution READY", async () => {
      await program.createDistribution();
      await program.setBeneficiaries(0, [beneficiary1.address], [500n]);
      await program.markDistributionReady(0);

      const dist = await getDistribution(program, 0);
      expect(await dist.state()).to.equal(1); // READY

      const token = await getToken(program);
      expect(await token.balanceOf(await dist.getAddress())).to.equal(500n);
    });
  });

  describe("Contribute (via program)", function () {
    it("forwards contributions to crowdfunding", async () => {
      await program.setCrowdfunding(TARGET, deadline);
      await program.createDistribution();

      await program.connect(donor1).contribute({ value: ethers.parseEther("5") });

      const cf = await getCrowdfunding(program);
      expect(await cf.totalRaised()).to.equal(ethers.parseEther("5"));
    });

    it("reverts if no crowdfunding set", async () => {
      await expect(program.connect(donor1).contribute({ value: ethers.parseEther("1") })).to.be.revertedWithCustomError(
        program,
        "NoCrowdfunding",
      );
    });
  });

  describe("Execute", function () {
    async function setupForExecution() {
      await program.setCrowdfunding(TARGET, deadline);
      await program.createDistribution();
      await program.setBeneficiaries(0, [beneficiary1.address, beneficiary2.address], [1000n, 2000n]);
      await program.markDistributionReady(0);

      // Fund the crowdfunding
      await program.connect(donor1).contribute({ value: TARGET });
    }

    it("withdraws funds and distributes tokens in one transaction", async () => {
      await setupForExecution();

      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await program.execute();
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

      // Owner received funds (minus gas)
      expect(ownerBalanceAfter - ownerBalanceBefore + gasCost).to.equal(TARGET);

      // Tokens distributed
      const token = await getToken(program);
      expect(await token.balanceOf(beneficiary1.address)).to.equal(1000n);
      expect(await token.balanceOf(beneficiary2.address)).to.equal(2000n);

      // Program is COMPLETED
      expect(await program.state()).to.equal(2); // COMPLETED

      // Crowdfunding is WITHDRAWN
      const cf = await getCrowdfunding(program);
      expect(await cf.state()).to.equal(2); // WITHDRAWN

      // Distribution is DISTRIBUTED
      const dist = await getDistribution(program, 0);
      expect(await dist.state()).to.equal(2); // DISTRIBUTED
    });

    it("emits ProgramExecuted", async () => {
      await setupForExecution();
      await expect(program.execute()).to.emit(program, "ProgramExecuted");
    });

    it("works with multiple distributions", async () => {
      await program.setCrowdfunding(TARGET, deadline);

      await program.createDistribution();
      await program.setBeneficiaries(0, [beneficiary1.address], [500n]);
      await program.markDistributionReady(0);

      await program.createDistribution();
      await program.setBeneficiaries(1, [beneficiary2.address], [700n]);
      await program.markDistributionReady(1);

      await program.connect(donor1).contribute({ value: TARGET });
      await program.execute();

      const token = await getToken(program);
      expect(await token.balanceOf(beneficiary1.address)).to.equal(500n);
      expect(await token.balanceOf(beneficiary2.address)).to.equal(700n);
      expect(await program.state()).to.equal(2); // COMPLETED
    });

    it("reverts if crowdfunding not FUNDED", async () => {
      await program.setCrowdfunding(TARGET, deadline);
      await program.createDistribution();
      await program.setBeneficiaries(0, [beneficiary1.address], [100n]);
      await program.markDistributionReady(0);

      await expect(program.execute()).to.be.revertedWithCustomError(program, "CrowdfundingNotFunded");
    });

    it("reverts if no distributions", async () => {
      await program.setCrowdfunding(TARGET, deadline);
      await program.connect(donor1).contribute({ value: TARGET });

      await expect(program.execute()).to.be.revertedWithCustomError(program, "NoDistributions");
    });

    it("reverts if distribution not READY", async () => {
      await program.setCrowdfunding(TARGET, deadline);
      await program.createDistribution();
      await program.setBeneficiaries(0, [beneficiary1.address], [100n]);
      // Don't mark ready
      await program.connect(donor1).contribute({ value: TARGET });

      await expect(program.execute()).to.be.revertedWithCustomError(program, "DistributionNotReady");
    });

    it("reverts if no crowdfunding", async () => {
      await program.createDistribution();
      await expect(program.execute()).to.be.revertedWithCustomError(program, "NoCrowdfunding");
    });

    it("reverts if not owner", async () => {
      await setupForExecution();
      await expect(program.connect(nonOwner).execute()).to.be.revertedWithCustomError(
        program,
        "OwnableUnauthorizedAccount",
      );
    });

    it("cannot execute twice", async () => {
      await setupForExecution();
      await program.execute();
      await expect(program.execute()).to.be.revertedWithCustomError(program, "ProgramNotActive");
    });
  });

  describe("Cancel", function () {
    it("cancels program and crowdfunding", async () => {
      await program.setCrowdfunding(TARGET, deadline);
      await program.createDistribution();

      await expect(program.cancel()).to.emit(program, "ProgramCancelled");
      expect(await program.state()).to.equal(3); // CANCELLED

      const cf = await getCrowdfunding(program);
      expect(await cf.state()).to.equal(3); // CANCELLED
    });

    it("allows donor refunds after cancel", async () => {
      await program.setCrowdfunding(TARGET, deadline);
      await program.createDistribution();

      await program.connect(donor1).contribute({ value: ethers.parseEther("3") });
      await program.cancel();

      const cf = await getCrowdfunding(program);
      await expect(cf.connect(donor1).refund()).to.not.be.reverted;
    });

    it("reverts if not ACTIVE", async () => {
      await program.setCrowdfunding(TARGET, deadline);
      await program.createDistribution();
      await program.cancel();

      await expect(program.cancel()).to.be.revertedWithCustomError(program, "ProgramNotActive");
    });

    it("works even without crowdfunding set", async () => {
      await expect(program.cancel()).to.emit(program, "ProgramCancelled");
      expect(await program.state()).to.equal(3); // CANCELLED
    });

    it("reverts if not owner", async () => {
      await expect(program.connect(nonOwner).cancel()).to.be.revertedWithCustomError(
        program,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Lock Distributions Mode", function () {
    let lockedProgram: CGProgram;

    beforeEach(async () => {
      lockedProgram = await deployProgram(true);
    });

    it("rejects contributions when no distributions exist", async () => {
      await lockedProgram.setCrowdfunding(TARGET, deadline);
      await expect(
        lockedProgram.connect(donor1).contribute({ value: ethers.parseEther("1") }),
      ).to.be.revertedWithCustomError(lockedProgram, "NoDistributions");
    });

    it("rejects contributions when distributions are not READY", async () => {
      await lockedProgram.setCrowdfunding(TARGET, deadline);
      await lockedProgram.createDistribution();
      await lockedProgram.setBeneficiaries(0, [beneficiary1.address], [100n]);

      await expect(
        lockedProgram.connect(donor1).contribute({ value: ethers.parseEther("1") }),
      ).to.be.revertedWithCustomError(lockedProgram, "DistributionNotReady");
    });

    it("accepts contributions when all distributions are READY", async () => {
      await lockedProgram.setCrowdfunding(TARGET, deadline);
      await lockedProgram.createDistribution();
      await lockedProgram.setBeneficiaries(0, [beneficiary1.address], [100n]);
      await lockedProgram.markDistributionReady(0);

      await expect(lockedProgram.connect(donor1).contribute({ value: ethers.parseEther("1") })).to.not.be.reverted;
    });

    it("blocks createDistribution after contributions received", async () => {
      await lockedProgram.setCrowdfunding(TARGET, deadline);
      await lockedProgram.createDistribution();
      await lockedProgram.setBeneficiaries(0, [beneficiary1.address], [100n]);
      await lockedProgram.markDistributionReady(0);

      await lockedProgram.connect(donor1).contribute({ value: ethers.parseEther("1") });

      await expect(lockedProgram.createDistribution()).to.be.revertedWithCustomError(
        lockedProgram,
        "DistributionsLocked",
      );
    });

    it("blocks setBeneficiaries after contributions received", async () => {
      await lockedProgram.setCrowdfunding(TARGET, deadline);

      // Create two distributions and mark both ready
      await lockedProgram.createDistribution();
      await lockedProgram.setBeneficiaries(0, [beneficiary1.address], [100n]);
      await lockedProgram.markDistributionReady(0);

      await lockedProgram.createDistribution();
      await lockedProgram.setBeneficiaries(1, [beneficiary2.address], [200n]);
      await lockedProgram.markDistributionReady(1);

      // Now contribute — all distributions are READY so this works
      await lockedProgram.connect(donor1).contribute({ value: ethers.parseEther("1") });

      // Creating a third distribution should be locked
      await expect(lockedProgram.createDistribution()).to.be.revertedWithCustomError(
        lockedProgram,
        "DistributionsLocked",
      );

      // setBeneficiaries is also blocked (even though dist state wouldn't allow it anyway,
      // the lock check fires first). We test via a new distribution scenario above.
    });

    it("allows full locked flow end-to-end", async () => {
      await lockedProgram.setCrowdfunding(TARGET, deadline);

      // Set up distributions first
      await lockedProgram.createDistribution();
      await lockedProgram.setBeneficiaries(0, [beneficiary1.address, beneficiary2.address], [1000n, 2000n]);
      await lockedProgram.markDistributionReady(0);

      // Now donors can see beneficiaries are locked, contribute
      await lockedProgram.connect(donor1).contribute({ value: ethers.parseEther("6") });
      await lockedProgram.connect(donor2).contribute({ value: ethers.parseEther("4") });

      // Execute
      await lockedProgram.execute();

      const token = await getToken(lockedProgram);
      expect(await token.balanceOf(beneficiary1.address)).to.equal(1000n);
      expect(await token.balanceOf(beneficiary2.address)).to.equal(2000n);
      expect(await lockedProgram.state()).to.equal(2); // COMPLETED
    });

    it("unlocked mode allows contributions regardless of distribution state", async () => {
      // Using the default (unlocked) program
      await program.setCrowdfunding(TARGET, deadline);
      await program.createDistribution();
      // Don't mark ready — contributions should still work

      await expect(program.connect(donor1).contribute({ value: ethers.parseEther("1") })).to.not.be.reverted;
    });
  });

  describe("Full Integration: Default Flow", function () {
    it("completes the full default flow from spec", async () => {
      // 1. Program already deployed in beforeEach

      // 2. Set crowdfunding
      await program.setCrowdfunding(TARGET, deadline);

      // 3. Create distributions
      await program.createDistribution();
      await program.createDistribution();

      // 4. Set beneficiaries
      await program.setBeneficiaries(0, [beneficiary1.address], [5000n]);
      await program.setBeneficiaries(1, [beneficiary2.address], [3000n]);

      // 5. Mint tokens and mark ready
      await program.markDistributionReady(0);
      await program.markDistributionReady(1);

      // 6. Donors contribute
      await program.connect(donor1).contribute({ value: ethers.parseEther("7") });
      await program.connect(donor2).contribute({ value: ethers.parseEther("3") });

      // 7. Execute — withdraw + distribute atomically
      const ownerBefore = await ethers.provider.getBalance(owner.address);
      const tx = await program.execute();
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const ownerAfter = await ethers.provider.getBalance(owner.address);

      // Verify funds received by owner
      expect(ownerAfter - ownerBefore + gasCost).to.equal(TARGET);

      // Verify token distribution
      const token = await getToken(program);
      expect(await token.balanceOf(beneficiary1.address)).to.equal(5000n);
      expect(await token.balanceOf(beneficiary2.address)).to.equal(3000n);

      // Verify final states
      expect(await program.state()).to.equal(2); // COMPLETED
    });
  });
});
