import { expect } from "chai";
import { ethers } from "hardhat";
import { CGProgram, CGToken, CGCrowdfunding, CGDistribution, MockUSDC } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const TARGET = 10_000_000n; // 10 USDC
const ONE = 1_000_000n;
const SEED = 1_000_000_000n;

describe("CGProgram", function () {
  let program: CGProgram;
  let usdc: MockUSDC;
  let tokenId: bigint;
  let owner: HardhatEthersSigner;
  let donor1: HardhatEthersSigner;
  let donor2: HardhatEthersSigner;
  let beneficiary1: HardhatEthersSigner;
  let beneficiary2: HardhatEthersSigner;
  let nonOwner: HardhatEthersSigner;
  let deadline: number;

  async function deployUsdc(): Promise<MockUSDC> {
    const f = await ethers.getContractFactory("MockUSDC");
    const u = await f.deploy();
    await u.mint(donor1.address, SEED);
    await u.mint(donor2.address, SEED);
    return u;
  }

  async function deployProgram(lock = false): Promise<CGProgram> {
    const now = await time.latest();
    deadline = now + 7 * 24 * 60 * 60;

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

  async function donateThrough(prog: CGProgram, donor: HardhatEthersSigner, amount: bigint) {
    await usdc.connect(donor).approve(await prog.getAddress(), amount);
    return prog.connect(donor).donate(amount);
  }

  beforeEach(async () => {
    [owner, donor1, donor2, beneficiary1, beneficiary2, nonOwner] = await ethers.getSigners();
    usdc = await deployUsdc();
    program = await deployProgram(false);
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
      expect(await program.state()).to.equal(0);
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
      expect(await token.nextTokenId()).to.equal(3n);
    });

    it("reverts if not owner", async () => {
      await expect(
        program.connect(nonOwner).defineTokenType("X", "X", 0, "", true, true),
      ).to.be.revertedWithCustomError(program, "OwnableUnauthorizedAccount");
    });

    it("returns correct tokenId", async () => {
      const token = await getToken(program);
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
    it("deploys a crowdfunding owned by the program with the chosen currency", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      const cf = await getCrowdfunding(program);
      expect(await cf.owner()).to.equal(await program.getAddress());
      expect(await cf.fundingTarget()).to.equal(TARGET);
      expect(await cf.token()).to.equal(await usdc.getAddress());
    });

    it("emits CrowdfundingSet with crowdfunding and currency", async () => {
      await expect(program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline)).to.emit(
        program,
        "CrowdfundingSet",
      );
    });

    it("reverts if crowdfunding already set", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await expect(program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline)).to.be.revertedWithCustomError(
        program,
        "CrowdfundingAlreadySet",
      );
    });

    it("reverts if not owner", async () => {
      await expect(
        program.connect(nonOwner).setCrowdfunding(await usdc.getAddress(), TARGET, deadline),
      ).to.be.revertedWithCustomError(program, "OwnableUnauthorizedAccount");
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
      await program.createDistribution(0n);
      await program.createDistribution(1n);
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
      expect(await dist.state()).to.equal(1);

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
      expect(await dist.state()).to.equal(1);

      const token = await getToken(program);
      expect(await token.balanceOf(await dist.getAddress(), badgeTokenId)).to.equal(2n);
    });
  });

  describe("Donate (via program)", function () {
    it("forwards donations to crowdfunding and credits the donor", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await program.createDistribution(tokenId);

      await donateThrough(program, donor1, ONE * 5n);

      const cf = await getCrowdfunding(program);
      expect(await cf.totalTracked()).to.equal(ONE * 5n);
      expect(await cf.contributions(donor1.address)).to.equal(ONE * 5n);
    });

    it("reverts if no crowdfunding set", async () => {
      await usdc.connect(donor1).approve(await program.getAddress(), ONE);
      await expect(program.connect(donor1).donate(ONE)).to.be.revertedWithCustomError(program, "NoCrowdfunding");
    });

    it("donateWithPermit forwards to crowdfunding", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await program.createDistribution(tokenId);

      const network = await ethers.provider.getNetwork();
      const programAddr = await program.getAddress();
      const tokenName = await usdc.name();
      const nonce = await usdc.nonces(donor1.address);

      const sig = await donor1.signTypedData(
        {
          name: tokenName,
          version: "1",
          chainId: network.chainId,
          verifyingContract: await usdc.getAddress(),
        },
        {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        {
          owner: donor1.address,
          spender: programAddr,
          value: ONE * 4n,
          nonce,
          deadline,
        },
      );
      const { v, r, s } = ethers.Signature.from(sig);

      await program.connect(donor1).donateWithPermit(ONE * 4n, deadline, v, r, s);
      const cf = await getCrowdfunding(program);
      expect(await cf.contributions(donor1.address)).to.equal(ONE * 4n);
    });
  });

  describe("Execute", function () {
    async function setupForExecution() {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await program.createDistribution(tokenId);
      await program.setBeneficiaries(0, [beneficiary1.address, beneficiary2.address], [1000n, 2000n]);
      await program.markDistributionReady(0);

      await donateThrough(program, donor1, TARGET);
    }

    it("withdraws funds and distributes tokens in one transaction", async () => {
      await setupForExecution();

      const ownerBefore = await usdc.balanceOf(owner.address);
      await program.execute();
      const ownerAfter = await usdc.balanceOf(owner.address);

      expect(ownerAfter - ownerBefore).to.equal(TARGET);

      const token = await getToken(program);
      expect(await token.balanceOf(beneficiary1.address, tokenId)).to.equal(1000n);
      expect(await token.balanceOf(beneficiary2.address, tokenId)).to.equal(2000n);

      expect(await program.state()).to.equal(2); // COMPLETED
      const cf = await getCrowdfunding(program);
      expect(await cf.state()).to.equal(1); // WITHDRAWN
      const dist = await getDistribution(program, 0);
      expect(await dist.state()).to.equal(2);
    });

    it("emits ProgramExecuted", async () => {
      await setupForExecution();
      await expect(program.execute()).to.emit(program, "ProgramExecuted");
    });

    it("works with multiple distributions across different token types", async () => {
      await program.defineTokenType("Badge", "BDGE", 2, "", true, true);
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);

      await program.createDistribution(0n);
      await program.setBeneficiaries(0, [beneficiary1.address], [500n]);
      await program.markDistributionReady(0);

      await program.createDistribution(1n);
      await program.setBeneficiaries(1, [beneficiary1.address, beneficiary2.address], [1n, 1n]);
      await program.markDistributionReady(1);

      await donateThrough(program, donor1, TARGET);
      await program.execute();

      const token = await getToken(program);
      expect(await token.balanceOf(beneficiary1.address, 0n)).to.equal(500n);
      expect(await token.balanceOf(beneficiary1.address, 1n)).to.equal(1n);
      expect(await token.balanceOf(beneficiary2.address, 1n)).to.equal(1n);
      expect(await program.state()).to.equal(2);
    });

    it("reverts if crowdfunding has not reached its target", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await program.createDistribution(tokenId);
      await program.setBeneficiaries(0, [beneficiary1.address], [100n]);
      await program.markDistributionReady(0);

      await expect(program.execute()).to.be.revertedWithCustomError(await getCrowdfunding(program), "TargetNotMet");
    });

    it("reverts if no distributions", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await donateThrough(program, donor1, TARGET);

      await expect(program.execute()).to.be.revertedWithCustomError(program, "NoDistributions");
    });

    it("reverts if distribution not READY", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await program.createDistribution(tokenId);
      await program.setBeneficiaries(0, [beneficiary1.address], [100n]);
      await donateThrough(program, donor1, TARGET);

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

    it("execute() completes a direct-transfer-only campaign once isFunded() is true", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await program.createDistribution(tokenId);
      await program.setBeneficiaries(0, [beneficiary1.address], [100n]);
      await program.markDistributionReady(0);

      // Fund entirely via direct transfer — no donate ever called.
      const cf = await getCrowdfunding(program);
      await usdc.connect(donor1).transfer(await cf.getAddress(), TARGET);

      // Crowdfunding stays ACTIVE; isFunded() reads from balance.
      expect(await cf.state()).to.equal(0); // ACTIVE
      expect(await cf.isFunded()).to.equal(true);

      const ownerBefore = await usdc.balanceOf(owner.address);
      await program.execute();
      const ownerAfter = await usdc.balanceOf(owner.address);

      expect(ownerAfter - ownerBefore).to.equal(TARGET);
      expect(await cf.state()).to.equal(1); // WITHDRAWN
      expect(await cf.totalRaised()).to.equal(TARGET);
      expect(await program.state()).to.equal(2); // COMPLETED
    });

    it("distributes non-transferable (soulbound) tokens to beneficiaries", async () => {
      await program.defineTokenType("Soulbound Badge", "SOUL", 0, "", false, true);
      const soulboundTokenId = 1n;

      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await program.createDistribution(soulboundTokenId);
      await program.setBeneficiaries(0, [beneficiary1.address, beneficiary2.address], [10n, 20n]);
      await program.markDistributionReady(0);

      await donateThrough(program, donor1, TARGET);
      await program.execute();

      const token = await getToken(program);
      expect(await token.balanceOf(beneficiary1.address, soulboundTokenId)).to.equal(10n);
      expect(await token.balanceOf(beneficiary2.address, soulboundTokenId)).to.equal(20n);
      expect(await program.state()).to.equal(2);

      await expect(
        token
          .connect(beneficiary1)
          .safeTransferFrom(beneficiary1.address, beneficiary2.address, soulboundTokenId, 1n, "0x"),
      ).to.be.revertedWithCustomError(token, "TransferDisabled");
    });
  });

  describe("Untracked direct transfers", function () {
    it("returnUntracked forwards to crowdfunding", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await program.createDistribution(tokenId);
      const cf = await getCrowdfunding(program);

      // Stray direct transfer
      await usdc.connect(donor1).transfer(await cf.getAddress(), ONE * 2n);

      const before = await usdc.balanceOf(donor2.address);
      await program.returnUntracked(donor2.address, ONE * 2n);
      const after = await usdc.balanceOf(donor2.address);

      expect(after - before).to.equal(ONE * 2n);
    });

    it("returnUntracked rejects non-owner", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await expect(program.connect(nonOwner).returnUntracked(donor2.address, 1n)).to.be.revertedWithCustomError(
        program,
        "OwnableUnauthorizedAccount",
      );
    });

    it("returnUntracked reverts if no crowdfunding", async () => {
      await expect(program.returnUntracked(donor2.address, 1n)).to.be.revertedWithCustomError(
        program,
        "NoCrowdfunding",
      );
    });

    it("sweepUntracked forwards to crowdfunding after cancel", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await program.createDistribution(tokenId);
      const cf = await getCrowdfunding(program);

      await usdc.connect(donor1).transfer(await cf.getAddress(), ONE * 3n);
      await cf.connect(owner); // owner is program; we're going to cancel via the program
      await program.cancel();

      const before = await usdc.balanceOf(beneficiary1.address);
      await program.sweepUntracked(beneficiary1.address);
      const after = await usdc.balanceOf(beneficiary1.address);

      expect(after - before).to.equal(ONE * 3n);
    });

    it("sweepUntracked rejects non-owner", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await expect(program.connect(nonOwner).sweepUntracked(beneficiary1.address)).to.be.revertedWithCustomError(
        program,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Cancel", function () {
    it("cancels program and crowdfunding", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await program.createDistribution(tokenId);

      await expect(program.cancel()).to.emit(program, "ProgramCancelled");
      expect(await program.state()).to.equal(3); // CANCELLED

      const cf = await getCrowdfunding(program);
      expect(await cf.state()).to.equal(2); // CANCELLED (crowdfunding state)
    });

    it("allows donor refunds after cancel", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await program.createDistribution(tokenId);

      await donateThrough(program, donor1, ONE * 3n);
      await program.cancel();

      const cf = await getCrowdfunding(program);
      await expect(cf.connect(donor1).refund()).to.not.be.reverted;
    });

    it("reverts if not ACTIVE", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await program.cancel();
      await expect(program.cancel()).to.be.revertedWithCustomError(program, "ProgramNotActive");
    });

    it("works even without crowdfunding set", async () => {
      await expect(program.cancel()).to.emit(program, "ProgramCancelled");
      expect(await program.state()).to.equal(3);
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

    it("rejects donations when no distributions exist", async () => {
      await lockedProgram.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await usdc.connect(donor1).approve(await lockedProgram.getAddress(), ONE);
      await expect(lockedProgram.connect(donor1).donate(ONE)).to.be.revertedWithCustomError(
        lockedProgram,
        "NoDistributions",
      );
    });

    it("rejects donations when distributions are not READY", async () => {
      await lockedProgram.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await lockedProgram.createDistribution(0n);
      await lockedProgram.setBeneficiaries(0, [beneficiary1.address], [100n]);

      await usdc.connect(donor1).approve(await lockedProgram.getAddress(), ONE);
      await expect(lockedProgram.connect(donor1).donate(ONE)).to.be.revertedWithCustomError(
        lockedProgram,
        "DistributionNotReady",
      );
    });

    it("accepts donations when all distributions are READY", async () => {
      await lockedProgram.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await lockedProgram.createDistribution(0n);
      await lockedProgram.setBeneficiaries(0, [beneficiary1.address], [100n]);
      await lockedProgram.markDistributionReady(0);

      await usdc.connect(donor1).approve(await lockedProgram.getAddress(), ONE);
      await expect(lockedProgram.connect(donor1).donate(ONE)).to.not.be.reverted;
    });

    it("blocks createDistribution after donations received", async () => {
      await lockedProgram.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await lockedProgram.createDistribution(0n);
      await lockedProgram.setBeneficiaries(0, [beneficiary1.address], [100n]);
      await lockedProgram.markDistributionReady(0);

      await usdc.connect(donor1).approve(await lockedProgram.getAddress(), ONE);
      await lockedProgram.connect(donor1).donate(ONE);

      await expect(lockedProgram.createDistribution(0n)).to.be.revertedWithCustomError(
        lockedProgram,
        "DistributionsLocked",
      );
    });

    it("allows full locked flow end-to-end", async () => {
      await lockedProgram.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);

      await lockedProgram.createDistribution(0n);
      await lockedProgram.setBeneficiaries(0, [beneficiary1.address, beneficiary2.address], [1000n, 2000n]);
      await lockedProgram.markDistributionReady(0);

      await usdc.connect(donor1).approve(await lockedProgram.getAddress(), ONE * 6n);
      await lockedProgram.connect(donor1).donate(ONE * 6n);

      await usdc.connect(donor2).approve(await lockedProgram.getAddress(), ONE * 4n);
      await lockedProgram.connect(donor2).donate(ONE * 4n);

      await lockedProgram.execute();

      const token = await getToken(lockedProgram);
      expect(await token.balanceOf(beneficiary1.address, 0n)).to.equal(1000n);
      expect(await token.balanceOf(beneficiary2.address, 0n)).to.equal(2000n);
      expect(await lockedProgram.state()).to.equal(2);
    });

    it("unlocked mode allows donations regardless of distribution state", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await program.createDistribution(tokenId);

      await usdc.connect(donor1).approve(await program.getAddress(), ONE);
      await expect(program.connect(donor1).donate(ONE)).to.not.be.reverted;
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

    it("getCrowdfundingInfo includes currency, totalTracked, and isFunded", async () => {
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);
      await program.createDistribution(tokenId);
      await donateThrough(program, donor1, ONE);

      const info = await program.getCrowdfundingInfo();
      expect(info.currency).to.equal(await usdc.getAddress());
      expect(info.fundingTarget).to.equal(TARGET);
      expect(info.totalTracked).to.equal(ONE);
      expect(info.totalRaised).to.equal(ONE);
      expect(info.isFunded).to.equal(false);
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
      await program.setCrowdfunding(await usdc.getAddress(), TARGET, deadline);

      await program.createDistribution(tokenId);
      await program.createDistribution(tokenId);

      await program.setBeneficiaries(0, [beneficiary1.address], [5000n]);
      await program.setBeneficiaries(1, [beneficiary2.address], [3000n]);

      await program.markDistributionReady(0);
      await program.markDistributionReady(1);

      await donateThrough(program, donor1, ONE * 7n);
      await donateThrough(program, donor2, ONE * 3n);

      const ownerBefore = await usdc.balanceOf(owner.address);
      await program.execute();
      const ownerAfter = await usdc.balanceOf(owner.address);

      expect(ownerAfter - ownerBefore).to.equal(TARGET);

      const token = await getToken(program);
      expect(await token.balanceOf(beneficiary1.address, tokenId)).to.equal(5000n);
      expect(await token.balanceOf(beneficiary2.address, tokenId)).to.equal(3000n);

      expect(await program.state()).to.equal(2);
    });
  });
});
