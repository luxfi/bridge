import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";


let owner: any;
let user1: any;
let user2: any;
let user3: any;
let vault: any;
let vaultAddress: any;
let Bridge: any;
let BridgeAddress: any;
let USDT: any;
let USDTAddress: any;
describe("Create Initial Contracts of all types", function () {
  it("get accounts", async function () {
    [owner, user1, user2, user3] =
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
  it("should deploy vault contract", async function(){
    const instanceVault = await ethers.getContractFactory("Vault");
    vault = await instanceVault.deploy([USDTAddress]);
    vaultAddress = await vault.getAddress();
    console.log("\tVault Contract deployed at:", vaultAddress);
  })
});

describe("Send USDT to users", async function(){
  it("start distributing FeeToken", async function(){
    await USDT.transfer(user1.address, ethers.parseUnits("1000", 6));
    await USDT.transfer(user2.address, ethers.parseUnits("1000", 6));
  })
})

describe("set vault and bridge", async function(){
  it("transferOwnership of vault contract to bridge", async function(){
    await vault.transferOwnership(BridgeAddress);
  })
  it("set vault on bridge", async function(){
    await Bridge.setVault(vaultAddress);
  })
})
describe("deposit USDT", async function(){
  it("deposit USDT to vault with user1", async function(){
    await USDT.connect(user1).approve(BridgeAddress, ethers.parseUnits("100", 6));
    await Bridge.connect(user1).vaultDeposit(ethers.parseUnits("100", 6), USDTAddress) ;
    expect(await Bridge.previewVaultWithdraw(ethers.parseUnits("100", 6), USDTAddress)).to.equal(true);
  })
  it("deposit USDT to vault with user2", async function(){
    await USDT.connect(user2).approve(BridgeAddress, ethers.parseUnits("300", 6));
    await Bridge.connect(user2).vaultDeposit(ethers.parseUnits("300", 6), USDTAddress) ;
    expect(await Bridge.previewVaultWithdraw(ethers.parseUnits("400", 6), USDTAddress)).to.equal(true);
  })
})

describe("withdraw USDT", async function(){
  it("user1 withdraw USDT from vault", async function(){
      const amt =  0.00002;
      const hashedId =  "0xa452ec13f7d6ab551b536e8e98847b48a8454b284ff8647aaed2c7faf772b1ac";
      const toTargetAddrStr =  "0xD4A215472332e8B6E26B0a5DC253DB78119904cA";
      const signedTXInfo =  "0x3de3c7825f807158491a0f9a460b124aa6a97695a29cd055ad2bebc74eeefc5a1786549b9b11b3f1b1eebe7c10b6f7b0adfe05bf37df5bf6c49dd347626c5d971b";
      const tokenAddrStr = USDTAddress;
      const chainId =  11155111;
      const fromTokenDecimal = 6;
      const vault = true;
    await Bridge.connect(user3).bridgeWithdrawStealth(ethers.parseUnits(String(amt), 6), hashedId, toTargetAddrStr, signedTXInfo, tokenAddrStr, String(chainId), fromTokenDecimal, String(vault)) ;
    expect(await USDT.balanceOf(user3)).to.equal(ethers.parseUnits(String(amt), 6));
  })
})

describe("deposit ETH", async function(){
  it("deposit ETH to vault with user1", async function(){
    await Bridge.connect(user1).vaultDeposit(ethers.parseEther("1"), "0x0000000000000000000000000000000000000000", {value: ethers.parseEther("1")});
    expect(await ethers.provider.getBalance(await vault.ethVaultAddress())).to.equal(ethers.parseEther("1"));
    expect(await Bridge.previewVaultWithdraw(ethers.parseEther("1"), "0x0000000000000000000000000000000000000000")).to.equal(true);
    expect(await Bridge.previewVaultWithdraw(ethers.parseEther("1.1"), "0x0000000000000000000000000000000000000000")).to.equal(false);
  })
})

// describe("withdraw ETH", async function(){
//   it("user1 withdraw USDT from vault", async function(){
//     const amt =  1;
//     const hashedId =  "0xa452ec13f7d6ab551b536e8e98847b48a8454b284ff8647aaed2c7faf772b1ac";
//     const toTargetAddrStr =  "0xD4A215472332e8B6E26B0a5DC253DB78119904cA";
//     const signedTXInfo =  "0x3de3c7825f807158491a0f9a460b124aa6a97695a29cd055ad2bebc74eeefc5a1786549b9b11b3f1b1eebe7c10b6f7b0adfe05bf37df5bf6c49dd347626c5d971b";
//     const tokenAddrStr = "0x0000000000000000000000000000000000000000";
//     const chainId =  11155111;
//     const fromTokenDecimal = 18;
//     const vault = true;
//   await Bridge.connect(user3).bridgeWithdrawStealth(ethers.parseEther(String(amt)), hashedId, toTargetAddrStr, signedTXInfo, tokenAddrStr, String(chainId), fromTokenDecimal, String(vault)) ;
//   // expect(await USDT.balanceOf(user3)).to.equal(ethers.parseUnits(String(amt), 6));
//   console.log("user3 balance: ", await ethers.provider.getBalance(user3));
// })
// })

// describe("do test", async function(){
//   it("start setting", async function(){
//     await Bridge.setVault(vault);
//     expect(await Bridge.vault()).to.equal(vault);
//   })
//   it("start Bridge Transfer with token", async function(){
//     await USDT.approve(BridgeAddress, ethers.parseUnits("1000", 6));
//     await Bridge.bridgeTransfer(ethers.parseUnits("1000", 6), USDTAddress);
//   })
//   it("start Bridge Transfer with ETH", async function(){
//     await Bridge.bridgeTransfer(ethers.parseEther("2"), "0x0000000000000000000000000000000000000000", {value: ethers.parseEther("2")});
//   })
//   it("check balance", async function(){
//     expect(await USDT.balanceOf(vault.address)).to.equal(ethers.parseUnits("1000", 6));
//     expect(await ethers.provider.getBalance(vault)).to.equal(ethers.parseEther("10002"));
//   })
// })
// describe("test bridgeMintStealth", async function(){
//   it("start", async function(){

//       const adapterParams = ethers.solidityPacked(['uint16', 'uint256'], [1, 200000]);
//       console.log("adapterParams: " + adapterParams);    
//       const amt =  0.00002;
//       const hashedId =  "0xa452ec13f7d6ab551b536e8e98847b48a8454b284ff8647aaed2c7faf772b1ac";
//       const toTargetAddrStr =  "0xD4A215472332e8B6E26B0a5DC253DB78119904cA";
//       const signedTXInfo =  "0x3de3c7825f807158491a0f9a460b124aa6a97695a29cd055ad2bebc74eeefc5a1786549b9b11b3f1b1eebe7c10b6f7b0adfe05bf37df5bf6c49dd347626c5d971b";
//       const tokenAddrStr = "0x42449554b0c7D85EbD488e14D7D48c6A78D3F9Be";
//       const chainId =  11155111;
//       const fromTokenDecimal = 18;
//       const vault = true;
//     await Bridge.bridgeMintStealth(ethers.parseEther(String(amt)), hashedId, toTargetAddrStr, signedTXInfo, tokenAddrStr, String(chainId), fromTokenDecimal, String(vault)) ;
//   })
// })

