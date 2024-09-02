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
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Bridge is Ownable, AccessControl {
    uint256 internal fee = 0; //zero default
    uint256 public feeRate = 100; // Fee rate 1%
    address internal payoutAddr;
    address public vault = 0x9011E888251AB053B7bD1cdB598Db4f9DEd94714; // luxdefi.eth vault

    /** Events */
    event BridgeBurned(address caller, uint256 amt);
    event VaultDeposit(address depositor, uint256 amt);
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
     * @param to_ admin address
     */
    function grantAdmin(address to_) public onlyAdmin {
        grantRole(DEFAULT_ADMIN_ROLE, to_);
        emit AdminGranted(to_);
    }

    /**
     * @dev Revoke admins
     * @param to_ admin address
     */
    function revokeAdmin(address to_) public onlyAdmin {
        require(hasRole(DEFAULT_ADMIN_ROLE, to_), "Ownable");
        revokeRole(DEFAULT_ADMIN_ROLE, to_);
        emit AdminRevoked(to_);
    }

    /**
     * @dev Set fee payout addresses and fee - set at contract launch - in wei
     * @param payoutAddr_ payout address
     * @param feeRate_ fee rate for bridge fee
     */
    function setPayoutAddress(
        address payoutAddr_,
        uint256 feeRate_
    ) public onlyAdmin {
        payoutAddr = payoutAddr_;
        feeRate = feeRate_;
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
     * @param MPCO new mpc oracle signer address
     */
    function setMPCOracle(address MPCO) public onlyAdmin {
        addMPCMapping(MPCO); // store in mapping.
        emit NewMPCOracleSet(MPCO);
    }

    /**
     * @dev Get MPC Data Transaction
     * @param _key transaction hash
     * @return boolean true if mpc signer address exists
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

    /**
     * @dev add transaction id to mappding to prevent replay attack
     * @param _key transaction hash
     */
    function addMappingStealth(bytes memory _key) internal {
        require(!transactionMap[_key].exists, "Already exist");
        transactionMap[_key].exists = true;
        emit SigMappingAdded(_key);
    }

    /**
     * @dev check if transaction already exists
     * @param _key transaction hash
     * @return boolean
     */
    function keyExistsTx(bytes memory _key) public view returns (bool) {
        return transactionMap[_key].exists;
    }

    /**
     * @dev Teleport bridge data structure
     */
    struct TeleportStruct {
        bytes32 tokenAddrHash;
        string amtStr;
        bytes32 toTargetAddrStrHash;
        bytes32 toChainIdHash;
        address toTargetAddr;
        string decimalStr;
        ERC20B token;
    }

    /**
     * @dev set vault address for teleport bridge
     * @param to_ new vault address
     */
    function setVault(address to_) public onlyAdmin {
        require(to_ != address(0), "Invalid address");
        vault = to_;
    }

    /**
     * @dev Transfers the msg.senders coins to Lux vault
     * @param amount_ token amount to transfer
     * @param tokenAddr_ token address to transfer
     */
    function vaultDeposit(uint256 amount_, address tokenAddr_) public payable {
        if (tokenAddr_ == address(0)) {
            require(msg.value >= amount_, "Insufficient ETH amount");
            if (msg.value > amount_) {
                (bool successRefund, ) = payable(msg.sender).call{
                    value: msg.value - amount_
                }("");
                require(successRefund, "Refund failed.");
            }
            (bool successTransfer, ) = payable(vault).call{value: amount_}("");
            require(successTransfer, "Transfer failed.");
        } else {
            IERC20(tokenAddr_).transferFrom(msg.sender, vault, amount_);
        }
        emit VaultDeposit(msg.sender, amount_);
    }

    /**
     * @dev Burns the msg.senders coins
     * @param amount_ token amount to burn
     * @param tokenAddr_ token address to burn
     */
    function bridgeBurn(uint256 amount_, address tokenAddr_) public {
        TeleportStruct memory teleport;
        teleport.token = ERC20B(tokenAddr_);
        require((teleport.token.balanceOf(msg.sender) > 0), "Zero Balance");
        teleport.token.bridgeBurn(msg.sender, amount_);
        emit BridgeBurned(msg.sender, amount_);
    }

    /**
     * @dev Concat data to sign
     * @param amt_ token amount
     * @param toTargetAddrStr_ target address to mint
     * @param txid_ tx hash
     * @param tokenAddrStrHash_ hashed token address
     * @param chainIdStr_ chain id
     * @param decimalStr_ decimal of source token
     * @param vault_ usage of valult
     */
    function append(
        string memory amt_,
        string memory toTargetAddrStr_,
        string memory txid_,
        string memory tokenAddrStrHash_,
        string memory chainIdStr_,
        string memory decimalStr_,
        string memory vault_
    ) internal pure returns (string memory) {
        return
            string(
                abi.encodePacked(
                    amt_,
                    toTargetAddrStr_,
                    txid_,
                    tokenAddrStrHash_,
                    chainIdStr_,
                    decimalStr_,
                    vault_
                )
            );
    }

    /**
     * @dev Sig is specific to recipient target address, hashed txid, amount, block height, target token and target chain
     * @notice Sets the vault address. Sig can only be claimed once.
     * @param amt_ token amount that is transfered to lux vault in source chain
     * @param hashedId_ hashed tx id in source chain
     * @param toTargetAddrStr_ destinatoin address to mint in destination chain
     * @param signedTXInfo_ mpc signed msg from teleport oracle network
     * @param tokenAddrStr_ token address in destination chain
     * @param chainId_ chain id
     * @param fromTokenDecimal_ token decimal of source token
     * @param vault_ if usage of vault
     * @return signer return signer address of message
     */
    function bridgeMintStealth(
        uint256 amt_,
        string memory hashedId_,
        address toTargetAddrStr_,
        bytes memory signedTXInfo_,
        address tokenAddrStr_,
        string memory chainId_,
        uint256 fromTokenDecimal_,
        string memory vault_
    ) public returns (address) {
        TeleportStruct memory teleport;
        // Hash calculations
        teleport.tokenAddrHash = keccak256(abi.encodePacked(tokenAddrStr_));
        teleport.token = ERC20B(tokenAddrStr_);
        teleport.toTargetAddr = toTargetAddrStr_;
        teleport.toTargetAddrStrHash = keccak256(
            abi.encodePacked(toTargetAddrStr_)
        );
        teleport.amtStr = Strings.toString(amt_);
        teleport.decimalStr = Strings.toString(fromTokenDecimal_);
        teleport.toChainIdHash = keccak256(abi.encodePacked(chainId_));
        // Concatenate message
        string memory message = append(
            teleport.amtStr,
            Strings.toHexString(uint256(teleport.toTargetAddrStrHash), 32),
            hashedId_,
            Strings.toHexString(uint256(teleport.tokenAddrHash), 32),
            Strings.toHexString(uint256(teleport.toChainIdHash), 32),
            teleport.decimalStr,
            vault_
        );

        // Check if signedTXInfo already exists
        require(!transactionMap[signedTXInfo_].exists, "DupeTX");
        address signer = recoverSigner(
            prefixed(keccak256(abi.encodePacked(message))),
            signedTXInfo_
        );
        // Check if signer is MPCOracle and corresponds to the correct ERC20B
        require(MPCOracleAddrMap[signer].exists, "BadSig");

        // Calculate fee and adjust amount
        uint256 amount_ = (amt_ * 10 ** 18) / (10 ** fromTokenDecimal_);
        uint256 bridgeFee = (amount_ * feeRate) / 10 ** 4;
        uint256 adjustedAmt = amount_ - bridgeFee; // Use a local variable

        // If correct signer, then payout
        teleport.token.bridgeMint(payoutAddr, bridgeFee);
        teleport.token.bridgeMint(teleport.toTargetAddr, adjustedAmt);

        // Add new transaction ID mapping
        addMappingStealth(signedTXInfo_);

        emit BridgeMinted(teleport.toTargetAddr, tokenAddrStr_, adjustedAmt);

        return signer;
    }

    /**
     * @dev split ECDSA signature to r, s, v
     * @param sig ECDSA signature
     * @return splitted_ v,s,r
     */
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

    /**
     * @dev recover signer from message and ECDSA signature
     * @param message_ message to be signed
     * @param sig_ ECDSA signature
     * @return signer signer of ECDSA
     */
    function recoverSigner(
        bytes32 message_,
        bytes memory sig_
    ) internal pure returns (address) {
        uint8 v;
        bytes32 r;
        bytes32 s;
        (v, r, s) = splitSignature(sig_);
        return ecrecover(message_, v, r, s);
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

    receive() external payable {}
}
