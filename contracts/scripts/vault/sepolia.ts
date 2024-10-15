import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  /////LuxVault
  const assets = [
    "0x1a21E9c483200714489B575851e75d4C9525588E",
    "0xE9FF4E487ffcA25a765D5445CC8665128Ac35820", //usdt
    "0x299e04DE65090D3C48019893e369A7983124c514", //usdc
    "0x3FADaC51B852273e11Da42Db30714FddA785b8C5", //dai
  ];

  const _signer = await ethers.getContractFactory("LuxVault");
  const token = await _signer.deploy(assets);
  await token.waitForDeployment();
  console.log("LuxVault sepolia address:", await token.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
