import { expect } from "chai";
import { ethers } from "hardhat";
import { CGToken } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("CGToken", function () {
  let token: CGToken;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("CGToken");
    token = await factory.deploy(owner.address);
  });

  describe("Deployment", function () {
    it("sets the owner", async () => {
      expect(await token.owner()).to.equal(owner.address);
    });

    it("starts with no token types defined", async () => {
      expect(await token.nextTokenId()).to.equal(0n);
    });
  });

  describe("defineTokenType", function () {
    it("defines a fungible type (unlimited supply) and returns tokenId 0", async () => {
      await expect(token.defineTokenType("Food Voucher", "FOOD", 0, ""))
        .to.emit(token, "TokenTypeDefined")
        .withArgs(0n, "Food Voucher", "FOOD", 0n);

      expect(await token.nextTokenId()).to.equal(1n);
      const tt = await token.getTokenType(0n);
      expect(tt.name).to.equal("Food Voucher");
      expect(tt.symbol).to.equal("FOOD");
      expect(tt.maxSupply).to.equal(0n);
      expect(tt.totalMinted).to.equal(0n);
    });

    it("defines a capped badge type (maxSupply = 100)", async () => {
      await token.defineTokenType("Bronze Badge", "BDGE", 100, "");
      const tt = await token.getTokenType(0n);
      expect(tt.maxSupply).to.equal(100n);
    });

    it("defines a unique NFT type (maxSupply = 1)", async () => {
      await token.defineTokenType("Certificate #1", "CERT", 1, "");
      const tt = await token.getTokenType(0n);
      expect(tt.maxSupply).to.equal(1n);
    });

    it("auto-increments tokenId across multiple types", async () => {
      await token.defineTokenType("Type A", "A", 0, "");
      await token.defineTokenType("Type B", "B", 50, "");
      await token.defineTokenType("Type C", "C", 1, "");
      expect(await token.nextTokenId()).to.equal(3n);
    });

    it("stores a per-type URI when provided", async () => {
      await token.defineTokenType("Art NFT", "ART", 1, "ipfs://QmFoo");
      expect(await token.uri(0n)).to.equal("ipfs://QmFoo");
    });

    it("falls back to contract-level URI when none set for type", async () => {
      await token.defineTokenType("Food Voucher", "FOOD", 0, "");
      // No per-type URI set, returns base URI (empty string since constructor uses "")
      expect(await token.uri(0n)).to.equal("");
    });

    it("reverts on unknown tokenId", async () => {
      await expect(token.getTokenType(0n)).to.be.revertedWithCustomError(token, "UnknownTokenType");
    });

    it("reverts if not owner", async () => {
      await expect(token.connect(alice).defineTokenType("X", "X", 0, "")).to.be.revertedWithCustomError(
        token,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Minting", function () {
    const TOKEN_ID = 0n;

    beforeEach(async () => {
      await token.defineTokenType("Food Voucher", "FOOD", 0, "");
    });

    it("owner can mint fungible tokens", async () => {
      await token.mint(alice.address, TOKEN_ID, 1000n);
      expect(await token.balanceOf(alice.address, TOKEN_ID)).to.equal(1000n);

      const tt = await token.getTokenType(TOKEN_ID);
      expect(tt.totalMinted).to.equal(1000n);
    });

    it("owner can mint badge tokens (capped)", async () => {
      await token.defineTokenType("Badge", "BDGE", 5, "");
      const badgeId = 1n;

      await token.mint(alice.address, badgeId, 3n);
      expect(await token.balanceOf(alice.address, badgeId)).to.equal(3n);
    });

    it("reverts when minting exceeds maxSupply", async () => {
      await token.defineTokenType("Limited", "LTD", 10, "");
      const ltdId = 1n;

      await token.mint(owner.address, ltdId, 10n);
      await expect(token.mint(alice.address, ltdId, 1n)).to.be.revertedWithCustomError(token, "ExceedsMaxSupply");
    });

    it("owner can mint NFT (maxSupply=1)", async () => {
      await token.defineTokenType("Unique", "UNIQ", 1, "");
      const nftId = 1n;

      await token.mint(alice.address, nftId, 1n);
      expect(await token.balanceOf(alice.address, nftId)).to.equal(1n);

      await expect(token.mint(owner.address, nftId, 1n)).to.be.revertedWithCustomError(token, "ExceedsMaxSupply");
    });

    it("reverts on unknown tokenId", async () => {
      await expect(token.mint(alice.address, 99n, 1n)).to.be.revertedWithCustomError(token, "UnknownTokenType");
    });

    it("non-owner cannot mint", async () => {
      await expect(token.connect(alice).mint(alice.address, TOKEN_ID, 1n)).to.be.revertedWithCustomError(
        token,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Batch Minting", function () {
    it("mints multiple token types in one call", async () => {
      await token.defineTokenType("Type A", "A", 0, "");
      await token.defineTokenType("Type B", "B", 0, "");

      await token.mintBatch(alice.address, [0n, 1n], [500n, 200n]);

      expect(await token.balanceOf(alice.address, 0n)).to.equal(500n);
      expect(await token.balanceOf(alice.address, 1n)).to.equal(200n);
    });

    it("reverts if any tokenId in batch exceeds maxSupply", async () => {
      await token.defineTokenType("Capped", "CAP", 10, "");
      await token.defineTokenType("Open", "OPN", 0, "");

      await expect(token.mintBatch(alice.address, [0n, 1n], [11n, 100n])).to.be.revertedWithCustomError(
        token,
        "ExceedsMaxSupply",
      );
    });
  });

  describe("Burning", function () {
    it("holder can burn their own tokens", async () => {
      await token.defineTokenType("Food Voucher", "FOOD", 0, "");
      await token.mint(alice.address, 0n, 1000n);

      await token.connect(alice).burn(alice.address, 0n, 400n);
      expect(await token.balanceOf(alice.address, 0n)).to.equal(600n);
    });
  });

  describe("Transfers", function () {
    it("standard ERC-1155 transfer works", async () => {
      await token.defineTokenType("Food Voucher", "FOOD", 0, "");
      await token.mint(owner.address, 0n, 500n);
      await token.safeTransferFrom(owner.address, alice.address, 0n, 200n, "0x");
      expect(await token.balanceOf(alice.address, 0n)).to.equal(200n);
      expect(await token.balanceOf(owner.address, 0n)).to.equal(300n);
    });
  });
});
