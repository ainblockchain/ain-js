# ain-js

AI Network Client Library for Node.js

## Installation
```
yarn add @ainblockchain/ain-js
```

## Examples
```
const Ain = require('./lib/ain').default;
const ain = new Ain('http://node.ainetwork.ai:8080/');

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

## API

### Ain
`constructor(provideUrl: string, chainId?: number)`
- Constructs Ain.
- Usage : `const ain = new Ain('http://node.ainetwork.ai:8080/');`

`setProvider(providerUrl: string, chainId?: number)`
- Sets a new provider.

`getBlock(blockHashOrBlockNumber: string | number, returnTransactionObjects?: boolean): Promise<Block>`
- A promise returns a block with the given hash or block number.

`getProposer(blockHashOrBlockNumber: string | number): Promise<string>`
- A promise returns the address of the forger of given block.

`getValidators(blockHashOrBlockNumber: string | number): Promise<string[]>`
- A promise returns the list of validators for a given block.

`getTransaction(transactionHash: string): Promise<TransactionInfo>`
- Returns the transaction with the given transaction hash.

`getStateUsage(appName: string): Promise<StateUsageInfo>`
- Returns the state usage information with the given app name.

`async validateAppName(appName: string): Promise<AppNameValidationInfo>`
- Validates an app name.

`async sendTransaction(transactionObject: TransactionInput): Promise<any>`
- Signs and sends a transaction to the network.

`async sendSignedTransaction(signature: string, txBody: TransactionBody): Promise<any>`
- Sends a signed transaction to the network.

`async sendTransactionBatch(transactionObjects: TransactionInput[]): Promise<any>`
- Sends signed transactions to the network.

`depositConsensusStake(transactionObject: ValueOnlyTransactionInput): Promise<any>`
- Sends a transaction that deposits AIN for consensus staking.

`withdrawConsensusStake(transactionObject: ValueOnlyTransactionInput): Promise<any>`
- Sends a transaction that withdraws AIN for consensus staking.

`getConsensusStakeAmount(account?: string): Promise<number>`
- Gets the amount of AIN currently staked for participating in consensus protocol.

`getNonce(args: {address?: string, from?: string}): Promise<number>`
- Returns the current transaction count of account, which is the nonce of the account.

`async buildTransactionBody(transactionInput: TransactionInput): Promise<TransactionBody>`
- Builds a transaction body from transaction input.

`static get utils()`
- Getter for ain-util library.

`static instanceofTransactionBody(object: any): object is TransactionBody`
- Checks whether a given object is an instance of TransactionBody interface.

### Ain.Provider

`sync send(rpcMethod: string, params?: any): Promise<any>`
- Creates the JSON-RPC payload and sends it to the node.

`setDefaultTimeoutMs(time: number)`
- Sets the httpClient's default timeout time.

### Ain.Database

`ref(path?: string): Reference`
- Returns a reference instance of the given path.

#### Ain.Database.Reference

`setIsGlobal(isGlobal: boolean)`
- Sets the global path flag.

`get numberOfListeners(): number`
- A getter for number of listeners.

`push(value?: any): Promise<any> | Reference`
- If value is given, it sets the value at a new child of this.path. Otherwise, it creates a key for a new child but doesn't set any values.

`getValue(path?: string): Promise<any>`
- Returns the value at the path.

`getRule(path?: string): Promise<any>`
- Returns the rule at the path.

`getOwner(path?: string): Promise<any>`
- Returns the owner config at the path.

`getFunction(path?: string): Promise<any>`
- Returns the function config at the path.

`get(gets: GetOperation[]): Promise<any>`
- Returns the value / write rule / owner rule / function hash at multiple paths.

`deleteValue(transactionInput?: ValueOnlyTransactionInput): Promise<any>`
- Deletes a value.

`setFunction(transactionInput: ValueOnlyTransactionInput): Promise<any>`
- Sets a function config.

`setOwner(transactionInput: ValueOnlyTransactionInput): Promise<any>`
- Sets the owner rule.

`setRule(transactionInput: ValueOnlyTransactionInput): Promise<any>`
- Sets the write rule.

`setValue(transactionInput: ValueOnlyTransactionInput): Promise<any>`
- Sets a value.

`incrementValue(transactionInput: ValueOnlyTransactionInput): Promise<any>`
- Increments the value.

`decrementValue(transactionInput: ValueOnlyTransactionInput): Promise<any>`
- Decrements the value.

`set(transactionInput: SetMultiTransactionInput): Promise<any>`
- Processes multiple set operations.

`evalRule(params: EvalRuleInput): Promise<boolean>`
- Returns the rule evaluation result. True if the params satisfy the write rule false if not.

`evalOwner(params: EvalOwnerInput): Promise<any>`
- Returns the owner evaluation result.

`matchFunction(params?: MatchInput): Promise<any>`
- Returns the function configs that are related to the input ref.

`matchRule(params?: MatchInput): Promise<any>`
- Returns the rule configs that are related to the input ref.

`matchOwner(params?: MatchInput): Promise<any>`
- Returns the owner configs that are related to the input ref.

`static buildGetRequest(type: GetOperationType, ref: string)`
- Builds a get request.

`static extendPath(basePath?: string, extension?: string): string`
- Returns a path that is the basePath extended with extension.

`static extendSetTransactionInput(input: ValueOnlyTransactionInput, ref: string, type: SetOperationType, isGlobal: boolean): TransactionInput`
- Decorates a transaction input with an appropriate type, ref and value.

`static extendSetMultiTransactionInput(input: SetMultiTransactionInput, ref: string): TransactionInput`
- Decorates a transaction input with an appropriate type and op_list.

`static sanitizeRef(ref?: string): string`
- Returns a sanitized ref. If should have a slash at the beginning and no slash at the end.

### Ain.net

`isListening(): Promise<boolean>`
- Returns whether the node is listening for network connections.

`getNetworkId(): Promise<string>`
- Returns the id of the network the node is connected to.

`async checkProtocolVersion(): Promise<any>`
- Checks the protocol version

`getProtocolVersion(): Promise<string>`
- Returns the protocol version of the node.

`getPeerCount(): Promise<number>`
- Returns the number of peers the provider node is connected to.

`isSyncing(): Promise<boolean>`
- Returns whether the node is syncing with the network or not.

### Ain.wallet
`get length()`
- Getter for the number of accounts in the wallet.

`setChainId(chainId: number)`
- Sets the chain ID.

`getPublicKey(address: string): string`
- Returns the full public key of the given address.

`create(numberOfAccounts: number): Array<string>`
- Creates {numberOfAccounts} new accounts and add them to the wallet.

`isAdded(address: string): boolean`
- Returns whether the address has already been added to the wallet.

`add(privateKey: string): string`
- Adds a new account from the given private key.

`addAndSetDefaultAccount(privateKey: string): string`
- Adds a new account from the given private key and sets the new account as the default account.

`addFromHDWallet(seedPhrase: string, index: number = 0): string`
- Adds an account from a seed phrase. Only the account at the given index (default = 0) will be added.

`addFromV3Keystore(v3Keystore: V3Keystore | string, password: string): string`
- Adds an account from a V3 Keystore.

`remove(address: string)`
- Removes an account

`setDefaultAccount(address: string)`
- Sets the default account as {address}. The account should be already added in the wallet.

`removeDefaultAccount()`
- Removes a default account (sets it to null).

`clear()`
- Clears the wallet (remove all account information).

`getImpliedAddress(inputAddress?: string)`
- Returns the "implied" address. If address is not given, it returns the defaultAccount. It throws an error if an address is not given and defaultAccount is not set, or the specified address is not added to the wallet.

`getBalance(address?: string): Promise<number>`
- Returns the AIN balance of the address.

`transfer(input: {to: string, value: number, from?: string, nonce?: number}): Promise<any>`
- Sends a transfer transaction to the network.

`sign(data: string, address?: string): string`
- Signs a string data with the private key of the given address. It will use the defaultAccount if an address is not provided.

`signTransaction(tx: TransactionBody, address?: string): string`
- Signs a transaction data with the private key of the given address. It will use the defaultAccount if an address is not provided.

`getHashStrFromSig(signature: string): string`
- Gets the hash from the signature.

`recover(signature: string): string`
- Recovers an address of the account that was used to create the signature.

`verifySignature(data: any, signature: string, address: string): boolean`
- Verifies if the signature is valid and was signed by the address.

`toV3Keystore(password: string, options: V3KeystoreOptions = {}): V3Keystore[]`
- Save the accounts in the wallet as V3 Keystores, locking them with the password.

`accountToV3Keystore(address: string, password: string, options: V3KeystoreOptions = {}): V3Keystore`
- Converts an account into a V3 Keystore and encrypts it with a password.

`static fromPrivateKey(privateKey: Buffer): Account`
- Imports an account from a private key.

### Ain.eh
`connect(connectionOption?: EventChannelConnectionOption, disconnectCallback?: DisconnectCallback)`
- Connect to event handler node. Must be called before subscribing.

`disconnect()`
- Disconnect from the event handler node and unsubscribe all subscriptions.

`subscribe(eventTypeStr: string, config: EventConfigType,
eventCallback?: BlockchainEventCallback, errorCallback?: (error: any) => void): string`
- Subscribe to specific blockchain events in the blockchain.

`unsubscribe(filterId: string, callback: ErrorFirstCallback<EventFilter>)`
- Unsubscribe from a previously subscribed event.

## Test How-To
1. Clone AIN Blockchain and install
```
git clone git@github.com:ainblockchain/ain-blockchain.git
yarn install
```

2. Start blockchain locally
```
bash start_local_blockchain.sh
```
   * Note that the node 2 of the blockchain needs to be started with ENABLE_EVENT_HANDLER=true env variable for the event manager test cases.

3. Run tests
```
yarn run test
yarn run test_snapshot
```


## LICENSE

MPL-2.0
