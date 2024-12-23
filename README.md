# AIN Blockchain SDK

[![npm version](https://img.shields.io/npm/v/@ainblockchain/ain-js.svg)](https://npmjs.org/package/@ainblockchain/ain-js)
![npm-downloads](https://img.shields.io/npm/dm/@ainblockchain/ain-js)
![license](https://img.shields.io/badge/license-MPL--2.0-blue)

A simple library for JavaScript and TypeScript to interact with AI Network via [JSON RPC API](https://github.com/ainblockchain/ain-blockchain/blob/master/JSON_RPC_API.md).

## Installation

```sh
$ npm install @ainblockchain/ain-js
```

## Usage

The full API of this library can be found in [API document](https://ainblockchain.github.io/ain-js), along with [code examples](https://github.com/ainblockchain/quickstart). The following code shows how to create a wallet account using the wallet API.

### Create Wallet

```js
const Ain = require('@ainblockchain/ain-js').default;

const ain = new Ain('https://testnet-api.ainetwork.ai', 'wss://testnet-event.ainetwork.ai', 0);

function main() {
  const accounts = ain.wallet.create(1);

  console.log(accounts[0]);
}

main();

// output example:
// {
//   address: '0xb2585543Cfcfb79CF73a1a14b2DfBC411913940F',
//   private_key: '...',
//   public_key: '...'
// }
```

### Read and Write Data

```js
const Ain = require('@ainblockchain/ain-js').default;

const ain = new Ain('https://testnet-api.ainetwork.ai', 'wss://testnet-event.ainetwork.ai', 0);

async function main() {
  const address = ain.wallet.addAndSetDefaultAccount('YOUR_PRIVATE_KEY');

  // write value to db
  const result = await ain.db.ref('YOUR_DATA_PATH').setValue({
    value: 'hello',
    gas_price: 500,
    timestamp: Date.now(),
    nonce: -1,
  });

  // read value from db
  const data = await ain.db.ref('YOUR_DATA_PATH').getValue();
  console.log(data);
}

main();
```

### Rules and Owners

[Rule configs](https://docs.ainetwork.ai/ain-blockchain/ai-network-design/blockchain-database/rules-and-owners/rule-configs) validate transactions and control write permissions, while [owner configs](https://docs.ainetwork.ai/ain-blockchain/ai-network-design/blockchain-database/rules-and-owners/owner-configs) manage write access to both rules and themselves.

The following code shows how to configure a rule to allow write access for all users:

```js
const Ain = require('@ainblockchain/ain-js').default;

const ain = new Ain('https://testnet-api.ainetwork.ai', 'wss://testnet-event.ainetwork.ai', 0);

async function main() {
  const address = ain.wallet.addAndSetDefaultAccount('YOUR_PRIVATE_KEY');

  // set the rule to allow write access for all users
  const result = await ain.db.ref(appPath).setRule({
    value: {
      '.rule': {
        write: true,
      },
    },
    gas_price: 500,
    timestamp: Date.now(),
    nonce: -1,
  });
}

main();
```

### Function Call

```js
const Ain = require('@ainblockchain/ain-js').default;

const ain = new Ain('https://testnet-api.ainetwork.ai', 'wss://testnet-event.ainetwork.ai', 0);

async function main() {
  const address = ain.wallet.addAndSetDefaultAccount('YOUR_PRIVATE_KEY');

  // trigger a function when a value is written to the data path
  const result = await ain.db.ref('YOUR_DATA_PATH').setFunction({
    value: {
      '.function': {
        YOUR_FUNCTION_ID: {
          function_type: 'REST',
          function_url: 'YOUR_FUNCTION_URL',
          function_id: 'YOUR_FUNCTION_ID',
        },
      },
    },
    gas_price: 500,
    timestamp: Date.now(),
    nonce: -1,
  });
}

main();
```

## Documentation

Browse the documentation online:

- [Quick Start](https://docs.ainetwork.ai/ain-blockchain/developer-guide/getting-started)
- [Full API Documentation](https://ainblockchain.github.io/ain-js)
- [Developer Guide](https://docs.ainetwork.ai/ain-blockchain/developer-guide)

## Testing

To run tests, a local blockchain node must be running.

1. Clone and install the AIN Blockchain:

```sh
$ git clone https://github.com/ainblockchain/ain-blockchain.git
$ cd ain-blockchain
$ npm install
```

2. Start the local blockchain:

```sh
$ bash start_local_blockchain.sh
```

- For event manager test cases, ensure Node 2 is started with the `ENABLE_EVENT_HANDLER` environment variable set to `true`.

3. Run the tests:

```sh
$ npm run test
```

- To update test snapshot files:

```sh
$ npm run test_snapshot
```

## License

MPL-2.0 License.
