// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
    ███████╗ ██████╗  ██████╗     ██████╗ ██╗      █████╗ ███████╗████████╗
    ╚══███╔╝██╔═══██╗██╔═══██╗    ██╔══██╗██║     ██╔══██╗██╔════╝╚══██╔══╝
      ███╔╝ ██║   ██║██║   ██║    ██████╔╝██║     ███████║███████╗   ██║   
     ███╔╝  ██║   ██║██║   ██║    ██╔══██╗██║     ██╔══██║╚════██║   ██║   
    ███████╗╚██████╔╝╚██████╔╝    ██████╔╝███████╗██║  ██║███████║   ██║   
    ╚══════╝ ╚═════╝  ╚═════╝     ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝   ╚═╝   
 */

import "../ERC20B.sol";

contract ZooBLAST is ERC20B {
    string public constant _name = "Zoo BLAST";
    string public constant _symbol = "ZBLAST";

    constructor() ERC20B(_name, _symbol) {}

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public {
        _burn(account, amount);
    }
}