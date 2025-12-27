// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
    ██╗     ██╗   ██╗██╗  ██╗    ██████╗ ██████╗ ██╗██████╗  ██████╗ ███████╗   
    ██║     ██║   ██║╚██╗██╔╝    ██╔══██╗██╔══██╗██║██╔══██╗██╔════╝ ██╔════╝
    ██║     ██║   ██║ ╚███╔╝     ██████╔╝██████╔╝██║██║  ██║██║  ███╗█████╗  
    ██║     ██║   ██║ ██╔██╗     ██╔══██╗██╔══██╗██║██║  ██║██║   ██║██╔══╝  
    ███████╗╚██████╔╝██╔╝ ██╗    ██████╔╝██║  ██║██║██████╔╝╚██████╔╝███████╗
    ╚══════╝ ╚═════╝ ╚═╝  ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝╚═════╝  ╚═════╝ ╚══════╝

    Lux Teleport Bridge v1.1.0 - Security Enhanced
    
    Security Features:
    - EIP-712 typed data signatures
    - ClaimId-based replay protection (immune to ECDSA malleability)
    - Token whitelisting
    - Role separation (ADMIN, ORACLE, PAUSER)
    - Pausable emergency stop
    - ReentrancyGuard protection
 */

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./ERC20B.sol";
import "./LuxVault.sol";

