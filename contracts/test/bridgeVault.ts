import { ethers } from "hardhat";
import { expect } from "chai";
import { formatUnits } from "ethers";

let owner: any;
let user1: any;
let user2: any;
let user3: any;
let user4: any;
let fee: any;
let vault: any;
let vaultAddress: any;
let Bridge: any;
let BridgeAddress: any;
let USDT: any;
let USDTAddress: any;
describe("Create Initial Contracts of all types", function () {
  it("get accounts", async function () {
    [owner, user1, user2, user3, user4, fee] = await ethers.getSigners();
    console.log("\tAccount address\t", await owner.getAddress());
  });
  it("should deploy Bridge Contract", async function () {
    const instanceBridge = await ethers.getContractFactory("Bridge");
    Bridge = await instanceBridge.deploy();
    BridgeAddress = await Bridge.getAddress();
    console.log("\tBridge Contract deployed at:", BridgeAddress);
  });
  it("should deploy USDT Contract", async function () {
    const instanceUSDT = await ethers.getContractFactory("USDT");
    USDT = await instanceUSDT.deploy();
    USDTAddress = await USDT.getAddress();
    console.log("\tUSDT Contract deployed at:", USDTAddress);
  });
  it("should deploy vault contract", async function () {
    const instanceVault = await ethers.getContractFactory("LuxVault");
    vault = await instanceVault.deploy();
    vaultAddress = await vault.getAddress();
    console.log("\tVault Contract deployed at:", vaultAddress);
  });
});

describe("Send USDT to users", async function () {
  it("start distributing FeeToken", async function () {
    await USDT.transfer(user1.address, ethers.parseUnits("1000", 6));
    await USDT.transfer(user2.address, ethers.parseUnits("1000", 6));
  });
});

describe("TransferOwnership and SetVault and SetPayout", async function () {
  it("TransferOwnership of vault to bridge", async function () {
    await vault.transferOwnership(BridgeAddress);
  });
  it("SetVault on bridge", async function () {
    await Bridge.setVault(vaultAddress);
  });
  it("SetPayout address on bridge", async function () {
    await Bridge.setpayoutAddressess(fee, 2000);
  });
});

describe("Deposit USDT", async function () {
  it("Deposit USDT to vault with user1", async function () {
    await USDT.connect(user1).approve(
      BridgeAddress,
      ethers.parseUnits("123", 6)
    );
    await Bridge.connect(user1).vaultDeposit(
      ethers.parseUnits("123", 6),
      USDTAddress
    );
    expect(await Bridge.previewVaultWithdraw(USDTAddress)).to.equal(
      ethers.parseUnits("123", 6)
    );
    const result = await vault.getVaultInfo(USDTAddress);
    console.log("::Result after user1 deposit: ", result);
  });

  it("Deposit USDT to vault with user2", async function () {
    await USDT.connect(user2).approve(
      BridgeAddress,
      ethers.parseUnits("300", 6)
    );
    await Bridge.connect(user2).vaultDeposit(
      ethers.parseUnits("300", 6),
      USDTAddress
    );
    expect(await Bridge.previewVaultWithdraw(USDTAddress)).to.equal(
      ethers.parseUnits("423", 6)
    );
    const result = await vault.getVaultInfo(USDTAddress);
    console.log("::Result after user2 deposit: ", result);
  });
});

