import { expect } from "chai";
import { ethers } from "hardhat";
import { CGCrowdfunding } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("CGCrowdfunding", function () {
  let crowdfunding: CGCrowdfunding;
  let owner: HardhatEthersSigner;
  let donor1: HardhatEthersSigner;
  let donor2: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;

  const TARGET = ethers.parseEther("10");
  let deadline: number;

  beforeEach(async () => {
    [owner, donor1, donor2, recipient] = await ethers.getSigners();
    const now = await time.latest();
    deadline = now + 7 * 24 * 60 * 60; // 1 week from now

    const factory = await ethers.getContractFactory("CGCrowdfunding");
    crowdfunding = await factory.deploy(owner.address, TARGET, deadline);
  });

  describe("Deployment", function () {
    it("sets target, deadline, and owner", async () => {
      expect(await crowdfunding.fundingTarget()).to.equal(TARGET);
      expect(await crowdfunding.deadline()).to.equal(deadline);
      expect(await crowdfunding.owner()).to.equal(owner.address);
    });

    it("starts in UNFUNDED state", async () => {
      expect(await crowdfunding.state()).to.equal(0); // UNFUNDED
    });

    it("reverts with zero target", async () => {
      const factory = await ethers.getContractFactory("CGCrowdfunding");
      await expect(factory.deploy(owner.address, 0, deadline)).to.be.revertedWithCustomError(
        crowdfunding,
        "ZeroTarget",
      );
    });

    it("reverts with deadline in the past", async () => {
      const factory = await ethers.getContractFactory("CGCrowdfunding");
      const pastDeadline = (await time.latest()) - 1;
      await expect(factory.deploy(owner.address, TARGET, pastDeadline)).to.be.revertedWithCustomError(
        crowdfunding,
        "DeadlineInPast",
      );
    });
  });

  describe("Contributing", function () {
    it("accepts ETH contributions", async () => {
      const amount = ethers.parseEther("1");
      await expect(crowdfunding.connect(donor1).contribute({ value: amount }))
        .to.emit(crowdfunding, "ContributionReceived")
        .withArgs(donor1.address, amount);

      expect(await crowdfunding.contributions(donor1.address)).to.equal(amount);
      expect(await crowdfunding.totalRaised()).to.equal(amount);
    });

    it("accumulates multiple contributions from same donor", async () => {
      await crowdfunding.connect(donor1).contribute({ value: ethers.parseEther("2") });
      await crowdfunding.connect(donor1).contribute({ value: ethers.parseEther("3") });
      expect(await crowdfunding.contributions(donor1.address)).to.equal(ethers.parseEther("5"));
    });

    it("transitions to FUNDED when target is met", async () => {
      await expect(crowdfunding.connect(donor1).contribute({ value: TARGET }))
        .to.emit(crowdfunding, "CrowdfundingFunded")
        .withArgs(TARGET);
      expect(await crowdfunding.state()).to.equal(1); // FUNDED
    });

    it("transitions to FUNDED when target is exceeded", async () => {
      const overTarget = TARGET + ethers.parseEther("1");
      await crowdfunding.connect(donor1).contribute({ value: overTarget });
      expect(await crowdfunding.state()).to.equal(1); // FUNDED
    });

    it("rejects contributions after FUNDED", async () => {
      await crowdfunding.connect(donor1).contribute({ value: TARGET });
      await expect(
        crowdfunding.connect(donor2).contribute({ value: ethers.parseEther("1") }),
      ).to.be.revertedWithCustomError(crowdfunding, "NotInState");
    });

    it("reverts on zero value", async () => {
      await expect(crowdfunding.connect(donor1).contribute({ value: 0 })).to.be.revertedWithCustomError(
        crowdfunding,
        "NoContribution",
      );
    });

    it("reverts after deadline", async () => {
      await time.increaseTo(deadline + 1);
      await expect(
        crowdfunding.connect(donor1).contribute({ value: ethers.parseEther("1") }),
      ).to.be.revertedWithCustomError(crowdfunding, "DeadlinePassed");
    });

    it("reverts when CANCELLED", async () => {
      await crowdfunding.cancel();
      await expect(
        crowdfunding.connect(donor1).contribute({ value: ethers.parseEther("1") }),
      ).to.be.revertedWithCustomError(crowdfunding, "NotInState");
    });
  });

  describe("Cancel Contribution", function () {
    it("donor can cancel contribution while UNFUNDED", async () => {
      const amount = ethers.parseEther("3");
      await crowdfunding.connect(donor1).contribute({ value: amount });

      const balanceBefore = await ethers.provider.getBalance(donor1.address);
      const tx = await crowdfunding.connect(donor1).cancelContribution();
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(donor1.address);

      expect(balanceAfter - balanceBefore + gasCost).to.equal(amount);
      expect(await crowdfunding.contributions(donor1.address)).to.equal(0);
      expect(await crowdfunding.totalRaised()).to.equal(0);
    });

    it("emits ContributionCancelled", async () => {
      const amount = ethers.parseEther("2");
      await crowdfunding.connect(donor1).contribute({ value: amount });
      await expect(crowdfunding.connect(donor1).cancelContribution())
        .to.emit(crowdfunding, "ContributionCancelled")
        .withArgs(donor1.address, amount);
    });

    it("reverts if no contribution", async () => {
      await expect(crowdfunding.connect(donor1).cancelContribution()).to.be.revertedWithCustomError(
        crowdfunding,
        "NoContribution",
      );
    });

    it("reverts if FUNDED", async () => {
      await crowdfunding.connect(donor1).contribute({ value: TARGET });
      await expect(crowdfunding.connect(donor1).cancelContribution()).to.be.revertedWithCustomError(
        crowdfunding,
        "NotInState",
      );
    });
  });

  describe("Withdraw", function () {
    it("owner can withdraw when FUNDED", async () => {
      await crowdfunding.connect(donor1).contribute({ value: TARGET });

      const balanceBefore = await ethers.provider.getBalance(recipient.address);
      await expect(crowdfunding.withdraw(recipient.address))
        .to.emit(crowdfunding, "FundsWithdrawn")
        .withArgs(recipient.address, TARGET);

      const balanceAfter = await ethers.provider.getBalance(recipient.address);
      expect(balanceAfter - balanceBefore).to.equal(TARGET);
      expect(await crowdfunding.state()).to.equal(2); // WITHDRAWN
    });

    it("reverts if not FUNDED", async () => {
      await expect(crowdfunding.withdraw(recipient.address)).to.be.revertedWithCustomError(crowdfunding, "NotInState");
    });

    it("reverts if not owner", async () => {
      await crowdfunding.connect(donor1).contribute({ value: TARGET });
      await expect(crowdfunding.connect(donor1).withdraw(donor1.address)).to.be.revertedWithCustomError(
        crowdfunding,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Cancel", function () {
    it("owner can cancel when UNFUNDED", async () => {
      await expect(crowdfunding.cancel()).to.emit(crowdfunding, "CrowdfundingCancelled");
      expect(await crowdfunding.state()).to.equal(3); // CANCELLED
    });

    it("reverts if FUNDED", async () => {
      await crowdfunding.connect(donor1).contribute({ value: TARGET });
      await expect(crowdfunding.cancel()).to.be.revertedWithCustomError(crowdfunding, "NotInState");
    });

    it("reverts if not owner", async () => {
      await expect(crowdfunding.connect(donor1).cancel()).to.be.revertedWithCustomError(
        crowdfunding,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Refund", function () {
    it("donor can claim refund after CANCELLED", async () => {
      const amount = ethers.parseEther("5");
      await crowdfunding.connect(donor1).contribute({ value: amount });
      await crowdfunding.cancel();

      const balanceBefore = await ethers.provider.getBalance(donor1.address);
      const tx = await crowdfunding.connect(donor1).refund();
      const receipt = await tx.wait();
      const gasCost = receipt!.gasUsed * receipt!.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(donor1.address);

      expect(balanceAfter - balanceBefore + gasCost).to.equal(amount);
    });

    it("emits RefundClaimed", async () => {
      const amount = ethers.parseEther("5");
      await crowdfunding.connect(donor1).contribute({ value: amount });
      await crowdfunding.cancel();
      await expect(crowdfunding.connect(donor1).refund())
        .to.emit(crowdfunding, "RefundClaimed")
        .withArgs(donor1.address, amount);
    });

    it("reverts if not CANCELLED", async () => {
      await crowdfunding.connect(donor1).contribute({ value: ethers.parseEther("1") });
      await expect(crowdfunding.connect(donor1).refund()).to.be.revertedWithCustomError(crowdfunding, "NotInState");
    });

    it("reverts if no contribution", async () => {
      await crowdfunding.cancel();
      await expect(crowdfunding.connect(donor1).refund()).to.be.revertedWithCustomError(crowdfunding, "NoContribution");
    });

    it("cannot double-refund", async () => {
      await crowdfunding.connect(donor1).contribute({ value: ethers.parseEther("3") });
      await crowdfunding.cancel();
      await crowdfunding.connect(donor1).refund();
      await expect(crowdfunding.connect(donor1).refund()).to.be.revertedWithCustomError(crowdfunding, "NoContribution");
    });

    it("multiple donors can each refund", async () => {
      await crowdfunding.connect(donor1).contribute({ value: ethers.parseEther("3") });
      await crowdfunding.connect(donor2).contribute({ value: ethers.parseEther("4") });
      await crowdfunding.cancel();

      await expect(crowdfunding.connect(donor1).refund()).to.not.be.reverted;
      await expect(crowdfunding.connect(donor2).refund()).to.not.be.reverted;
    });
  });
});
