import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();

    /////LETH
    const DEW = await ethers.getContractFactory("LuxETH");
    const token = await DEW.deploy();
    console.log("LETH address:", await token.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
