// LUX<->ZOO bridge corridor — security-invariant proof for Bridge.sol /
// LuxVault.sol / ERC20B.sol (contracts under test; NOT modified by this file).
//
// Wiring in beforeEach mirrors scripts/deploy-zoo.ts steps 1-2 exactly
// (deploy, setVault, grantBridge, setTokenAllowed(wrapped,true),
// setTokenAllowed(native,true), setOracle) EXCEPT the final
// vault.transferOwnership(bridge) (deploy-zoo.ts step 3), which H1 below
// performs itself so it can observe both the pre- and post-transfer state.
// Every other test runs inside the nested describe(), whose own beforeEach
// performs that transfer first, matching the fully-wired deploy-zoo.ts
// end-state.
import { ethers } from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("LUX<->ZOO bridge corridor", function () {
  const NAME = "LuxZooBridge";
  const VERSION = "1";
  const FEE_RATE = 100n; // 1%, matches Bridge's default and deploy-zoo.ts

  // Mirrors Bridge.sol's CLAIM_TYPEHASH field-for-field.
  const CLAIM_TYPES = {
    Claim: [
      { name: "burnTxHash", type: "bytes32" },
      { name: "logIndex", type: "uint256" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "toChainId", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "vault", type: "bool" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  let deployer: any, safe: any, oracle: any, feeRecipient: any, user: any, forger: any;
  let bridge: any, bridgeAddr: string;
  let vault: any;
  let wrapped: any, wrappedAddr: string;
  let chainId: bigint;
  let domain: { name: string; version: string; chainId: bigint; verifyingContract: string };
  let claimSeq = 0;

  // Builds a claim with sane defaults (mint-shaped: vault=false, token=wrapped)
  // that overrides can turn into any of the shapes the tests need.
  function draftClaim(overrides: Record<string, any> = {}) {
    claimSeq += 1;
    return {
      burnTxHash: ethers.hexlify(ethers.randomBytes(32)),
      logIndex: 0n,
      token: wrappedAddr,
      amount: ethers.parseEther("1"),
      toChainId: chainId,
      recipient: user.address,
      vault: false,
      nonce: BigInt(claimSeq),
      deadline: 0n,
      ...overrides,
    };
  }

  async function signedClaim(signer: any, overrides: Record<string, any> = {}) {
    const claim = draftClaim(overrides);
    if (claim.deadline === 0n) claim.deadline = BigInt((await time.latest()) + 3600);
    const signature = await signer.signTypedData(domain, CLAIM_TYPES, claim);
    return { claim, signature };
  }

  // Solidity: fee = amount * feeRate / 10000; amountAfterFee = amount - fee.
  function feeSplit(amount: bigint) {
    const fee = (amount * FEE_RATE) / 10000n;
    return { fee, afterFee: amount - fee };
  }

  beforeEach(async function () {
    [deployer, safe, oracle, feeRecipient, user, forger] = await ethers.getSigners();

    const net = await ethers.provider.getNetwork();
    chainId = net.chainId;

    const BridgeFactory = await ethers.getContractFactory("Bridge");
    bridge = await BridgeFactory.deploy(NAME, VERSION, deployer.address, feeRecipient.address, FEE_RATE);
    await bridge.waitForDeployment();
    bridgeAddr = await bridge.getAddress();

    const VaultFactory = await ethers.getContractFactory("LuxVault");
    vault = await VaultFactory.deploy();
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();

    const ERC20BFactory = await ethers.getContractFactory("ERC20B");
    wrapped = await ERC20BFactory.deploy("Lux (Wrapped)", "wLUX", deployer.address);
    await wrapped.waitForDeployment();
    wrappedAddr = await wrapped.getAddress();

    domain = { name: NAME, version: VERSION, chainId, verifyingContract: bridgeAddr };

    await (await bridge.setVault(vaultAddr)).wait();
    await (await wrapped.grantBridge(bridgeAddr)).wait();
    await (await bridge.setTokenAllowed(wrappedAddr, true)).wait();
    await (await bridge.setTokenAllowed(ethers.ZeroAddress, true)).wait();
    await (await bridge.setOracle(oracle.address, true)).wait();
  });

  it("H1 — vault ownership gate: native lock/unlock only works once the vault is owned by the bridge", async function () {
    const depositAmount = ethers.parseEther("5");

    // BEFORE deploy-zoo.ts step 3: LuxVault is still owned by its deployer,
    // so Bridge (msg.sender at the vault) fails LuxVault's onlyOwner check.
    await expect(bridge.vaultDeposit(depositAmount, ethers.ZeroAddress, { value: depositAmount }))
      .to.be.revertedWithCustomError(vault, "OwnableUnauthorizedAccount")
      .withArgs(bridgeAddr);

    // deploy-zoo.ts step 3.
    await (await vault.transferOwnership(bridgeAddr)).wait();

    // AFTER transfer: native deposit succeeds and is reflected in the vault.
    await bridge.vaultDeposit(depositAmount, ethers.ZeroAddress, { value: depositAmount });
    expect(await bridge.previewVaultWithdraw(ethers.ZeroAddress)).to.equal(depositAmount);

    // An oracle-signed vault=true / token=0x0 withdraw claim now pays the recipient.
    const withdrawAmount = ethers.parseEther("1");
    const { afterFee } = feeSplit(withdrawAmount);
    const { claim, signature } = await signedClaim(oracle, {
      vault: true,
      token: ethers.ZeroAddress,
      amount: withdrawAmount,
    });

    await expect(bridge.bridgeWithdraw(claim, signature)).to.changeEtherBalance(user, afterFee);
  });

  describe("with the vault owned by the bridge (deploy-zoo.ts step 3 applied)", function () {
    beforeEach(async function () {
      await (await vault.transferOwnership(bridgeAddr)).wait();
    });

    it("M2 — mint discriminant: a vault=false claim mints, then reverts WrongClaimKind on bridgeWithdraw", async function () {
      const amount = ethers.parseEther("2");
      const { afterFee } = feeSplit(amount);
      const { claim, signature } = await signedClaim(oracle, { vault: false, token: wrappedAddr, amount });

      await expect(bridge.bridgeMint(claim, signature)).to.changeTokenBalance(wrapped, user, afterFee);

      await expect(bridge.bridgeWithdraw(claim, signature)).to.be.revertedWithCustomError(bridge, "WrongClaimKind");
    });

    it("M2 — withdraw discriminant: a vault=true claim withdraws, then reverts WrongClaimKind on bridgeMint", async function () {
      const deposit = ethers.parseEther("5");
      await bridge.vaultDeposit(deposit, ethers.ZeroAddress, { value: deposit });

      const amount = ethers.parseEther("1");
      const { afterFee } = feeSplit(amount);
      const { claim, signature } = await signedClaim(oracle, { vault: true, token: ethers.ZeroAddress, amount });

      await expect(bridge.bridgeWithdraw(claim, signature)).to.changeEtherBalance(user, afterFee);

      await expect(bridge.bridgeMint(claim, signature)).to.be.revertedWithCustomError(bridge, "WrongClaimKind");
    });

    it("replay: submitting the same valid mint claim twice reverts ClaimAlreadyProcessed", async function () {
      const amount = ethers.parseEther("1");
      const { claim, signature } = await signedClaim(oracle, { vault: false, token: wrappedAddr, amount });

      await bridge.bridgeMint(claim, signature);

      await expect(bridge.bridgeMint(claim, signature)).to.be.revertedWithCustomError(bridge, "ClaimAlreadyProcessed");
    });

    it("cross-chain replay: a claim with toChainId = block.chainid + 1 reverts ChainMismatch", async function () {
      const amount = ethers.parseEther("1");
      const wrongChainId = chainId + 1n;
      const { claim, signature } = await signedClaim(oracle, { vault: false, token: wrappedAddr, amount, toChainId: wrongChainId });

      await expect(bridge.bridgeMint(claim, signature))
        .to.be.revertedWithCustomError(bridge, "ChainMismatch")
        .withArgs(wrongChainId, chainId);
    });

    it("forged signer: a claim signed by a non-oracle key reverts InvalidOracle", async function () {
      const amount = ethers.parseEther("1");
      const { claim, signature } = await signedClaim(forger, { vault: false, token: wrappedAddr, amount });

      await expect(bridge.bridgeMint(claim, signature))
        .to.be.revertedWithCustomError(bridge, "InvalidOracle")
        .withArgs(forger.address);
    });

    it("allowedTokens on withdraw: a vault=true claim for a non-whitelisted token reverts TokenNotAllowed", async function () {
      const OtherToken = await ethers.getContractFactory("ERC20B");
      const other = await OtherToken.deploy("Other", "OTH", deployer.address);
      await other.waitForDeployment();
      const otherAddr = await other.getAddress();
      // Deliberately never bridge.setTokenAllowed(otherAddr, true).

      const amount = ethers.parseEther("1");
      const { claim, signature } = await signedClaim(oracle, { vault: true, token: otherAddr, amount });

      await expect(bridge.bridgeWithdraw(claim, signature))
        .to.be.revertedWithCustomError(bridge, "TokenNotAllowed")
        .withArgs(otherAddr);
    });

    it("custody handoff: deployer is fully de-privileged after handoff to the Safe (deploy-zoo.ts steps 4-6)", async function () {
      const DEFAULT_ADMIN_ROLE = await bridge.DEFAULT_ADMIN_ROLE();
      const ADMIN_ROLE = await bridge.ADMIN_ROLE();
      const PAUSER_ROLE = await bridge.PAUSER_ROLE();

      // step 4: grant the Safe every admin role.
      await (await bridge.grantRole(DEFAULT_ADMIN_ROLE, safe.address)).wait();
      await (await bridge.grantRole(ADMIN_ROLE, safe.address)).wait();
      await (await bridge.grantRole(PAUSER_ROLE, safe.address)).wait();

      // step 5: renounce every deployer role, DEFAULT_ADMIN_ROLE last.
      await (await bridge.renounceRole(ADMIN_ROLE, deployer.address)).wait();
      await (await bridge.renounceRole(PAUSER_ROLE, deployer.address)).wait();
      await (await bridge.renounceRole(DEFAULT_ADMIN_ROLE, deployer.address)).wait();

      // step 6 assertions: deployer is powerless, Safe operates the bridge.
      await expect(bridge.connect(deployer).setOracle(forger.address, true))
        .to.be.revertedWithCustomError(bridge, "AccessControlUnauthorizedAccount")
        .withArgs(deployer.address, ADMIN_ROLE);

      await bridge.connect(safe).setOracle(forger.address, true);
      expect(await bridge.hasRole(await bridge.ORACLE_ROLE(), forger.address)).to.equal(true);

      await expect(bridge.connect(deployer).emergencyWithdraw(0, ethers.ZeroAddress, deployer.address))
        .to.be.revertedWithCustomError(bridge, "AccessControlUnauthorizedAccount")
        .withArgs(deployer.address, ADMIN_ROLE);

      expect(await bridge.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.equal(false);
      expect(await bridge.hasRole(DEFAULT_ADMIN_ROLE, safe.address)).to.equal(true);
    });
  });
});
