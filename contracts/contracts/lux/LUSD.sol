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

import "../ERC20B.sol";

contract LuxUSD is ERC20B {
    string public constant TOKEN_NAME = "Lux USD";
    string public constant TOKEN_SYMBOL = "LUSD";

    constructor(address admin) ERC20B(TOKEN_NAME, TOKEN_SYMBOL, admin) {}
}
