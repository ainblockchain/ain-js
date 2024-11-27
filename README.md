# ain-js
AI Network Blockchain SDK for javascript (or typescript).

## API Documentation
API documentation is available at https://ainblockchain.github.io/ain-js/.

## Installation
```
yarn add @ainblockchain/ain-js
```

## Examples
### A Simple Example
```
const Ain = require('./lib/ain').default;
const ain = new Ain('http://localhost:8081/', 'ws://localhost:5100/');
// or const ain = new Ain('https://testnet-api.ainetwork.ai/', 'wss://testnet-event.ainetwork.ai/');

ain.wallet.create(1);

console.log(ain.wallet.accounts);
/*
{
  '0xb2585543Cfcfb79CF73a1a14b2DfBC411913940F': {
    address: '0xb2585543Cfcfb79CF73a1a14b2DfBC411913940F',
    private_key: 'd910c1835eaa89f15452aa3f0bd95f61fb9a04464150e37d617a40ed0071558c',
    public_key: '008bcc621aed85140b97d71b3aa5a88e56fbdc0d5d17b2297ec2d3da2edf3b0594676981ebf16ec3490ddb8f3ba4d4aaf77d5055256f1c044474a7aa22704f60'
  }
}
*/

const accounts = ain.db.ref('/accounts').getValue().then(result => {
  console.log(result);
});
```

### More Use Cases
#### [ainize-js](https://github.com/ainize-team/ainize-js)
- [AinModule](https://github.com/ainize-team/ainize-js/blob/main/src/ain.ts)

#### [ainft-js](https://github.com/ainize-team/ainize-js)
- [AinftJs](https://github.com/ainft-team/ainft-js/blob/main/src/ainft.ts)

## Test How-To
For testing, you need a blockchain node cluster running locally.
1. Clone AIN Blockchain and install
```
git clone git@github.com:ainblockchain/ain-blockchain.git
cd ain-blockchain
yarn install
```

2. Start blockchain locally
```
cd ain-blockchain
bash start_local_blockchain.sh
```
* Note that the node 2 of the blockchain needs to be started with ENABLE_EVENT_HANDLER=true env variable for the event manager test cases.

3. Run tests
```
yarn run test
yarn run test_snapshot  # update test snapshot files
```

## LICENSE

MPL-2.0
