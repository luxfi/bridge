// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
    ███████╗ ██████╗  ██████╗     ████████╗ ██████╗ ███╗   ██╗
    ╚══███╔╝██╔═══██╗██╔═══██╗    ╚══██╔══╝██╔═══██╗████╗  ██║
      ███╔╝ ██║   ██║██║   ██║       ██║   ██║   ██║██╔██╗ ██║
     ███╔╝  ██║   ██║██║   ██║       ██║   ██║   ██║██║╚██╗██║
    ███████╗╚██████╔╝╚██████╔╝       ██║   ╚██████╔╝██║ ╚████║
    ╚══════╝ ╚═════╝  ╚═════╝        ╚═╝    ╚═════╝ ╚═╝  ╚═══╝
 */

import "../ERC20B.sol";

contract ZooTON is ERC20B {
    string public constant TOKEN_NAME = "Zoo TON";
    string public constant TOKEN_SYMBOL = "ZTON";

    constructor(address admin) ERC20B(TOKEN_NAME, TOKEN_SYMBOL, admin) {}
}
