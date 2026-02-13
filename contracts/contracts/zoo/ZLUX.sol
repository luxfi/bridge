// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
    ███████╗ ██████╗  ██████╗     ██╗     ██╗   ██╗██╗  ██╗
    ╚══███╔╝██╔═══██╗██╔═══██╗    ██║     ██║   ██║╚██╗██╔╝
      ███╔╝ ██║   ██║██║   ██║    ██║     ██║   ██║ ╚███╔╝
     ███╔╝  ██║   ██║██║   ██║    ██║     ██║   ██║ ██╔██╗
    ███████╗╚██████╔╝╚██████╔╝    ███████╗╚██████╔╝██╔╝ ██╗
    ╚══════╝ ╚═════╝  ╚═════╝     ╚══════╝ ╚═════╝ ╚═╝  ╚═╝
 */

import "../ERC20B.sol";

contract ZooLUX is ERC20B {
    string public constant TOKEN_NAME = "Zoo LUX";
    string public constant TOKEN_SYMBOL = "ZLUX";

    constructor(address admin) ERC20B(TOKEN_NAME, TOKEN_SYMBOL, admin) {}
}
