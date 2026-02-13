// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
    ███████╗ ██████╗  ██████╗      █████╗ ██╗ ██╗ ██████╗ ███████╗
    ╚══███╔╝██╔═══██╗██╔═══██╗    ██╔══██╗██║███║██╔════╝ ╚══███╔╝
      ███╔╝ ██║   ██║██║   ██║    ███████║██║╚██║███████╗   ███╔╝
     ███╔╝  ██║   ██║██║   ██║    ██╔══██║██║ ██║██╔═══██╗ ███╔╝
    ███████╗╚██████╔╝╚██████╔╝    ██║  ██║██║ ██║╚██████╔╝███████╗
    ╚══════╝ ╚═════╝  ╚═════╝     ╚═╝  ╚═╝╚═╝ ╚═╝ ╚═════╝ ╚══════╝
 */

import "../ERC20B.sol";

contract ZooAI16Z is ERC20B {
    string public constant TOKEN_NAME = "Zoo AI16Z";
    string public constant TOKEN_SYMBOL = "ZAI16Z";

    constructor(address admin) ERC20B(TOKEN_NAME, TOKEN_SYMBOL, admin) {}
}