contract Bridge is AccessControl, Pausable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ============ Roles ============
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ============ EIP-712 Types ============
    bytes32 public constant CLAIM_TYPEHASH = keccak256(
        "Claim(bytes32 burnTxHash,uint256 logIndex,address token,uint256 amount,uint256 toChainId,address recipient,bool vault,uint256 nonce,uint256 deadline)"
    );

    // ============ State ============
    uint256 public feeRate = 100; // Fee rate 1% (decimals 4, max 1000 = 10%)
    uint256 public constant MAX_FEE_RATE = 1000; // 10% max
    address public feeRecipient;
    LuxVault public vault;
    uint256 public nonce;

    // Token whitelist
    mapping(address => bool) public allowedTokens;
    
    // ClaimId-based replay protection (immune to signature malleability)
    mapping(bytes32 => bool) public claimedIds;

    // ============ Events ============
    event BridgeBurned(
        bytes32 indexed burnId,
        address indexed token,
        address indexed sender,
        uint256 amount,
        uint256 toChainId,
        address recipient,
        bool vault,
        uint256 nonce
    );
    event BridgeMinted(
        bytes32 indexed claimId,
        address indexed recipient,
        address indexed token,
        uint256 amount
    );
    event BridgeWithdrawn(
        bytes32 indexed claimId,
        address indexed recipient,
        address indexed token,
        uint256 amount
    );
    event VaultDeposit(address indexed depositor, uint256 amount, address indexed token);
    event VaultWithdraw(address indexed receiver, uint256 amount, address indexed token);
    event TokenAllowed(address indexed token, bool allowed);
    event OracleUpdated(address indexed oracle, bool active);
    event FeeUpdated(address indexed recipient, uint256 rate);
    event VaultUpdated(address indexed vault);

    // ============ Errors ============
    error TokenNotAllowed(address token);
    error ZeroAmount();
    error ZeroAddress();
    error ClaimAlreadyProcessed(bytes32 claimId);
    error ClaimExpired(uint256 deadline);
    error InvalidOracle(address signer);
    error InvalidSignature();
    error FeeRateTooHigh(uint256 rate);
    error WithdrawalDisabled();
    error InsufficientBalance(uint256 required, uint256 available);

    // ============ Constructor ============
    constructor(
        string memory name,
        string memory version,
        address admin,
        address _feeRecipient,
        uint256 _feeRate
    ) EIP712(name, version) {
        if (admin == address(0)) revert ZeroAddress();
        if (_feeRecipient == address(0)) revert ZeroAddress();
        if (_feeRate > MAX_FEE_RATE) revert FeeRateTooHigh(_feeRate);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        
        feeRecipient = _feeRecipient;
        feeRate = _feeRate;
    }

    // ============ Admin Functions ============

    /// @notice Set the vault contract
    function setVault(address payable _vault) external onlyRole(ADMIN_ROLE) {
        if (_vault == address(0)) revert ZeroAddress();
        vault = LuxVault(_vault);
        emit VaultUpdated(_vault);
    }

    /// @notice Add a new vault for an asset
    function addNewVault(address asset) external onlyRole(ADMIN_ROLE) {
        vault.addNewVault(asset);
    }

    /// @notice Add or remove token from whitelist
    function setTokenAllowed(address token, bool allowed) external onlyRole(ADMIN_ROLE) {
        allowedTokens[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    /// @notice Activate or deactivate an oracle
    function setOracle(address oracle, bool active) external onlyRole(ADMIN_ROLE) {
        if (oracle == address(0)) revert ZeroAddress();
        if (active) {
            _grantRole(ORACLE_ROLE, oracle);
        } else {
            _revokeRole(ORACLE_ROLE, oracle);
        }
        emit OracleUpdated(oracle, active);
    }

    /// @notice Update fee configuration
    function setFeeConfig(address _feeRecipient, uint256 _feeRate) external onlyRole(ADMIN_ROLE) {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        if (_feeRate > MAX_FEE_RATE) revert FeeRateTooHigh(_feeRate);
        feeRecipient = _feeRecipient;
        feeRate = _feeRate;
        emit FeeUpdated(_feeRecipient, _feeRate);
    }

    /// @notice Pause the bridge
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpause the bridge
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ============ Bridge Functions ============

    /// @notice Burn tokens with committed destination data
    /// @dev All destination data is committed in the event for oracle nodes to read
    function bridgeBurn(
        address token,
        uint256 amount,
        uint256 toChainId,
        address recipient,
        bool useVault
    ) external whenNotPaused nonReentrant returns (bytes32 burnId) {
        if (!allowedTokens[token]) revert TokenNotAllowed(token);
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();

        uint256 currentNonce = nonce++;
        
        burnId = keccak256(abi.encode(
            block.chainid,
            token,
            msg.sender,
            amount,
            toChainId,
            recipient,
            useVault,
            currentNonce
        ));

        // Burn the tokens
        ERC20B(token).bridgeBurn(msg.sender, amount);

        emit BridgeBurned(
            burnId,
            token,
            msg.sender,
            amount,
            toChainId,
            recipient,
            useVault,
            currentNonce
        );
    }

    /// @notice Deposit tokens to vault
    function vaultDeposit(uint256 amount, address token) external payable whenNotPaused nonReentrant {
        if (token != address(0)) {
            IERC20(token).safeTransferFrom(msg.sender, address(vault), amount);
        }
        vault.deposit{value: msg.value}(token, amount);
        emit VaultDeposit(msg.sender, amount, token);
    }

    // ============ Claim Data Structure ============

    struct ClaimData {
        bytes32 burnTxHash;
        uint256 logIndex;
        address token;
        uint256 amount;
        uint256 toChainId;
        address recipient;
        bool vault;
        uint256 nonce;
        uint256 deadline;
    }

    /// @notice Mint tokens with EIP-712 signature from oracle
    function bridgeMint(
        ClaimData calldata claim,
        bytes calldata signature
    ) external whenNotPaused nonReentrant returns (bytes32 claimId) {
        if (!allowedTokens[claim.token]) revert TokenNotAllowed(claim.token);
        if (claim.amount == 0) revert ZeroAmount();
        if (claim.recipient == address(0)) revert ZeroAddress();
        if (block.timestamp > claim.deadline) revert ClaimExpired(claim.deadline);
        if (claim.toChainId != block.chainid) revert InvalidSignature();

        // Compute claimId from all claim fields (immune to signature malleability)
        claimId = keccak256(abi.encode(
            claim.burnTxHash,
            claim.logIndex,
            claim.token,
            claim.amount,
            claim.toChainId,
            claim.recipient,
            claim.vault,
            claim.nonce,
            claim.deadline
        ));

        if (claimedIds[claimId]) revert ClaimAlreadyProcessed(claimId);

        // Verify EIP-712 signature
        bytes32 structHash = keccak256(abi.encode(
            CLAIM_TYPEHASH,
            claim.burnTxHash,
            claim.logIndex,
            claim.token,
            claim.amount,
            claim.toChainId,
            claim.recipient,
            claim.vault,
            claim.nonce,
            claim.deadline
        ));
        
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        
        if (!hasRole(ORACLE_ROLE, signer)) revert InvalidOracle(signer);

        // Mark as claimed
        claimedIds[claimId] = true;

        // Calculate fee
        uint256 fee = (claim.amount * feeRate) / 10000;
        uint256 amountAfterFee = claim.amount - fee;

        // Mint tokens
        ERC20B(claim.token).bridgeMint(claim.recipient, amountAfterFee);
        if (fee > 0) {
            ERC20B(claim.token).bridgeMint(feeRecipient, fee);
        }

        emit BridgeMinted(claimId, claim.recipient, claim.token, amountAfterFee);
    }

    /// @notice Withdraw from vault with EIP-712 signature from oracle
    function bridgeWithdraw(
        ClaimData calldata claim,
        bytes calldata signature
    ) external whenNotPaused nonReentrant returns (bytes32 claimId) {
        if (claim.amount == 0) revert ZeroAmount();
        if (claim.recipient == address(0)) revert ZeroAddress();
        if (block.timestamp > claim.deadline) revert ClaimExpired(claim.deadline);
        if (claim.toChainId != block.chainid) revert InvalidSignature();

        // Compute claimId
        claimId = keccak256(abi.encode(
            claim.burnTxHash,
            claim.logIndex,
            claim.token,
            claim.amount,
            claim.toChainId,
            claim.recipient,
            claim.vault,
            claim.nonce,
            claim.deadline
        ));

        if (claimedIds[claimId]) revert ClaimAlreadyProcessed(claimId);

        // Verify EIP-712 signature
        bytes32 structHash = keccak256(abi.encode(
            CLAIM_TYPEHASH,
            claim.burnTxHash,
            claim.logIndex,
            claim.token,
            claim.amount,
            claim.toChainId,
            claim.recipient,
            claim.vault,
            claim.nonce,
            claim.deadline
        ));
        
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        
        if (!hasRole(ORACLE_ROLE, signer)) revert InvalidOracle(signer);

        // Mark as claimed
        claimedIds[claimId] = true;

        // Calculate fee
        uint256 fee = (claim.amount * feeRate) / 10000;
        uint256 amountAfterFee = claim.amount - fee;

        // Withdraw from vault
        _vaultWithdraw(fee, claim.token, feeRecipient);
        _vaultWithdraw(amountAfterFee, claim.token, claim.recipient);

        emit BridgeWithdrawn(claimId, claim.recipient, claim.token, amountAfterFee);
    }

    /// @notice Internal vault withdrawal
    function _vaultWithdraw(uint256 amount, address token, address receiver) private {
        if (amount == 0) return;
        
        address shareAddress;
        if (token == address(0)) {
            shareAddress = vault.ethVaultAddress();
        } else {
            shareAddress = vault.erc20Vault(token);
        }
        IERC20(shareAddress).approve(address(vault), type(uint256).max);
        vault.withdraw(token, receiver, amount);
        emit VaultWithdraw(receiver, amount, token);
    }

    /// @notice Preview available vault withdrawal
    function previewVaultWithdraw(address token) external view returns (uint256) {
        return vault.previewWithdraw(token);
    }

    /// @notice Emergency withdrawal by admin
    function emergencyWithdraw(
        uint256 amount,
        address token,
        address receiver
    ) external onlyRole(ADMIN_ROLE) {
        _vaultWithdraw(amount, token, receiver);
    }

    /// @notice Check if a claim has been processed
    function isClaimed(bytes32 claimId) external view returns (bool) {
        return claimedIds[claimId];
    }

    /// @notice Get the domain separator for EIP-712
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    receive() external payable {}
}
