// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";


contract ETHVault is ERC20 {

    // Event to emit when ETH is deposited
    event Deposit(address indexed user, uint256 amount);

    event Withdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 amount
    );

    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}
    // Function to receive ETH and mint shares
    receive() external payable {}

    function deposit(uint256 amount, address receiver) external payable {
        require(msg.value > 0 && amount == msg.value, "Must send ETH");
        // Calculate the number of shares to mint
        uint256 shares = msg.value; // For simplicity, 1 ETH = 1 share
        // Mint the shares to the sender
        _mint(receiver, shares);
        emit Deposit(msg.sender, msg.value);
    }

    // Allow owner to withdraw all ETH
    function withdraw(uint256 amount, address receiver, address owner) external {
        require(amount <= address(this).balance, "Insufficient balance");
        if (msg.sender != owner) {
            uint256 allowed = allowance(owner, msg.sender);
            require(allowed >= amount, "Invalid alowance");
        }
        _burn(owner, amount);
        (bool success, ) = payable(receiver).call{value:amount}("");
        require(success, "sending failed");
        emit Withdraw(msg.sender, receiver, owner, amount);
    }

}