// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
    ███████╗
    ╚══███╔╝
      ███╔╝
     ███╔╝
    ███████╗
    ╚══════╝
 */

import "../ERC20B.sol";

contract Z is ERC20B {
    string public constant TOKEN_NAME = "Z";
    string public constant TOKEN_SYMBOL = "Z";

    constructor(address admin) ERC20B(TOKEN_NAME, TOKEN_SYMBOL, admin) {}

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}
