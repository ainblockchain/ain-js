import { Block, Transaction, TransactionResult, PathValueObject } from './types';

export function test_block(blockHashOrBlockNumber: string | number): Block {
  let transactions: string[] = []
  for (let i = 0; i < 10; i++) {
    transactions.push("0xfe5404ed4915e34e27d62a70265fabd0c4880ecd9b0e24aa494b2bf50e4499e2");
  }
  return {
    number: typeof blockHashOrBlockNumber === "number" ? blockHashOrBlockNumber : 123456,
    hash: typeof blockHashOrBlockNumber === "number" ? "0x945b374735e7a3626b57cce1020c3fc87c254709ec62937e34a0aa976347111a" : blockHashOrBlockNumber,
    parent_hash: "0xd96c7966aa6e6155af3b0ac69ec180a905958919566e86c88aef12c94d936b5e",
    forger: "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
    validators: [
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6"
    ],
    size: 5723,
    timestamp: 1565692642231,
    transactions
  };
}

export function test_blockWithTx(blockHashOrBlockNumber: string | number): Block {
  let transactions: Transaction[] = []
  for (let i = 0; i < 10; i++) {
    transactions.push({
      tx_hash: "0xfe5404ed4915e34e27d62a70265fabd0c4880ecd9b0e24aa494b2bf50e4499e2",
      nonce: 17,
      timestamp: 1569824920000 + i,
      block_hash: typeof blockHashOrBlockNumber === "number" ? "0x945b374735e7a3626b57cce1020c3fc87c254709ec62937e34a0aa976347111a" : blockHashOrBlockNumber,
      block_number: typeof blockHashOrBlockNumber === "number" ? blockHashOrBlockNumber: 123456,
      tx_index: i,
      address: "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
      operation: {
        type: "INC_VALUE",
        ref: "path/to/value",
        value: 100
      },
      parent_tx_hash: "0x0a2f1285685338886790d68e41c2b4c068d829acdea176faecfaccb510519894"
    })
  }
  return {
    number: typeof blockHashOrBlockNumber === "number" ? blockHashOrBlockNumber : 123456,
    hash: typeof blockHashOrBlockNumber === "number" ? "0x945b374735e7a3626b57cce1020c3fc87c254709ec62937e34a0aa976347111a" : blockHashOrBlockNumber,
    parent_hash: "0xd96c7966aa6e6155af3b0ac69ec180a905958919566e86c88aef12c94d936b5e",
    forger: "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
    validators: [
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
      "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6"
    ],
    size: 5723,
    timestamp: 1565692642231,
    transactions
  };
}

export function test_transaction(transactionHash?: string, blockHash?: string, blockNumber?: number): Transaction {
  return {
    tx_hash: transactionHash ? transactionHash : "0xfe5404ed4915e34e27d62a70265fabd0c4880ecd9b0e24aa494b2bf50e4499e2",
    nonce: 123,
    timestamp: 1569824920000,
    block_hash: blockHash ? blockHash : "0x945b374735e7a3626b57cce1020c3fc87c254709ec62937e34a0aa976347111a",
    block_number: blockNumber ? blockNumber : 12345,
    tx_index: 7,
    address: "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
    operation: {
      type: "SET_RULE",
      ref: "path/to/rule",
      value: {".write": false, ".apply": "EXTEND"},
    },
    parent_tx_hash: "0x0a2f1285685338886790d68e41c2b4c068d829acdea176faecfaccb510519894"
  }
}

export function test_transactionResult(transactionHash?: string): TransactionResult {
  return {
    status: true,
    block_hash: "0x945b374735e7a3626b57cce1020c3fc87c254709ec62937e34a0aa976347111a",
    block_number: 123,
    tx_hash: transactionHash ? transactionHash : "0xfe5404ed4915e34e27d62a70265fabd0c4880ecd9b0e24aa494b2bf50e4499e2",
    tx_index: 23,
    address: "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6",
    parent_tx_hash: "0x0a2f1285685338886790d68e41c2b4c068d829acdea176faecfaccb510519894"
  };
}

export const test_root_rule: PathValueObject = {
    ref: "",
    value: {
      ".write": "auth === 0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6"
    }
  };

export const test_root_value = "0x1234567890"; // hash of the genesis block?

export const test_value = 100;

export const test_rule = "auth === '0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6'";

export const test_owner = {
  inherit: [],
  owners: {
    "*": {
      owner_update: true,
      rule_update: true,
      branch: true
    },
    "0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6": {
      owner_update: true,
      rule_update: true,
      branch: true
    }
  }
};

export const test_hash = "0x963fe04778693e4554f232213a7d7a1a00c4c4923eb158badedc5472416c9f53";

export const test_func = "0x186909cf6d2e3cbe339c0a7f99bb3f35a0d572554710f4da2c928118f635f4db";
