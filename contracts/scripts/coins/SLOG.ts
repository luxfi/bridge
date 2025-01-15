import { ethers } from "hardhat";

async function main() {
    /////SLOG
    const _signer = await ethers.getContractFactory("SLOG");
    const token = await _signer.deploy();
    console.log("SLOG address:", await token.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
