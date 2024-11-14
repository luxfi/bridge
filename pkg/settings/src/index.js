"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testnetSettings = exports.mainnetSettings = void 0;
// Importing JSON files for mainnet
var networks_json_1 = require("./mainnet/networks.json");
// Importing JSON files for testnet
var exchanges_json_1 = require("./testnet/exchanges.json");
var networks_json_2 = require("./testnet/networks.json");
// testnets
var exchanges_json_2 = require("./mainnet/exchanges.json");
exports.mainnetSettings = {
    data: {
        currencies: [],
        exchanges: exchanges_json_2.default,
        networks: __spreadArray(__spreadArray([], networks_json_1.default, true), networks_json_2.default, true)
    },
    error: null
};
exports.testnetSettings = {
    data: {
        exchanges: exchanges_json_1.default,
        networks: networks_json_2.default
    },
    error: null
};
