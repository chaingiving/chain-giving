import { expect } from "chai";
import { ethers } from "hardhat";
import { CGProgram, CGToken, CGCrowdfunding, CGDistribution } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("CGProgram", function () {
  let program: CGProgram;
  let tokenId: bigint;
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

    // Deploy the unified component factory
    const componentFactoryF = await ethers.getContractFactory("CGComponentFactory");
    const componentFactory = await componentFactoryF.deploy();

    const factory = await ethers.getContractFactory("CGProgram");
    return factory.deploy(owner.address, "Aid Program", lock, await componentFactory.getAddress());
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
    // Define a default fungible token type (tokenId = 0)
    await program.defineTokenType("Food Voucher", "FOOD", 0, "", true, true);
    tokenId = 0n;
  });

  describe("Deployment", function () {
    it("sets name and owner", async () => {
      expect(await program.name()).to.equal("Aid Program");
      expect(await program.owner()).to.equal(owner.address);
    });

    it("deploys a CGToken owned by the program", async () => {
      const token = await getToken(program);
      expect(await token.owner()).to.equal(await program.getAddress());
    });

    it("starts in ACTIVE state", async () => {
      expect(await program.state()).to.equal(0); // ACTIVE
    });

    it("emits ProgramCreated on deploy", async () => {
      const componentFactoryF = await ethers.getContractFactory("CGComponentFactory");
      const componentFactory = await componentFactoryF.deploy();

      const factory = await ethers.getContractFactory("CGProgram");
      const newProgram = await factory.deploy(owner.address, "Test", false, await componentFactory.getAddress());
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

  describe("defineTokenType", function () {
    it("defines a fungible type and emits TokenTypeDefined", async () => {
      await expect(program.defineTokenType("Water Credits", "WATR", 0, "", true, true))
        .to.emit(program, "TokenTypeDefined")
        .withArgs(1n, "Water Credits", "WATR", 0n, true, true);
    });

    it("defines a capped badge type (maxSupply > 0)", async () => {
      await program.defineTokenType("Bronze Badge", "BDGE", 100, "", true, true);
      const token = await getToken(program);
      const tt = await token.getTokenType(1n);
      expect(tt.maxSupply).to.equal(100n);
    });

    it("defines a unique NFT type (maxSupply = 1)", async () => {
      await program.defineTokenType("Certificate", "CERT", 1, "", true, true);
      const token = await getToken(program);
      const tt = await token.getTokenType(1n);
      expect(tt.maxSupply).to.equal(1n);
    });

    it("supports multiple token types in one program", async () => {
      await program.defineTokenType("Badge", "BDGE", 50, "", true, true);
      await program.defineTokenType("Certificate", "CERT", 1, "", true, true);
      const token = await getToken(program);
      expect(await token.nextTokenId()).to.equal(3n); // 0=Food Voucher, 1=Badge, 2=Certificate
    });

    it("reverts if not owner", async () => {
      await expect(
        program.connect(nonOwner).defineTokenType("X", "X", 0, "", true, true),
      ).to.be.revertedWithCustomError(program, "OwnableUnauthorizedAccount");
    });

    it("returns correct tokenId", async () => {
      const token = await getToken(program);
      // First defined in beforeEach is tokenId=0, next one should be 1
      expect(await token.nextTokenId()).to.equal(1n);
      await program.defineTokenType("Second", "SND", 0, "", true, true);
      expect(await token.nextTokenId()).to.equal(2n);
    });

    it("stores transferable and burnable flags", async () => {
      await program.defineTokenType("Soulbound", "SOUL", 0, "", false, false);
      const token = await getToken(program);
      const tt = await token.getTokenType(1n);
      expect(tt.transferable).to.equal(false);
      expect(tt.burnable).to.equal(false);
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
    it("creates a distribution for the given token type", async () => {
      await program.createDistribution(tokenId);
      const dist = await getDistribution(program, 0);
      expect(await dist.owner()).to.equal(await program.getAddress());
      expect(await dist.token()).to.equal(await program.token());
      expect(await dist.tokenId()).to.equal(tokenId);
    });

    it("can create distributions for different token types", async () => {
      await program.defineTokenType("Badge", "BDGE", 50, "", true, true);
      await program.createDistribution(0n); // Food Voucher
      await program.createDistribution(1n); // Badge
      expect(await program.distributionCount()).to.equal(2);

      const dist0 = await getDistribution(program, 0);
      const dist1 = await getDistribution(program, 1);
      expect(await dist0.tokenId()).to.equal(0n);
      expect(await dist1.tokenId()).to.equal(1n);
    });

    it("emits DistributionCreated with tokenId", async () => {
      await expect(program.createDistribution(tokenId))
        .to.emit(program, "DistributionCreated")
        .withArgs(0n, await await program.createDistribution.staticCall(tokenId), tokenId);
    });

    it("reverts for unknown tokenId", async () => {
      await expect(program.createDistribution(99n)).to.be.revertedWithCustomError(
        await ethers.getContractAt("CGToken", await program.token()),
        "UnknownTokenType",
      );
    });

    it("reverts if not owner", async () => {
      await expect(program.connect(nonOwner).createDistribution(tokenId)).to.be.revertedWithCustomError(
        program,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Set Beneficiaries (proxied)", function () {
    it("sets beneficiaries on a distribution", async () => {
      await program.createDistribution(tokenId);
      await program.setBeneficiaries(0, [beneficiary1.address, beneficiary2.address], [100n, 200n]);

      const dist = await getDistribution(program, 0);
      expect(await dist.beneficiaryCount()).to.equal(2);
      expect(await dist.totalRequired()).to.equal(300n);
    });

    it("reverts if not owner", async () => {
      await program.createDistribution(tokenId);
      await expect(
        program.connect(nonOwner).setBeneficiaries(0, [beneficiary1.address], [100n]),
      ).to.be.revertedWithCustomError(program, "OwnableUnauthorizedAccount");
    });
  });

  describe("Mark Distribution Ready", function () {
    it("mints ERC-1155 tokens and marks distribution READY", async () => {
      await program.createDistribution(tokenId);
      await program.setBeneficiaries(0, [beneficiary1.address], [500n]);
      await program.markDistributionReady(0);

      const dist = await getDistribution(program, 0);
      expect(await dist.state()).to.equal(1); // READY

      const token = await getToken(program);
      expect(await token.balanceOf(await dist.getAddress(), tokenId)).to.equal(500n);
    });

    it("mints badge tokens (amount=1 each) and marks ready", async () => {
      await program.defineTokenType("Badge", "BDGE", 2, "", true, true);
      const badgeTokenId = 1n;

      await program.createDistribution(badgeTokenId);
      await program.setBeneficiaries(0, [beneficiary1.address, beneficiary2.address], [1n, 1n]);
      await program.markDistributionReady(0);

      const dist = await getDistribution(program, 0);
      expect(await dist.state()).to.equal(1); // READY

      const token = await getToken(program);
      expect(await token.balanceOf(await dist.getAddress(), badgeTokenId)).to.equal(2n);
    });
  });

  describe("Contribute (via program)", function () {
    it("forwards contributions to crowdfunding", async () => {
      await program.setCrowdfunding(TARGET, deadline);
      await program.createDistribution(tokenId);

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
      await program.createDistribution(tokenId);
      await program.setBeneficiaries(0, [beneficiary1.address, beneficiary2.address], [1000n, 2000n]);
      await program.markDistributionReady(0);

      await program.connect(donor1).contribute({ value: TARGET });
    }

    it("withdraws funds and distributes tokens in one transaction", async () => {
      await setupForExecution();

      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
      const tx = await program.execute();
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);

      expect(ownerBalanceAfter - ownerBalanceBefore + gasCost).to.equal(TARGET);

      const token = await getToken(program);
      expect(await token.balanceOf(beneficiary1.address, tokenId)).to.equal(1000n);
      expect(await token.balanceOf(beneficiary2.address, tokenId)).to.equal(2000n);

      expect(await program.state()).to.equal(2); // COMPLETED

      const cf = await getCrowdfunding(program);
      expect(await cf.state()).to.equal(2); // WITHDRAWN

      const dist = await getDistribution(program, 0);
      expect(await dist.state()).to.equal(2); // DISTRIBUTED
    });

    it("emits ProgramExecuted", async () => {
      await setupForExecution();
      await expect(program.execute()).to.emit(program, "ProgramExecuted");
    });

    it("works with multiple distributions across different token types", async () => {
      await program.defineTokenType("Badge", "BDGE", 2, "", true, true);
      await program.setCrowdfunding(TARGET, deadline);

      await program.createDistribution(0n); // Food Voucher
      await program.setBeneficiaries(0, [beneficiary1.address], [500n]);
      await program.markDistributionReady(0);

      await program.createDistribution(1n); // Badge
      await program.setBeneficiaries(1, [beneficiary2.address, beneficiary2.address], [1n, 1n]);
      // beneficiary2 appears twice — but let's just use two different beneficiaries for clarity
      await program.setBeneficiaries(1, [beneficiary1.address, beneficiary2.address], [1n, 1n]);
      await program.markDistributionReady(1);

      await program.connect(donor1).contribute({ value: TARGET });
      await program.execute();

      const token = await getToken(program);
      expect(await token.balanceOf(beneficiary1.address, 0n)).to.equal(500n);
      expect(await token.balanceOf(beneficiary1.address, 1n)).to.equal(1n);
      expect(await token.balanceOf(beneficiary2.address, 1n)).to.equal(1n);
      expect(await program.state()).to.equal(2); // COMPLETED
    });

    it("reverts if crowdfunding not FUNDED", async () => {
      await program.setCrowdfunding(TARGET, deadline);
      await program.createDistribution(tokenId);
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
      await program.createDistribution(tokenId);
      await program.setBeneficiaries(0, [beneficiary1.address], [100n]);
      await program.connect(donor1).contribute({ value: TARGET });

      await expect(program.execute()).to.be.revertedWithCustomError(program, "DistributionNotReady");
    });

    it("reverts if no crowdfunding", async () => {
      await program.createDistribution(tokenId);
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

    it("distributes non-transferable (soulbound) tokens to beneficiaries", async () => {
      // Define a soulbound token type (transferable=false)
      await program.defineTokenType("Soulbound Badge", "SOUL", 0, "", false, true);
      const soulboundTokenId = 1n;

      await program.setCrowdfunding(TARGET, deadline);
      await program.createDistribution(soulboundTokenId);
      await program.setBeneficiaries(0, [beneficiary1.address, beneficiary2.address], [10n, 20n]);
      await program.markDistributionReady(0);

      await program.connect(donor1).contribute({ value: TARGET });
      await program.execute();

      const token = await getToken(program);
      expect(await token.balanceOf(beneficiary1.address, soulboundTokenId)).to.equal(10n);
      expect(await token.balanceOf(beneficiary2.address, soulboundTokenId)).to.equal(20n);
      expect(await program.state()).to.equal(2); // COMPLETED

      // Verify tokens are truly soulbound — beneficiaries can't transfer them
      await expect(
        token
          .connect(beneficiary1)
          .safeTransferFrom(beneficiary1.address, beneficiary2.address, soulboundTokenId, 1n, "0x"),
      ).to.be.revertedWithCustomError(token, "TransferDisabled");
    });
  });

  describe("Cancel", function () {
    it("cancels program and crowdfunding", async () => {
      await program.setCrowdfunding(TARGET, deadline);
      await program.createDistribution(tokenId);

      await expect(program.cancel()).to.emit(program, "ProgramCancelled");
      expect(await program.state()).to.equal(3); // CANCELLED

      const cf = await getCrowdfunding(program);
      expect(await cf.state()).to.equal(3); // CANCELLED
    });

    it("allows donor refunds after cancel", async () => {
      await program.setCrowdfunding(TARGET, deadline);
      await program.createDistribution(tokenId);

      await program.connect(donor1).contribute({ value: ethers.parseEther("3") });
      await program.cancel();

      const cf = await getCrowdfunding(program);
      await expect(cf.connect(donor1).refund()).to.not.be.reverted;
    });

    it("reverts if not ACTIVE", async () => {
      await program.setCrowdfunding(TARGET, deadline);
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
      await lockedProgram.defineTokenType("Food Voucher", "FOOD", 0, "", true, true);
    });

    it("rejects contributions when no distributions exist", async () => {
      await lockedProgram.setCrowdfunding(TARGET, deadline);
      await expect(
        lockedProgram.connect(donor1).contribute({ value: ethers.parseEther("1") }),
      ).to.be.revertedWithCustomError(lockedProgram, "NoDistributions");
    });

    it("rejects contributions when distributions are not READY", async () => {
      await lockedProgram.setCrowdfunding(TARGET, deadline);
      await lockedProgram.createDistribution(0n);
      await lockedProgram.setBeneficiaries(0, [beneficiary1.address], [100n]);

      await expect(
        lockedProgram.connect(donor1).contribute({ value: ethers.parseEther("1") }),
      ).to.be.revertedWithCustomError(lockedProgram, "DistributionNotReady");
    });

    it("accepts contributions when all distributions are READY", async () => {
      await lockedProgram.setCrowdfunding(TARGET, deadline);
      await lockedProgram.createDistribution(0n);
      await lockedProgram.setBeneficiaries(0, [beneficiary1.address], [100n]);
      await lockedProgram.markDistributionReady(0);

      await expect(lockedProgram.connect(donor1).contribute({ value: ethers.parseEther("1") })).to.not.be.reverted;
    });

    it("blocks createDistribution after contributions received", async () => {
      await lockedProgram.setCrowdfunding(TARGET, deadline);
      await lockedProgram.createDistribution(0n);
      await lockedProgram.setBeneficiaries(0, [beneficiary1.address], [100n]);
      await lockedProgram.markDistributionReady(0);

      await lockedProgram.connect(donor1).contribute({ value: ethers.parseEther("1") });

      await expect(lockedProgram.createDistribution(0n)).to.be.revertedWithCustomError(
        lockedProgram,
        "DistributionsLocked",
      );
    });

    it("allows full locked flow end-to-end", async () => {
      await lockedProgram.setCrowdfunding(TARGET, deadline);

      await lockedProgram.createDistribution(0n);
      await lockedProgram.setBeneficiaries(0, [beneficiary1.address, beneficiary2.address], [1000n, 2000n]);
      await lockedProgram.markDistributionReady(0);

      await lockedProgram.connect(donor1).contribute({ value: ethers.parseEther("6") });
      await lockedProgram.connect(donor2).contribute({ value: ethers.parseEther("4") });

      await lockedProgram.execute();

      const token = await getToken(lockedProgram);
      expect(await token.balanceOf(beneficiary1.address, 0n)).to.equal(1000n);
      expect(await token.balanceOf(beneficiary2.address, 0n)).to.equal(2000n);
      expect(await lockedProgram.state()).to.equal(2); // COMPLETED
    });

    it("unlocked mode allows contributions regardless of distribution state", async () => {
      await program.setCrowdfunding(TARGET, deadline);
      await program.createDistribution(tokenId);

      await expect(program.connect(donor1).contribute({ value: ethers.parseEther("1") })).to.not.be.reverted;
    });
  });

  describe("View Functions", function () {
    it("getTokenTypes returns all defined token types", async () => {
      await program.defineTokenType("Badge", "BDGE", 50, "ipfs://QmBadge", true, true);

      const types = await program.getTokenTypes();
      expect(types.length).to.equal(2);

      expect(types[0].tokenId).to.equal(0n);
      expect(types[0].name).to.equal("Food Voucher");
      expect(types[0].symbol).to.equal("FOOD");
      expect(types[0].maxSupply).to.equal(0n);
      expect(types[0].totalMinted).to.equal(0n);

      expect(types[1].tokenId).to.equal(1n);
      expect(types[1].name).to.equal("Badge");
      expect(types[1].maxSupply).to.equal(50n);
      expect(types[1].uri).to.equal("ipfs://QmBadge");
    });

    it("getTokenTypes updates totalMinted after minting", async () => {
      await program.createDistribution(tokenId);
      await program.setBeneficiaries(0, [beneficiary1.address], [500n]);
      await program.markDistributionReady(0);

      const types = await program.getTokenTypes();
      expect(types[0].totalMinted).to.equal(500n);
    });

    it("getDistributionInfo includes tokenId", async () => {
      await program.defineTokenType("Badge", "BDGE", 50, "", true, true);
      await program.createDistribution(0n);
      await program.createDistribution(1n);

      const info0 = await program.getDistributionInfo(0);
      const info1 = await program.getDistributionInfo(1);

      expect(info0.tokenId).to.equal(0n);
      expect(info1.tokenId).to.equal(1n);
    });
  });

  describe("Full Integration: Default Flow", function () {
    it("completes the full default flow", async () => {
      await program.setCrowdfunding(TARGET, deadline);

      await program.createDistribution(tokenId);
      await program.createDistribution(tokenId);

      await program.setBeneficiaries(0, [beneficiary1.address], [5000n]);
      await program.setBeneficiaries(1, [beneficiary2.address], [3000n]);

      await program.markDistributionReady(0);
      await program.markDistributionReady(1);

      await program.connect(donor1).contribute({ value: ethers.parseEther("7") });
      await program.connect(donor2).contribute({ value: ethers.parseEther("3") });

      const ownerBefore = await ethers.provider.getBalance(owner.address);
      const tx = await program.execute();
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const ownerAfter = await ethers.provider.getBalance(owner.address);

      expect(ownerAfter - ownerBefore + gasCost).to.equal(TARGET);

      const token = await getToken(program);
      expect(await token.balanceOf(beneficiary1.address, tokenId)).to.equal(5000n);
      expect(await token.balanceOf(beneficiary2.address, tokenId)).to.equal(3000n);

      expect(await program.state()).to.equal(2); // COMPLETED
    });
  });
});
