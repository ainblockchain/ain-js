# AIN v2 execution layers

The mainnet and testnet API gateways execute ordinary requests on L2 by default.
Five operators validate L2; a certificate from four operators records its commitment
on L1. An L1 checkpoint is an operator attestation, not a validity proof or an
implemented withdrawal mechanism. Existing application state and assets are
canonical on L2; the corresponding L1 state is locked.

Use this SDK version with the existing asynchronous database API:

```js
const ain = new Ain('https://mainnet-api.ainetwork.ai');
ain.wallet.addAndSetDefaultAccount(privateKey);
await ain.db.ref('/apps/my_app/value').setValue({ value: 42 });
```

When chainId is omitted, asynchronous signing discovers the default layer and pins
its chain ID and genesis before signing. For initialization that checks the network
immediately, use `await Ain.connect(url)`. A failed or unhealthy layer discovery
fails closed. Only an explicit method-not-found response enables legacy behavior.

For L1 submission into the same canonical L2 application:

```js
const viaL1 = await Ain.connect('https://mainnet-api.ainetwork.ai', { layer: 'L1' });
viaL1.wallet.addAndSetDefaultAccount(privateKey);
const result = await viaL1.db.ref('/apps/my_app/value').setValue({ value: 42 });
```

This signs an L2 payload and an L1 inbox envelope with the same account. L2 execution
waits for the L1 transaction to finalize and for four L1 operators to attest it.
The submission result includes the L2 transaction hash; submission acknowledgement
is not execution finality. Query the L1 and L2 transaction receipts separately.

Explicit L1 clients read L1 state (including locked balances). Use a default L2
client to read the resulting application state. Clients are pinned to their
execution layer; create another client to change networks or layers.

Old SDK binaries and callers that explicitly hardcode legacy chain IDs must be
upgraded. A gateway cannot rewrite an already signed transaction. Offline
`wallet.signTransaction` requires an initialized `Ain.connect` client or the correct
explicit chain ID. Legacy P256 signatures lack chain-domain separation and are
rejected after migration; secp256k1 signatures are supported.

Gateway read APIs: `ain_getLayerInfo`, `ain_listTransactions`, and
`ain_getIndexedTransaction`, with optional `layer: 'L1' | 'L2'` parameters. Ordinary
RPC methods retain their existing shape. Layer routing never falls back to another
chain. Event endpoints default to L2; `/l1/` selects L1 events.