describe("withdraw USDT", async function () {
  it("User1 withdraw USDT from vault", async function () {
    console.log("::User4's USDT balance before withdrawn: ", formatUnits(await USDT.balanceOf(user3), 6))
    console.log("::Bridge Preview of USDT before withdrawn: ", formatUnits(await Bridge.previewVaultWithdraw(USDT), 6));
    const amt = 212;
    const hashedId =
      "0xa452ec13f7d6ab551b536e8e98847b48a8454b284ff8647aaed2c7faf772b1a";
    const toTargetAddrStr = user3.address;
    const signedTXInfo =
      "0x3de3c7825f807158491a0f9a460b124aa6a97695a29cd055ad2bebc74eeefc5a1786549b9b11b3f1b1eebe7c10b6f7b0adfe05bf37df5bf6c49dd347626c5d971b";
    const tokenAddrStr = USDTAddress;
    const chainId = 11155111;
    const fromTokenDecimal = 6;
    const vault = true;
    await Bridge.connect(user3).bridgeWithdrawStealth(
      hashedId,
      tokenAddrStr,
      ethers.parseUnits(String(amt), 6),
      fromTokenDecimal,
      toTargetAddrStr,
      signedTXInfo,
      String(vault)
    );
    console.log("::User4's USDT balance after withdraw 212usdt: ", formatUnits(await USDT.balanceOf(user3), 6))
    console.log("::Bridge Preview of USDT after withdraw 212usdt: ", formatUnits(await Bridge.previewVaultWithdraw(USDT), 6));
    console.log("::Fee's USDT balance after withdraw 212usdt: ", formatUnits(await USDT.balanceOf(fee), 6));
  });
});

describe("deposit ETH", async function () {
  it("Deposit ETH to vault with user1", async function () {
    await Bridge.connect(user1).vaultDeposit(
      ethers.parseEther("1.34"),
      "0x0000000000000000000000000000000000000000",
      { value: ethers.parseEther("1.34") }
    );
    expect(
      await ethers.provider.getBalance(await vault.ethVaultAddress())
    ).to.equal(ethers.parseEther("1.34"));
    expect(
      await Bridge.previewVaultWithdraw(
        "0x0000000000000000000000000000000000000000"
      )
    ).to.equal(ethers.parseEther("1.34"));

    const result = await vault.getVaultInfo("0x0000000000000000000000000000000000000000");
    console.log("::Result after user1 deposit ETH: ", result);
    expect(
      await Bridge.previewVaultWithdraw(ethers.ZeroAddress)
    ).to.not.equal(ethers.parseEther("1.1"));
  });
});

describe("Test view functions of Vault Contract", async function () {
  it("GetVaultInfo of vault", async function () {
    const result = await vault.getVaultInfo(ethers.ZeroAddress);
    console.log("::GetVaultInfo of vault: ", result);
  });
});

describe("withdraw ETH", async function () {
  it("User1 withdraw ETH from Vault", async function () {
    // User1's ETH balance before withdrawn
    console.log("::User4's ETH balance before withdrawn: ", ethers.formatEther(await ethers.provider.getBalance(user4)))
    console.log("::Bridge Preview of ETH before withdrawn: ", ethers.formatEther(await Bridge.previewVaultWithdraw(ethers.ZeroAddress)));
    const amt = 1;
    const hashedId =
      "0xa452ec13f7d6ab551b536e8e98847b48a8454b284ff8647aaed2c7faf772b1ac";
    const toTargetAddrStr = user4.address;
    const signedTXInfo =
      "0x3de3c7825f807158491a0f9a460b124aa6a97695a29cd055ad2bebc74eeefc5a1786549b9b11b3f1b1eebe7c10b6f7b0adfe05bf37df5bf6c49dd347626c5d971b";
    const tokenAddrStr = "0x0000000000000000000000000000000000000000";
    const chainId = 11155111;
    const fromTokenDecimal = 18;
    const vault = true;
    await Bridge.connect(user3).bridgeWithdrawStealth(
      hashedId,
      tokenAddrStr,
      ethers.parseUnits(String(amt), 18),
      fromTokenDecimal,
      toTargetAddrStr,
      signedTXInfo,
      String(vault)
    );
    console.log("::User4's ETH balance after withdraw 1eth: ", ethers.formatEther(await ethers.provider.getBalance(user4)))
    console.log("::Bridge Preview of ETH after withdraw 1eth: ", ethers.formatEther(await Bridge.previewVaultWithdraw(ethers.ZeroAddress)));
    console.log("::Fee Balance after withdraw 1eth: ", ethers.formatEther(await ethers.provider.getBalance(fee)))
  });
});

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
