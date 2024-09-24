import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();


    /////LuxVault
    const assets = [
        "0xa92E09451140d645A2fE262c9631Dd808439dDEd", //usdt
        "0xB587bAb3d507d720625D30544C2889D661446BF7", //usdc
        "0xa92E09451140d645A2fE262c9631Dd808439dDEd", //dai
    ]

    const _signer = await ethers.getContractFactory("LuxVault");
    // const token = await _signer.deploy(["0xa92E09451140d645A2fE262c9631Dd808439dDEd","0xB587bAb3d507d720625D30544C2889D661446BF7", "0xa92E09451140d645A2fE262c9631Dd808439dDEd"]);
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
