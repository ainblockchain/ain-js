# Experimental Payment Channel Protocol

This Node.js API implements two-party, co-signed state transitions using Ed25519 keys and unsigned integer credit units. It is not an escrow contract or a production payment system. The caller must independently validate the opening reference, funding, participant identities and eventual settlement. The SDK does not treat an arbitrary opening hash as proof of an onchain deposit.

`PaymentChannel` is a named export of `@ainblockchain/ain-js`. The HTTP helpers are available from `@ainblockchain/ain-js/lib/state-channel/http-peer`.

1. Both participants construct a channel from identical `ChannelOpening` values.
2. The sender calls `propose(from, amount, privateKey)`. This signs a proposal without changing its committed balance.
3. The recipient calls `accept(proposal, privateKey)`. Domain, sequence, previous-state hash, sender signature, amount and balance conservation are checked before the recipient co-signs.
4. The sender calls `commit(receipt)`, verifying both signatures before changing its state.
5. If acknowledgement is lost, resend the identical proposal. The recipient returns its existing receipt for that state without applying the transfer again. A competing proposal for that sequence is rejected.

The canonical signature payload binds the opening hash, sequence, prior state hash, transfer direction, integer amount and resulting balances. Opening hashes include chain/channel identifiers, opening reference, public keys and initial balances. Snapshot objects are copies; mutating them does not change the channel.

`createPaymentPeer(channel, receiverKey, persist)` serves `/pay` and `/state`. The supplied asynchronous persistence callback must durably store each accepted receipt before resolving. The peer serializes requests, waits for persistence before acknowledging, and refuses further requests after a persistence error. Replay the durable receipts through `commit()` before accepting traffic after a restart. The example harness uses append plus fsync; a malformed or truncated journal is rejected rather than silently dropped.

`postPayment(endpoint, proposal)` transports one proposal over HTTP(S). Validate the returned receipt through `commit()`; HTTP success alone is not sufficient. Use TLS when confidentiality is required. A timeout is an observation failure, not permission to create a new transfer.

Verification performed in the reproduction workspace:
- SDK unit tests: conservation, wrong keys/signatures, malformed/insufficient amounts, cross-domain replay and conflicting sequences.
- Two Docker containers on an isolated bridge: 20 acknowledged transfers and 20 repeated deliveries; invalid signature, sequence gap and inflation rejected.
- Recipient killed after acknowledgements and restarted from the fsynced journal; balances, signatures and head match, and replaying the last proposal does not double-pay.

The reproduction workspace also ran 100 channels (200 participant keys) for 60 seconds in separate sender/receiver Docker containers, each limited to 2 CPU and 4 GiB RAM. Every receipt was fsynced before acknowledgement. The measured window contained 40,071 transfers (667.85 TPS); 100 further acknowledgements arrived during drain and were excluded from TPS. All 40,171 committed transfers were independently replayed from the journals, with matching balances and heads. The 7,000 TPS target was not achieved.

Opening metadata and a final checkpoint were recorded on the local 10-node AIN chain, with finalized receipts, independent node readback and block inclusion checks. These are checkpoint records, not escrow deposits or payouts. Evidence run: `channel_network_load_20260911_r2`; opening transaction `0x3797325687029b6b747c65bab4d0b5893002e8f38819e538cad982f8796fff1d`, final transaction `0x968b9c07e70d2c431c2e90b5463460d5d5975b017653eefccc1943d462621f9d`. The full stability matrix and adversarial onchain dispute resolution remain incomplete.
