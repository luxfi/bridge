import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();

    /////LETH
    const _signer = await ethers.getContractFactory("USDC");
    const token = await _signer.deploy();
    console.log("USDC address:", await token.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
