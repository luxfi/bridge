import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();


    /////LuxVault
    const assets = [
        "0x5519582dde6eb1f53F92298622c2ecb39A64369A", //usdt
        "0x6a49DbeD52B9Bd9a53E21C3bCb67dc2697cD6697", //usdc
        "0x2E8A24dE21105772FD161BF56471A0470A8AF45e", //dai
    ]

    const _signer = await ethers.getContractFactory("LuxVault");
    const _vault = await _signer.deploy(assets);
    await _vault.waitForDeployment();
    console.log("LuxVault bscTestnet address:", await _vault.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
