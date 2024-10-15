/***
 *Submitted for verification at basescan.org on 2024-03-20
 */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
    ██╗     ██╗   ██╗██╗  ██╗    ██╗   ██╗ █████╗ ██╗   ██╗██╗     ████████╗
    ██║     ██║   ██║╚██╗██╔╝    ██║   ██║██╔══██╗██║   ██║██║     ╚══██╔══╝
    ██║     ██║   ██║ ╚███╔╝     ██║   ██║███████║██║   ██║██║        ██║
    ██║     ██║   ██║ ██╔██╗     ╚██╗ ██╔╝██╔══██║██║   ██║██║        ██║
    ███████╗╚██████╔╝██╔╝ ██╗     ╚████╔╝ ██║  ██║╚██████╔╝███████╗   ██║
    ╚══════╝ ╚═════╝ ╚═╝  ╚═╝      ╚═══╝  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝
 */

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {LERC4626} from "./LERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ETHVault} from "./ETHVault.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract LuxVault is Ownable {
    mapping(address => address) public erc20Vault;
    address payable public ethVaultAddress;
    uint256 public totalVaultLength;
    address[] public assets;

    event ERC20VaultCreated(
        address indexed asset,
        address indexed vaultAddress
    );

    constructor(address[] memory _assets) Ownable(msg.sender) {
        // add native asset vault
        ETHVault _newETHVault = new ETHVault("Native Vault", "ethVault");
        ethVaultAddress = payable(address(_newETHVault));
        totalVaultLength++;
        assets.push(address(0));
        // add initial erc20 vaults
        for (uint i = 0; i < _assets.length; ++i) {
            _addNewERC20Vault(_assets[i]);
        }
    }

    function concat(
        string memory a,
        string memory b
    ) internal pure returns (string memory) {
        return string(abi.encodePacked(a, b));
    }

    /**
     * @dev add new ERC20 vault
     * @param asset_ ERC20 token address
     */
    function addNewERC20Vault(address asset_) external onlyOwner {
        _addNewERC20Vault(asset_);
    }

    /**
     * @dev add new ERC20 vault
     * @param asset_ ERC20 token address
     */
    function _addNewERC20Vault(address asset_) private {
        require(asset_ != address(0), "Invalid asset address.");
        require(erc20Vault[asset_] == address(0), "Vault already exists.");
        LERC4626 newERC20Vault = new LERC4626(
            IERC20(asset_),
            concat(ERC20(asset_).name(), " Vault"),
            concat("v", ERC20(asset_).symbol())
        );
        address newVaultAddress = address(newERC20Vault);
        erc20Vault[asset_] = newVaultAddress;
        IERC20(asset_).approve(newVaultAddress, type(uint256).max);
        totalVaultLength++;
        assets.push(asset_);
        emit ERC20VaultCreated(asset_, newVaultAddress);
    }

    /**
     * @dev deposit asset
     * @param asset_ ERC20 token address
     * @param amount_ token amount
     */
    function deposit(
        address asset_,
        uint256 amount_
    ) external payable onlyOwner {
        if (asset_ == address(0)) {
            require(msg.value >= amount_, "Insufficient ETH amount");
            ETHVault(ethVaultAddress).deposit{value: amount_}(amount_, owner());
        } else {
            ERC4626(erc20Vault[asset_]).deposit(amount_, owner());
        }
    }

    /**
     * @dev withdraw asset
     * @param asset_ ERC20 token address
     * @param receiver_ receiver's address
     * @param amount_ token amount
     */
    function withdraw(
        address asset_,
        address receiver_,
        uint256 amount_
    ) external onlyOwner {
        if (asset_ == address(0)) {
            ETHVault(ethVaultAddress).withdraw(amount_, receiver_, owner());
        } else {
            ERC4626(erc20Vault[asset_]).withdraw(amount_, receiver_, owner());
        }
    }

    /**
     * @dev preview withdraw
     * @param asset_ ERC20 token address
     * @return value token amount available for withdrawal
     */
    function previewWithdraw(
        address asset_
    ) public view returns (uint256) {
        if (asset_ == address(0)) {
            return ETHVault(ethVaultAddress).balanceOf(owner());
        } else {
            return ERC4626(erc20Vault[asset_]).maxWithdraw(owner());
        }
    }

    /**
     * @dev get vault info according to asset address
     * @param asset_ ERC20 token address
     * @return info vault info
     */
    function getVaultInfo(
        address asset_
    )
        external
        view
        returns (
            string memory,
            string memory,
            string memory,
            string memory,
            address,
            uint256
        )
    {
        if (asset_ == address(0)) {
            return (
                "Native Token",
                "ETH",
                ETHVault(ethVaultAddress).name(),
                ETHVault(ethVaultAddress).symbol(),
                ethVaultAddress,
                ETHVault(ethVaultAddress).totalSupply()
            );
        } else {
            return (
                ERC20(asset_).name(),
                ERC20(asset_).symbol(),
                LERC4626(erc20Vault[asset_]).name(),
                LERC4626(erc20Vault[asset_]).symbol(), // Add parentheses here
                erc20Vault[asset_],
                LERC4626(erc20Vault[asset_]).totalAssets()
            );
        }
    }

    receive() external payable {}
}
