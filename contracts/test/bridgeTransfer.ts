import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";


let owner: any;
let user1: any;
let user2: any;
let vault: any;
let Bridge: any;
let BridgeAddress: any;
let USDT: any;
let USDTAddress: any;
describe("Create Initial Contracts of all types", function () {
  it("get accounts", async function () {
    [owner, user1, user2, vault] =
      await ethers.getSigners();
    console.log("\tAccount address\t", await owner.getAddress());
  });
  it("should deploy Bridge Contract", async function () {
    const instanceBridge = await ethers.getContractFactory("Bridge");
    Bridge = await instanceBridge.deploy();
    BridgeAddress = await Bridge.getAddress();
    console.log("\tBridge Contract deployed at:", BridgeAddress);
  });
  it("should deploy USDT Contract", async function () {
    const instanceUSDT = await ethers.getContractFactory("USDTToken");
    USDT = await instanceUSDT.deploy();
    USDTAddress = await USDT.getAddress();
    console.log("\tUSDT Contract deployed at:", USDTAddress);
  });
});
describe("Send USDT to users", async function(){
  it("start distributing FeeToken", async function(){
    await USDT.transfer(user1.address, ethers.parseUnits("1000", 6));
    await USDT.transfer(user2.address, ethers.parseUnits("1000", 6));
  })
})
describe("do test", async function(){
  it("start setting", async function(){
    await Bridge.setVault(vault);
    expect(await Bridge.vault()).to.equal(vault);
  })
  it("start Bridge Transfer with token", async function(){
    await USDT.approve(BridgeAddress, ethers.parseUnits("1000", 6));
    await Bridge.bridgeTransfer(ethers.parseUnits("1000", 6), USDTAddress);
  })
  it("start Bridge Transfer with ETH", async function(){
    await Bridge.bridgeTransfer(ethers.parseEther("2"), "0x0000000000000000000000000000000000000000", {value: ethers.parseEther("2")});
  })
  it("check balance", async function(){
    expect(await USDT.balanceOf(vault.address)).to.equal(ethers.parseUnits("1000", 6));
    expect(await ethers.provider.getBalance(vault)).to.equal(ethers.parseEther("10002"));
  })
})
