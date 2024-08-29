/***
 *Submitted for verification at basescan.org on 2024-03-20
 */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
    ██╗     ██╗   ██╗██╗  ██╗    ██████╗ ██████╗ ██╗██████╗  ██████╗ ███████╗   
    ██║     ██║   ██║╚██╗██╔╝    ██╔══██╗██╔══██╗██║██╔══██╗██╔════╝ ██╔════╝
    ██║     ██║   ██║ ╚███╔╝     ██████╔╝██████╔╝██║██║  ██║██║  ███╗█████╗  
    ██║     ██║   ██║ ██╔██╗     ██╔══██╗██╔══██╗██║██║  ██║██║   ██║██╔══╝  
    ███████╗╚██████╔╝██╔╝ ██╗    ██████╔╝██║  ██║██║██████╔╝╚██████╔╝███████╗
    ╚══════╝ ╚═════╝ ╚═╝  ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝╚═════╝  ╚═════╝ ╚══════╝
 */

import "./ERC20B.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "hardhat/console.sol";

contract Bridge is Ownable, AccessControl {
    uint256 internal fee = 0; //zero default
    uint256 public feeRate = 10 * (uint256(10) ** 15); // Fee rate 1%
    address internal payoutAddr;

    /** Events */
    event BridgeBurned(address caller, uint256 amt);
    event BridgeMinted(address recipient, address token, uint256 amt);
    event AdminGranted(address to);
    event AdminRevoked(address to);
    event SigMappingAdded(bytes _key);
    event NewMPCOracleSet(address MPCOracle);

    constructor() Ownable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Sets admins
     */
    modifier onlyAdmin() {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Ownable");
        _;
    }

    /**
     * @dev Grants admins
     */
    function grantAdmin(address to) public onlyAdmin {
        grantRole(DEFAULT_ADMIN_ROLE, to);
        emit AdminGranted(to);
    }

    /**
     * @dev Revoke admins
     */
    function revokeAdmin(address to) public onlyAdmin {
        require(hasRole(DEFAULT_ADMIN_ROLE, to), "Ownable");
        revokeRole(DEFAULT_ADMIN_ROLE, to);
        emit AdminRevoked(to);
    }

    /**
     * @dev Set fee payout addresses and fee - set at contract launch - in wei
     */
    function setPayoutAddress(address addr, uint256 feeR) public onlyAdmin {
        payoutAddr = addr;
        feeRate = feeR;
    }

    /**
     * @dev Mappings
     */
    struct MPCOracleAddrInfo {
        bool exists;
    }

    /**
     * @dev Map MPCOracle address at blockHeight
     */
    mapping(address => MPCOracleAddrInfo) internal MPCOracleAddrMap;

    function addMPCMapping(address _key) internal {
        MPCOracleAddrMap[_key].exists = true;
    }

    /**
     * @dev Used to set a new MPC address at block height - only MPC signers can update
     */
    function setMPCOracle(address MPCO) public onlyAdmin {
        addMPCMapping(MPCO); // store in mapping.
        emit NewMPCOracleSet(MPCO);
    }

    /**
     * @dev Get MPC Data Transaction
     */
    function getMPCMapDataTx(address _key) public view returns (bool) {
        return MPCOracleAddrMap[_key].exists;
    }

    /**
     * @dev Struct for mapping transaction history
     */
    struct TransactionInfo {
        string txid;
        bool exists;
        //bool isStealth;
    }

    mapping(bytes => TransactionInfo) internal transactionMap;

    function addMappingStealth(bytes memory _key) internal {
        require(!transactionMap[_key].exists, "Already exist");
        transactionMap[_key].exists = true;
        emit SigMappingAdded(_key);
    }

    function keyExistsTx(bytes memory _key) public view returns (bool) {
        return transactionMap[_key].exists;
    }

    struct VarStruct {
        bytes32 tokenAddrHash;
        string amtStr;
        bytes32 toTargetAddrStrHash;
        bytes32 toChainIdHash;
        address toTargetAddr;
        ERC20B token;
    }

    /**
     * @dev Burns the msg.senders coins
     */
    function bridgeBurn(uint256 amount, address tokenAddr) public {
        VarStruct memory varStruct;
        varStruct.token = ERC20B(tokenAddr);
        require((varStruct.token.balanceOf(msg.sender) > 0), "ZeroBal");
        varStruct.token.bridgeBurn(msg.sender, amount);
        emit BridgeBurned(msg.sender, amount);
    }

    /**
     * @dev Concat data to sign
     */
    function append(
        string memory amt,
        string memory toTargetAddrStr,
        string memory txid,
        string memory tokenAddrStrHash,
        string memory chainIdStr,
        string memory vault
    ) internal pure returns (string memory) {
        return
            string(
                abi.encodePacked(
                    amt,
                    toTargetAddrStr,
                    txid,
                    tokenAddrStrHash,
                    chainIdStr,
                    vault
                )
            );
    }

    /**
     * @dev Sig is specific to recipient target address, hashed txid, amount, block height, target token and target chain
     * Sig can only be claimed once.
     */
    function bridgeMintStealth(
        uint256 amt,
        string memory hashedId,
        address toTargetAddrStr,
        bytes memory signedTXInfo,
        address tokenAddrStr,
        string memory chainId,
        string memory vault
    ) public returns (address) {
        VarStruct memory varStruct;

        // Hash calculations
        varStruct.tokenAddrHash = keccak256(abi.encodePacked(tokenAddrStr));
        varStruct.token = ERC20B(tokenAddrStr);
        varStruct.toTargetAddr = toTargetAddrStr;
        varStruct.toTargetAddrStrHash = keccak256(
            abi.encodePacked(toTargetAddrStr)
        );
        varStruct.amtStr = Strings.toString(amt);
        varStruct.toChainIdHash = keccak256(abi.encodePacked(chainId));
        // Concatenate message
        string memory msg1 = append(
            varStruct.amtStr,
            Strings.toHexString(uint256(varStruct.toTargetAddrStrHash), 32),
            hashedId,
            Strings.toHexString(uint256(varStruct.tokenAddrHash), 32),
            Strings.toHexString(uint256(varStruct.toChainIdHash), 32),
            vault
        );
        console.log(msg1);

        // Check if signedTXInfo already exists
        require(!transactionMap[signedTXInfo].exists, "DupeTX");

        address signer = recoverSigner(
            prefixed(keccak256(abi.encodePacked(msg1))),
            signedTXInfo
        );
        console.log("signer: ");
        console.log(signer);

        // Check if signer is MPCOracle and corresponds to the correct ERC20B
        require(MPCOracleAddrMap[signer].exists, "BadSig");

        // Calculate fee and adjust amount
        uint256 fee1 = (amt * feeRate) / 10 ** 18;
        uint256 adjustedAmt = amt - fee1; // Use a local variable

        // If correct signer, then payout
        varStruct.token.bridgeMint(payoutAddr, fee1);
        varStruct.token.bridgeMint(varStruct.toTargetAddr, adjustedAmt);

        // Add new transaction ID mapping
        addMappingStealth(signedTXInfo);

        emit BridgeMinted(varStruct.toTargetAddr, tokenAddrStr, adjustedAmt);

        return signer;
    }

    function splitSignature(
        bytes memory sig
    ) internal pure returns (uint8, bytes32, bytes32) {
        require(sig.length == 65, "invalid Length");
        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            // first 32 bytes, after the length prefix
            r := mload(add(sig, 32))
            // second 32 bytes
            s := mload(add(sig, 64))
            // final byte (first byte of the next 32 bytes)
            v := byte(0, mload(add(sig, 96)))
        }

        return (v, r, s);
    }

    function recoverSigner(
        bytes32 message,
        bytes memory sig
    ) internal pure returns (address) {
        uint8 v;
        bytes32 r;
        bytes32 s;
        (v, r, s) = splitSignature(sig);
        return ecrecover(message, v, r, s);
    }

    /**
     * @dev Builds a prefixed hash to mimic the behavior of eth_sign.
     */
    function prefixed(bytes32 hash) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked("\x19Ethereum Signed Message:\n32", hash)
            );
    }
}
