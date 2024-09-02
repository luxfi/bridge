// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract USDT is ERC20 {
    constructor() ERC20("USDT Coin", "USDT") {
        _mint(msg.sender, 10000000000 * 10 ** decimals());
    }

    function decimals() public pure override returns (uint8) {
        return 6; // Or whatever the constant value is
    }

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public {
        _burn(account, amount);
    }
}