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

import "./ERC20B.sol";

contract LUSD is ERC20B {
    string public constant _name = "Lux Dollar";
    string public constant _symbol = "LUSD";

    constructor() ERC20B(_name, _symbol) {}
}
