/***
 *Submitted for verification at basescan.org on 2024-03-20
 */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {MyERC4626} from "./MyERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ETHVault} from "./ETHVault.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";


contract Vault is Ownable{
    mapping(address => address) public erc20Vault;
    address payable public ethVaultAddress;
    event ERC20VaultCreated(address indexed asset, address indexed vaultAddress);
    constructor(address[] memory _assets) Ownable(msg.sender){
        for(uint i = 0 ; i < _assets.length ; ++i){
            _addNewERC20Vault(_assets[i]);
        }
        ETHVault newETHVault = new ETHVault("Native Vault", "ethVault");
        ethVaultAddress = payable(address(newETHVault));
    }
    function concat(string memory a, string memory b) internal pure returns (string memory) {
        return string(abi.encodePacked(a, b));
    }
    function addNewERC20Vault(address _asset) external onlyOwner {
        _addNewERC20Vault(_asset);
    }
    function _addNewERC20Vault(address _asset) private {
        require(_asset != address(0), "Invalid asset address.");
        require(erc20Vault[_asset] == address(0), "Already exist.");
        MyERC4626 newERC20Vault = new MyERC4626(IERC20(_asset), concat(ERC20(_asset).name(), " vault"), concat("v", ERC20(_asset).symbol()));
        address newVaultAddress = address(newERC20Vault);
        erc20Vault[_asset] = newVaultAddress;
        IERC20(_asset).approve(newVaultAddress, type(uint256).max);
        emit ERC20VaultCreated(_asset, newVaultAddress);
    }

    function deposit(address _asset, uint256 _amount) external onlyOwner payable {
        if (_asset == address(0)) {
            require(msg.value == _amount, "Insufficient ETH amount");
            ETHVault(ethVaultAddress).deposit{value: _amount}(_amount, owner());
        } else {
            ERC4626(erc20Vault[_asset]).deposit(_amount, owner());
        }
    }

    function withdraw(address _asset, address receiver, uint256 _amount) external onlyOwner {
        if (_asset == address(0)) {
            ETHVault(ethVaultAddress).withdraw(_amount, receiver, owner());
        } else {
            ERC4626(erc20Vault[_asset]).withdraw(_amount, receiver, owner());
        }
    }

    function previewWithdraw(address _asset, uint256 _amount) public view returns(bool) {
        if (_asset == address(0)) {
            if(ETHVault(ethVaultAddress).balanceOf(owner()) >= _amount) return true;
            return false;
        } else {
            if(ERC4626(erc20Vault[_asset]).maxWithdraw(owner()) >= _amount) return true;
            return false;
        }
    }
    receive() external payable {}
}