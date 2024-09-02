// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
    ██╗     ██╗   ██╗██╗  ██╗    ██╗   ██╗███████╗██████╗ 
    ██║     ██║   ██║╚██╗██╔╝    ██║   ██║██╔════╝██╔══██╗
    ██║     ██║   ██║ ╚███╔╝     ██║   ██║███████╗██║  ██║
    ██║     ██║   ██║ ██╔██╗     ██║   ██║╚════██║██║  ██║
    ███████╗╚██████╔╝██╔╝ ██╗    ╚██████╔╝███████║██████╔╝
    ╚══════╝ ╚═════╝ ╚═╝  ╚═╝     ╚═════╝ ╚══════╝╚═════╝ 
 */

import "./ERC20B.sol";

contract LUSD is ERC20B {
    string public constant _name = "Lux Dollar";
    string public constant _symbol = "LUSD";

    constructor() ERC20B(_name, _symbol) {
        _mint(msg.sender, 10000000000 * 10 ** decimals());
    }

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public {
        _burn(account, amount);
    }
}
