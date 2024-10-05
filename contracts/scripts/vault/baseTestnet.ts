import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();


    /////LuxVault
    const assets = [
        "0x46390FA219b22f739C63F0bF1c165a1FBc30B57c", //usdt
        "0xE49355609F94A4B8a2EfC6FBd077542F8EC90080", //usdc
        "0x568BF299E115D78a1fBa57BafdAe0fD8A26BFb7e", //dai
    ]

    const _signer = await ethers.getContractFactory("LuxVault");
    const _vault = await _signer.deploy(assets);
    await _vault.waitForDeployment();
    console.log("LuxVault baseTestnet address:", await _vault.getAddress());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
