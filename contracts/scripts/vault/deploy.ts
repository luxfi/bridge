import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();

    const _signer = await ethers.getContractFactory("LuxVault");
    const _vault = await _signer.deploy();
    await _vault.waitForDeployment();
    console.log("LuxVault address:", await _vault.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
