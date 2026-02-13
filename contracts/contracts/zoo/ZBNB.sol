// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
    ███████╗ ██████╗  ██████╗     ██████╗ ███╗   ██╗██████╗
    ╚══███╔╝██╔═══██╗██╔═══██╗    ██╔══██╗████╗  ██║██╔══██╗
      ███╔╝ ██║   ██║██║   ██║    ██████╔╝██╔██╗ ██║██████╔╝
     ███╔╝  ██║   ██║██║   ██║    ██╔══██╗██║╚██╗██║██╔══██╗
    ███████╗╚██████╔╝╚██████╔╝    ██████╔╝██║ ╚████║██████╔╝
    ╚══════╝ ╚═════╝  ╚═════╝     ╚═════╝ ╚═╝  ╚═══╝╚═════╝
 */

import "../ERC20B.sol";

contract ZooBNB is ERC20B {
    string public constant TOKEN_NAME = "Zoo BNB";
    string public constant TOKEN_SYMBOL = "ZBNB";

    constructor(address admin) ERC20B(TOKEN_NAME, TOKEN_SYMBOL, admin) {}
}
