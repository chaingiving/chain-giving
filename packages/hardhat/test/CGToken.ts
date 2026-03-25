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
    token = await factory.deploy("Food Voucher", "FOOD", owner.address);
  });

  describe("Deployment", function () {
    it("sets name and symbol", async () => {
      expect(await token.name()).to.equal("Food Voucher");
      expect(await token.symbol()).to.equal("FOOD");
    });

    it("sets the owner", async () => {
      expect(await token.owner()).to.equal(owner.address);
    });

    it("starts with zero supply", async () => {
      expect(await token.totalSupply()).to.equal(0);
    });
  });

  describe("Minting", function () {
    it("owner can mint tokens", async () => {
      await token.mint(alice.address, 1000n);
      expect(await token.balanceOf(alice.address)).to.equal(1000n);
      expect(await token.totalSupply()).to.equal(1000n);
    });

    it("non-owner cannot mint", async () => {
      await expect(token.connect(alice).mint(alice.address, 1000n)).to.be.revertedWithCustomError(
        token,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("Burning", function () {
    it("holder can burn own tokens", async () => {
      await token.mint(alice.address, 1000n);
      await token.connect(alice).burn(400n);
      expect(await token.balanceOf(alice.address)).to.equal(600n);
    });

    it("cannot burn more than balance", async () => {
      await token.mint(alice.address, 100n);
      await expect(token.connect(alice).burn(200n)).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });
  });

  describe("Transfers", function () {
    it("standard ERC20 transfer works", async () => {
      await token.mint(owner.address, 500n);
      await token.transfer(alice.address, 200n);
      expect(await token.balanceOf(alice.address)).to.equal(200n);
      expect(await token.balanceOf(owner.address)).to.equal(300n);
    });
  });
});
