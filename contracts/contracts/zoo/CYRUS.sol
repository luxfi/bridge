// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
     ██████╗██╗   ██╗██████╗ ██╗   ██╗███████╗     █████╗ ██╗
    ██╔════╝╚██╗ ██╔╝██╔══██╗██║   ██║██╔════╝    ██╔══██╗██║
    ██║      ╚████╔╝ ██████╔╝██║   ██║███████╗    ███████║██║
    ██║       ╚██╔╝  ██╔══██╗██║   ██║╚════██║    ██╔══██║██║
    ╚██████╗   ██║   ██║  ██║╚██████╔╝███████║    ██║  ██║██║
     ╚═════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝    ╚═╝  ╚═╝╚═╝
 */

import "../ERC20B.sol";

contract CYRUS is ERC20B {
    string public constant TOKEN_NAME = "Cyrus AI";
    string public constant TOKEN_SYMBOL = "CYRUS";

    constructor(address admin) ERC20B(TOKEN_NAME, TOKEN_SYMBOL, admin) {}

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}
