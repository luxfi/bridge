import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();


    /////LuxVault
    const assets = [
        "0xFa005D52398B4BdAAf73C4e2E3AF8095533D790E", //usdt
        "0x42449554b0c7D85EbD488e14D7D48c6A78D3F9Be", //usdc
        "0xc16ECFE3cB80e142d7110b97a442d4caAA203ABf", //dai
    ]

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
