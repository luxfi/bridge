import { ethers } from "hardhat";

async function main() {
    /////TRUMP
    const _signer = await ethers.getContractFactory("TRUMP");
    const token = await _signer.deploy();
    console.log("TRUMP address:", await token.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
