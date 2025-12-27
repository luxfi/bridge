// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
    ██╗     ██╗   ██╗██╗  ██╗    ████████╗ ██████╗ ██╗  ██╗███████╗███╗   ██╗
    ██║     ██║   ██║╚██╗██╔╝    ╚══██╔══╝██╔═══██╗██║ ██╔╝██╔════╝████╗  ██║
    ██║     ██║   ██║ ╚███╔╝        ██║   ██║   ██║█████╔╝ █████╗  ██╔██╗ ██║
    ██║     ██║   ██║ ██╔██╗        ██║   ██║   ██║██╔═██╗ ██╔══╝  ██║╚██╗██║
    ███████╗╚██████╔╝██╔╝ ██╗       ██║   ╚██████╔╝██║  ██╗███████╗██║ ╚████║
    ╚══════╝ ╚═════╝ ╚═╝  ╚═╝       ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝
    
    Lux Bridgeable Token v1.1.0 - Security Enhanced
    
    Security Features:
    - Separate BRIDGE_ROLE for mint/burn operations
    - ADMIN_ROLE for role management
    - Pausable for emergency stop
 */

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract ERC20B is ERC20, AccessControl, Pausable {
    // ============ Roles ============
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ============ Events ============
    event BridgeMint(address indexed account, uint256 amount);
    event BridgeBurn(address indexed account, uint256 amount);
    event BridgeGranted(address indexed bridge);
    event BridgeRevoked(address indexed bridge);

    // ============ Errors ============
    error ZeroAddress();
    error ZeroAmount();

    // ============ Constructor ============
    constructor(
        string memory name,
        string memory symbol,
        address admin
    ) ERC20(name, symbol) {
        if (admin == address(0)) revert ZeroAddress();
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ============ Admin Functions ============

    /// @notice Grant bridge role to an address (typically the Bridge contract)
    function grantBridge(address bridge) external onlyRole(ADMIN_ROLE) {
        if (bridge == address(0)) revert ZeroAddress();
        _grantRole(BRIDGE_ROLE, bridge);
        emit BridgeGranted(bridge);
    }

    /// @notice Revoke bridge role from an address
    function revokeBridge(address bridge) external onlyRole(ADMIN_ROLE) {
        _revokeRole(BRIDGE_ROLE, bridge);
        emit BridgeRevoked(bridge);
    }

    /// @notice Pause all token transfers
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpause token transfers
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ============ Bridge Functions ============

    /// @notice Mint tokens - only callable by addresses with BRIDGE_ROLE
    function bridgeMint(
        address account,
        uint256 amount
    ) external onlyRole(BRIDGE_ROLE) whenNotPaused returns (bool) {
        if (account == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        
        _mint(account, amount);
        emit BridgeMint(account, amount);
        return true;
    }

    /// @notice Burn tokens - only callable by addresses with BRIDGE_ROLE
    function bridgeBurn(
        address account,
        uint256 amount
    ) external onlyRole(BRIDGE_ROLE) whenNotPaused returns (bool) {
        if (account == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        
        _burn(account, amount);
        emit BridgeBurn(account, amount);
        return true;
    }

    // ============ Hooks ============

    /// @notice Hook that is called before any transfer of tokens
    function _update(
        address from,
        address to,
        uint256 value
    ) internal virtual override whenNotPaused {
        super._update(from, to, value);
    }
}
