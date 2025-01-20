// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
    ████████╗██████╗ ██╗   ██╗███╗   ███╗██████╗ 
    ╚══██╔══╝██╔══██╗██║   ██║████╗ ████║██╔══██╗
       ██║   ██████╔╝██║   ██║██╔████╔██║██████╔╝
       ██║   ██╔══██╗██║   ██║██║╚██╔╝██║██╔═══╝ 
       ██║   ██║  ██║╚██████╔╝██║ ╚═╝ ██║██║     
       ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     
 */

import "../ERC20B.sol";

contract TRUMP is ERC20B {
    string public constant _name = "OFFICIAL TRUMP";
    string public constant _symbol = "TRUMP";

    constructor() ERC20B(_name, _symbol) {}

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) public {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) public {
        _burn(account, amount);
    }
}
