import { expect } from "chai";
import { ethers } from "hardhat";
import { CGToken, CGDistribution } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("CGDistribution", function () {
  let token: CGToken;
  let distribution: CGDistribution;
  let owner: HardhatEthersSigner;
  let beneficiary1: HardhatEthersSigner;
  let beneficiary2: HardhatEthersSigner;
  let beneficiary3: HardhatEthersSigner;
  let nonOwner: HardhatEthersSigner;

  const TOKEN_ID = 0n;

  beforeEach(async () => {
    [owner, beneficiary1, beneficiary2, beneficiary3, nonOwner] = await ethers.getSigners();

    const tokenFactory = await ethers.getContractFactory("CGToken");
    token = await tokenFactory.deploy(owner.address);
    await token.defineTokenType("Aid Token", "AID", 0, ""); // tokenId = 0, unlimited supply

    const distFactory = await ethers.getContractFactory("CGDistribution");
    distribution = await distFactory.deploy(owner.address, await token.getAddress(), TOKEN_ID);
  });

  describe("Deployment", function () {
    it("sets token, tokenId, and owner", async () => {
      expect(await distribution.token()).to.equal(await token.getAddress());
      expect(await distribution.tokenId()).to.equal(TOKEN_ID);
      expect(await distribution.owner()).to.equal(owner.address);
    });

    it("starts in INACTIVE state", async () => {
      expect(await distribution.state()).to.equal(0); // INACTIVE
    });
  });

  describe("Set Beneficiaries", function () {
    it("sets beneficiary list", async () => {
      const addrs = [beneficiary1.address, beneficiary2.address];
      const amts = [100n, 200n];

      await expect(distribution.setBeneficiaries(addrs, amts))
        .to.emit(distribution, "BeneficiariesSet")
        .withArgs(2, 300n);

      expect(await distribution.beneficiaryCount()).to.equal(2);
      expect(await distribution.beneficiaries(0)).to.equal(beneficiary1.address);
      expect(await distribution.amounts(0)).to.equal(100n);
      expect(await distribution.totalRequired()).to.equal(300n);
    });

    it("supports badge-like distribution (amount=1 per beneficiary)", async () => {
      // NFT/badge style: each beneficiary gets exactly 1
      await token.defineTokenType("Badge", "BDGE", 3, ""); // maxSupply=3 for 3 badges
      const badgeDistFactory = await ethers.getContractFactory("CGDistribution");
      const badgeDist = await badgeDistFactory.deploy(owner.address, await token.getAddress(), 1n);

      await expect(
        badgeDist.setBeneficiaries([beneficiary1.address, beneficiary2.address, beneficiary3.address], [1n, 1n, 1n]),
      ).to.not.be.reverted;
      expect(await badgeDist.totalRequired()).to.equal(3n);
    });

    it("can replace beneficiary list while INACTIVE", async () => {
      await distribution.setBeneficiaries([beneficiary1.address], [100n]);
      await distribution.setBeneficiaries([beneficiary2.address, beneficiary3.address], [500n, 600n]);

      expect(await distribution.beneficiaryCount()).to.equal(2);
      expect(await distribution.beneficiaries(0)).to.equal(beneficiary2.address);
      expect(await distribution.totalRequired()).to.equal(1100n);
    });

    it("reverts on array length mismatch", async () => {
      await expect(distribution.setBeneficiaries([beneficiary1.address], [100n, 200n])).to.be.revertedWithCustomError(
        distribution,
        "ArrayLengthMismatch",
      );
    });

    it("reverts on empty array", async () => {
      await expect(distribution.setBeneficiaries([], [])).to.be.revertedWithCustomError(
        distribution,
        "EmptyBeneficiaries",
      );
    });

    it("reverts on zero address", async () => {
      await expect(distribution.setBeneficiaries([ethers.ZeroAddress], [100n])).to.be.revertedWithCustomError(
        distribution,
        "ZeroAddress",
      );
    });

    it("reverts on zero amount", async () => {
      await expect(distribution.setBeneficiaries([beneficiary1.address], [0n])).to.be.revertedWithCustomError(
        distribution,
        "ZeroAmount",
      );
    });

    it("reverts if not owner", async () => {
      await expect(
        distribution.connect(nonOwner).setBeneficiaries([beneficiary1.address], [100n]),
      ).to.be.revertedWithCustomError(distribution, "OwnableUnauthorizedAccount");
    });
  });

  describe("Mark Ready", function () {
    it("transitions to READY when tokens are sufficient", async () => {
      await distribution.setBeneficiaries([beneficiary1.address, beneficiary2.address], [100n, 200n]);
      await token.mint(await distribution.getAddress(), TOKEN_ID, 300n);

      await expect(distribution.markReady()).to.emit(distribution, "DistributionReady");
      expect(await distribution.state()).to.equal(1); // READY
    });

    it("reverts if no beneficiaries set", async () => {
      await expect(distribution.markReady()).to.be.revertedWithCustomError(distribution, "EmptyBeneficiaries");
    });

    it("reverts if insufficient tokens", async () => {
      await distribution.setBeneficiaries([beneficiary1.address], [1000n]);
      await token.mint(await distribution.getAddress(), TOKEN_ID, 500n);

      await expect(distribution.markReady()).to.be.revertedWithCustomError(distribution, "InsufficientTokenBalance");
    });

    it("reverts if not INACTIVE", async () => {
      await distribution.setBeneficiaries([beneficiary1.address], [100n]);
      await token.mint(await distribution.getAddress(), TOKEN_ID, 100n);
      await distribution.markReady();

      await expect(distribution.markReady()).to.be.revertedWithCustomError(distribution, "NotInState");
    });

    it("cannot set beneficiaries after READY", async () => {
      await distribution.setBeneficiaries([beneficiary1.address], [100n]);
      await token.mint(await distribution.getAddress(), TOKEN_ID, 100n);
      await distribution.markReady();

      await expect(distribution.setBeneficiaries([beneficiary2.address], [200n])).to.be.revertedWithCustomError(
        distribution,
        "NotInState",
      );
    });
  });

  describe("Distribute", function () {
    it("distributes fungible tokens to all beneficiaries", async () => {
      const addrs = [beneficiary1.address, beneficiary2.address, beneficiary3.address];
      const amts = [100n, 200n, 300n];

      await distribution.setBeneficiaries(addrs, amts);
      await token.mint(await distribution.getAddress(), TOKEN_ID, 600n);
      await distribution.markReady();

      await expect(distribution.distribute()).to.emit(distribution, "TokensDistributed").withArgs(3, 600n);

      expect(await token.balanceOf(beneficiary1.address, TOKEN_ID)).to.equal(100n);
      expect(await token.balanceOf(beneficiary2.address, TOKEN_ID)).to.equal(200n);
      expect(await token.balanceOf(beneficiary3.address, TOKEN_ID)).to.equal(300n);
      expect(await distribution.state()).to.equal(2); // DISTRIBUTED
    });

    it("distributes badge tokens (amount=1 each) to all beneficiaries", async () => {
      await token.defineTokenType("Badge", "BDGE", 3, "");
      const badgeDistFactory = await ethers.getContractFactory("CGDistribution");
      const badgeDist = await badgeDistFactory.deploy(owner.address, await token.getAddress(), 1n);

      await badgeDist.setBeneficiaries(
        [beneficiary1.address, beneficiary2.address, beneficiary3.address],
        [1n, 1n, 1n],
      );
      await token.mint(await badgeDist.getAddress(), 1n, 3n);
      await badgeDist.markReady();
      await badgeDist.distribute();

      expect(await token.balanceOf(beneficiary1.address, 1n)).to.equal(1n);
      expect(await token.balanceOf(beneficiary2.address, 1n)).to.equal(1n);
      expect(await token.balanceOf(beneficiary3.address, 1n)).to.equal(1n);
    });

    it("reverts if not READY", async () => {
      await distribution.setBeneficiaries([beneficiary1.address], [100n]);
      await expect(distribution.distribute()).to.be.revertedWithCustomError(distribution, "NotInState");
    });

    it("reverts if not owner", async () => {
      await distribution.setBeneficiaries([beneficiary1.address], [100n]);
      await token.mint(await distribution.getAddress(), TOKEN_ID, 100n);
      await distribution.markReady();

      await expect(distribution.connect(nonOwner).distribute()).to.be.revertedWithCustomError(
        distribution,
        "OwnableUnauthorizedAccount",
      );
    });

    it("cannot distribute twice", async () => {
      await distribution.setBeneficiaries([beneficiary1.address], [100n]);
      await token.mint(await distribution.getAddress(), TOKEN_ID, 100n);
      await distribution.markReady();
      await distribution.distribute();

      await expect(distribution.distribute()).to.be.revertedWithCustomError(distribution, "NotInState");
    });
  });

  describe("IERC1155Receiver", function () {
    it("accepts ERC-1155 safe transfers", async () => {
      // CGDistribution must implement IERC1155Receiver to receive tokens via safeMint/safeTransfer
      await expect(token.mint(await distribution.getAddress(), TOKEN_ID, 100n)).to.not.be.reverted;
    });

    it("supports IERC1155Receiver interface", async () => {
      const IERC1155_RECEIVER_ID = "0x4e2312e0";
      expect(await distribution.supportsInterface(IERC1155_RECEIVER_ID)).to.equal(true);
    });
  });
});
