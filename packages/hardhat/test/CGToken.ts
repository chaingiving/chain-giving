import { expect } from "chai";
import { ethers } from "hardhat";
import { CGToken } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("CGToken", function () {
  let token: CGToken;
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
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
      await expect(token.defineTokenType("Food Voucher", "FOOD", 0, "", true, true))
        .to.emit(token, "TokenTypeDefined")
        .withArgs(0n, "Food Voucher", "FOOD", 0n, true, true);

      expect(await token.nextTokenId()).to.equal(1n);
      const tt = await token.getTokenType(0n);
      expect(tt.name).to.equal("Food Voucher");
      expect(tt.symbol).to.equal("FOOD");
      expect(tt.maxSupply).to.equal(0n);
      expect(tt.totalMinted).to.equal(0n);
      expect(tt.transferable).to.equal(true);
      expect(tt.burnable).to.equal(true);
    });

    it("defines a capped badge type (maxSupply = 100)", async () => {
      await token.defineTokenType("Bronze Badge", "BDGE", 100, "", true, true);
      const tt = await token.getTokenType(0n);
      expect(tt.maxSupply).to.equal(100n);
    });

    it("defines a unique NFT type (maxSupply = 1)", async () => {
      await token.defineTokenType("Certificate #1", "CERT", 1, "", true, true);
      const tt = await token.getTokenType(0n);
      expect(tt.maxSupply).to.equal(1n);
    });

    it("auto-increments tokenId across multiple types", async () => {
      await token.defineTokenType("Type A", "A", 0, "", true, true);
      await token.defineTokenType("Type B", "B", 50, "", true, true);
      await token.defineTokenType("Type C", "C", 1, "", true, true);
      expect(await token.nextTokenId()).to.equal(3n);
    });

    it("stores a per-type URI when provided", async () => {
      await token.defineTokenType("Art NFT", "ART", 1, "ipfs://QmFoo", true, true);
      expect(await token.uri(0n)).to.equal("ipfs://QmFoo");
    });

    it("falls back to contract-level URI when none set for type", async () => {
      await token.defineTokenType("Food Voucher", "FOOD", 0, "", true, true);
      // No per-type URI set, returns base URI (empty string since constructor uses "")
      expect(await token.uri(0n)).to.equal("");
    });

    it("stores transferable and burnable flags", async () => {
      await token.defineTokenType("Soulbound", "SOUL", 0, "", false, false);
      const tt = await token.getTokenType(0n);
      expect(tt.transferable).to.equal(false);
      expect(tt.burnable).to.equal(false);
    });

    it("reverts on unknown tokenId", async () => {
      await expect(token.getTokenType(0n)).to.be.revertedWithCustomError(token, "UnknownTokenType");
    });

    it("reverts if not owner", async () => {
      await expect(token.connect(alice).defineTokenType("X", "X", 0, "", true, true)).to.be.revertedWithCustomError(
        token,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Minting", function () {
    const TOKEN_ID = 0n;

    beforeEach(async () => {
      await token.defineTokenType("Food Voucher", "FOOD", 0, "", true, true);
    });

    it("owner can mint fungible tokens", async () => {
      await token.mint(alice.address, TOKEN_ID, 1000n);
      expect(await token.balanceOf(alice.address, TOKEN_ID)).to.equal(1000n);

      const tt = await token.getTokenType(TOKEN_ID);
      expect(tt.totalMinted).to.equal(1000n);
    });

    it("owner can mint badge tokens (capped)", async () => {
      await token.defineTokenType("Badge", "BDGE", 5, "", true, true);
      const badgeId = 1n;

      await token.mint(alice.address, badgeId, 3n);
      expect(await token.balanceOf(alice.address, badgeId)).to.equal(3n);
    });

    it("reverts when minting exceeds maxSupply", async () => {
      await token.defineTokenType("Limited", "LTD", 10, "", true, true);
      const ltdId = 1n;

      await token.mint(owner.address, ltdId, 10n);
      await expect(token.mint(alice.address, ltdId, 1n)).to.be.revertedWithCustomError(token, "ExceedsMaxSupply");
    });

    it("owner can mint NFT (maxSupply=1)", async () => {
      await token.defineTokenType("Unique", "UNIQ", 1, "", true, true);
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
      await token.defineTokenType("Type A", "A", 0, "", true, true);
      await token.defineTokenType("Type B", "B", 0, "", true, true);

      await token.mintBatch(alice.address, [0n, 1n], [500n, 200n]);

      expect(await token.balanceOf(alice.address, 0n)).to.equal(500n);
      expect(await token.balanceOf(alice.address, 1n)).to.equal(200n);
    });

    it("reverts if any tokenId in batch exceeds maxSupply", async () => {
      await token.defineTokenType("Capped", "CAP", 10, "", true, true);
      await token.defineTokenType("Open", "OPN", 0, "", true, true);

      await expect(token.mintBatch(alice.address, [0n, 1n], [11n, 100n])).to.be.revertedWithCustomError(
        token,
        "ExceedsMaxSupply",
      );
    });
  });

  describe("Burning", function () {
    it("holder can burn their own tokens when burnable", async () => {
      await token.defineTokenType("Food Voucher", "FOOD", 0, "", true, true);
      await token.mint(alice.address, 0n, 1000n);

      await token.connect(alice).burn(alice.address, 0n, 400n);
      expect(await token.balanceOf(alice.address, 0n)).to.equal(600n);
    });

    it("reverts when holder tries to burn non-burnable tokens", async () => {
      await token.defineTokenType("No Burn", "NOBRN", 0, "", true, false);
      await token.mint(alice.address, 0n, 1000n);

      await expect(token.connect(alice).burn(alice.address, 0n, 400n)).to.be.revertedWithCustomError(
        token,
        "BurnDisabled",
      );
    });

    it("owner can burn non-burnable tokens", async () => {
      await token.defineTokenType("No Burn", "NOBRN", 0, "", true, false);
      await token.mint(owner.address, 0n, 1000n);

      await token.burn(owner.address, 0n, 400n);
      expect(await token.balanceOf(owner.address, 0n)).to.equal(600n);
    });
  });

  describe("Transfers", function () {
    it("standard ERC-1155 transfer works when transferable", async () => {
      await token.defineTokenType("Food Voucher", "FOOD", 0, "", true, true);
      await token.mint(owner.address, 0n, 500n);
      await token.safeTransferFrom(owner.address, alice.address, 0n, 200n, "0x");
      expect(await token.balanceOf(alice.address, 0n)).to.equal(200n);
      expect(await token.balanceOf(owner.address, 0n)).to.equal(300n);
    });

    it("reverts when holder tries to transfer non-transferable tokens", async () => {
      await token.defineTokenType("Soulbound", "SOUL", 0, "", false, true);
      await token.mint(alice.address, 0n, 500n);

      await expect(
        token.connect(alice).safeTransferFrom(alice.address, owner.address, 0n, 200n, "0x"),
      ).to.be.revertedWithCustomError(token, "TransferDisabled");
    });

    it("owner can transfer non-transferable tokens", async () => {
      await token.defineTokenType("Soulbound", "SOUL", 0, "", false, true);
      await token.mint(owner.address, 0n, 500n);

      await token.safeTransferFrom(owner.address, alice.address, 0n, 200n, "0x");
      expect(await token.balanceOf(alice.address, 0n)).to.equal(200n);
    });
  });

  describe("Batch Transfers & Burns", function () {
    beforeEach(async () => {
      // tokenId 0 = transferable + burnable
      await token.defineTokenType("Open", "OPN", 0, "", true, true);
      // tokenId 1 = non-transferable + non-burnable
      await token.defineTokenType("Locked", "LCK", 0, "", false, false);

      await token.mint(alice.address, 0n, 500n);
      await token.mint(alice.address, 1n, 500n);
    });

    it("reverts batch transfer when any token is non-transferable", async () => {
      await expect(
        token.connect(alice).safeBatchTransferFrom(alice.address, owner.address, [0n, 1n], [100n, 100n], "0x"),
      ).to.be.revertedWithCustomError(token, "TransferDisabled");
    });

    it("reverts batch burn when any token is non-burnable", async () => {
      await expect(token.connect(alice).burnBatch(alice.address, [0n, 1n], [100n, 100n])).to.be.revertedWithCustomError(
        token,
        "BurnDisabled",
      );
    });

    it("batch transfer succeeds when all tokens are transferable", async () => {
      await token.defineTokenType("Also Open", "AO", 0, "", true, true);
      await token.mint(alice.address, 2n, 300n);

      await token.connect(alice).safeBatchTransferFrom(alice.address, owner.address, [0n, 2n], [100n, 50n], "0x");
      expect(await token.balanceOf(alice.address, 0n)).to.equal(400n);
      expect(await token.balanceOf(alice.address, 2n)).to.equal(250n);
    });

    it("batch burn succeeds when all tokens are burnable", async () => {
      await token.defineTokenType("Also Open", "AO", 0, "", true, true);
      await token.mint(alice.address, 2n, 300n);

      await token.connect(alice).burnBatch(alice.address, [0n, 2n], [100n, 50n]);
      expect(await token.balanceOf(alice.address, 0n)).to.equal(400n);
      expect(await token.balanceOf(alice.address, 2n)).to.equal(250n);
    });

    it("owner can batch transfer non-transferable tokens", async () => {
      await token.mint(owner.address, 0n, 200n);
      await token.mint(owner.address, 1n, 200n);

      await token.safeBatchTransferFrom(owner.address, alice.address, [0n, 1n], [50n, 50n], "0x");
      expect(await token.balanceOf(alice.address, 0n)).to.equal(550n);
      expect(await token.balanceOf(alice.address, 1n)).to.equal(550n);
    });

    it("owner can batch burn non-burnable tokens", async () => {
      await token.mint(owner.address, 0n, 200n);
      await token.mint(owner.address, 1n, 200n);

      await token.burnBatch(owner.address, [0n, 1n], [50n, 50n]);
      expect(await token.balanceOf(owner.address, 0n)).to.equal(150n);
      expect(await token.balanceOf(owner.address, 1n)).to.equal(150n);
    });
  });

  describe("Authorized Transferrers", function () {
    beforeEach(async () => {
      // tokenId 0 = non-transferable, non-burnable (soulbound)
      await token.defineTokenType("Soulbound", "SOUL", 0, "", false, false);
      await token.mint(bob.address, 0n, 500n);
    });

    it("owner can set an authorized transferrer", async () => {
      await expect(token.setAuthorizedTransferrer(alice.address, true))
        .to.emit(token, "AuthorizedTransferrerSet")
        .withArgs(alice.address, true);

      expect(await token.authorizedTransferrers(alice.address)).to.equal(true);
    });

    it("owner can revoke an authorized transferrer", async () => {
      await token.setAuthorizedTransferrer(alice.address, true);
      await token.setAuthorizedTransferrer(alice.address, false);

      expect(await token.authorizedTransferrers(alice.address)).to.equal(false);
    });

    it("non-owner cannot set authorized transferrer", async () => {
      await expect(token.connect(alice).setAuthorizedTransferrer(alice.address, true)).to.be.revertedWithCustomError(
        token,
        "OwnableUnauthorizedAccount",
      );
    });

    it("authorized transferrer can transfer non-transferable tokens", async () => {
      // bob approves alice as ERC-1155 operator so she can call safeTransferFrom
      await token.connect(bob).setApprovalForAll(alice.address, true);
      // owner authorizes alice to bypass soulbound restrictions
      await token.setAuthorizedTransferrer(alice.address, true);

      await token.connect(alice).safeTransferFrom(bob.address, owner.address, 0n, 100n, "0x");
      expect(await token.balanceOf(owner.address, 0n)).to.equal(100n);
      expect(await token.balanceOf(bob.address, 0n)).to.equal(400n);
    });

    it("authorized transferrer can burn non-burnable tokens", async () => {
      await token.connect(bob).setApprovalForAll(alice.address, true);
      await token.setAuthorizedTransferrer(alice.address, true);

      await token.connect(alice).burn(bob.address, 0n, 100n);
      expect(await token.balanceOf(bob.address, 0n)).to.equal(400n);
    });

    it("revoked transferrer cannot bypass soulbound restrictions", async () => {
      await token.connect(bob).setApprovalForAll(alice.address, true);
      await token.setAuthorizedTransferrer(alice.address, true);
      await token.setAuthorizedTransferrer(alice.address, false);

      await expect(
        token.connect(alice).safeTransferFrom(bob.address, owner.address, 0n, 100n, "0x"),
      ).to.be.revertedWithCustomError(token, "TransferDisabled");
    });
  });
});
