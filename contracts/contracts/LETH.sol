/**
 *Submitted for verification at basescan.org on 2024-03-20
 */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
    ██╗     ██╗   ██╗██╗  ██╗    ███████╗████████╗██╗  ██╗
    ██║     ██║   ██║╚██╗██╔╝    ██╔════╝╚══██╔══╝██║  ██║
    ██║     ██║   ██║ ╚███╔╝     █████╗     ██║   ███████║
    ██║     ██║   ██║ ██╔██╗     ██╔══╝     ██║   ██╔══██║
    ███████╗╚██████╔╝██╔╝ ██╗    ███████╗   ██║   ██║  ██║
    ╚══════╝ ╚═════╝ ╚═╝  ╚═╝    ╚══════╝   ╚═╝   ╚═╝  ╚═╝
 */

import "./ERC20B.sol";

contract LETH is ERC20B {
    string public constant _name = "Lux ETH";
    string public constant _symbol = "LETH";

    constructor() ERC20B(_name, _symbol) {}
}
