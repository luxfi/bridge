/**
 *Submitted for verification at basescan.org on 2024-03-20
 */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
    ██╗     ██╗   ██╗██╗  ██╗    ██████╗  ██████╗ ██╗     
    ██║     ██║   ██║╚██╗██╔╝    ██╔══██╗██╔═══██╗██║     
    ██║     ██║   ██║ ╚███╔╝     ██████╔╝██║   ██║██║     
    ██║     ██║   ██║ ██╔██╗     ██╔═══╝ ██║   ██║██║     
    ███████╗╚██████╔╝██╔╝ ██╗    ██║     ╚██████╔╝███████╗
    ╚══════╝ ╚═════╝ ╚═╝  ╚═╝    ╚═╝      ╚═════╝ ╚══════╝
 */

import "../ERC20B.sol";

contract LuxPOL is ERC20B {
    string public constant _name = "Lux POL";
    string public constant _symbol = "LPOL";

    constructor() ERC20B(_name, _symbol) {}

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public {
        _burn(account, amount);
    }
}