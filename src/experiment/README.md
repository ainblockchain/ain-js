# Experiment measurements

`ExperimentPublisher` writes the version-1 events consumed by AINSCAN's
`/experiments?runId=<run-id>` page. Configure both clients for the same chain and
app (`ainize_kpi` by default). Use an existing funded SDK signer; never embed keys
in event payloads. The exact event contract is in `events.ts`.

```ts
import Ain, { ExperimentPublisher } from '@ainblockchain/ain-js';

const ain = new Ain(rpcUrl, null, chainId);
const publisher = new ExperimentPublisher(ain, runId);
const submitted = await publisher.publish(event);
const included = await publisher.inclusion(submitted);
```

Configure the signer before publishing. Save the returned path, transaction hash
and submission timestamp in a durable local outbox. `inclusion` returns `null`
while block membership cannot be established; poll the same submission rather
than submitting a new transaction. Inclusion uses the block timestamp and does
not wait for finality. A negative interval is a clock error, not a zero latency.

Publication returns only after an accepted transaction response. A network error
may have occurred after submission: do not blindly retry or mint a new event ID.
Recover the signed transaction/outbox and inspect its status first. Automatic
crash recovery is not yet part of this publisher.

The SDK refuses existing paths, but this check alone is not atomic authorization.
Before deployment, configure chain write rules limiting writers and requiring
`data === null` at event paths. This SDK does not modify root permissions or
create the app. Event records are immutable; use a new event ID for each actual
lifecycle transition and retain execution start/end timestamps in later snapshots.

Model, dataset and throughput evidence remains reporter-supplied even when its
storage transaction is included on-chain. It is not an independent pass verdict.
