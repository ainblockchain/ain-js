# Cooperative native-AIN escrow prerequisites

Experimental, development-chain only. This is not a production payment channel,
unilateral dispute protocol, or a 7,000 TPS result. Do not deposit valuable funds.
Both AIN account holders must cooperate to close; a missing participant can lock funds.

## What is checked

`cooperativeEscrow()` binds two checksummed AIN accounts, two Ed25519 channel keys,
integer micro-AIN deposits, and the opening domain to immutable AIN rules and owners.
The source uses native `_hold`, the target deposits to the bound escrow service
account, and both separately sign matching closing approvals before native `_release`.
`replayCooperativeClose()` checks every co-signed receipt before producing approvals.
The chain rules enforce both account approvals and conservation, not Ed25519 dispute
adjudication. Configuration installation requires the local development chain owner.
Use fresh source/target accounts per channel; exact AIN rule branches shadow wildcards.
The escrow service namespace preserves the original fallback branches.

Off-chain balances are integer micro-AIN (1 AIN = 1,000,000 units), with positive
initial deposits totaling at most 2^32 units. Native AIN stores JavaScript numbers:
payout guards mirror `_release` multiplication/subtraction order, and the audit
retains raw values while checking allocation at 1e-6 AIN. This is not exact decimal
arithmetic in the underlying ledger.

## Build and unit tests

From this repository, with the locally built dependency image already available:

```bash
docker build --network none -f tools/state-channel/refresh-sdk.Dockerfile \
  --build-arg BASE_IMAGE=ain-cert-channel-sdk:repro-20260911 \
  -t ain-cert-channel-sdk:cooperative-local .
docker run --rm --runtime runc --network none --cpus 2 --cpuset-cpus 0-7 \
  --memory 4g --memory-swap 4g --entrypoint sh ain-cert-channel-sdk:cooperative-local \
  -c 'npm test -- --runInBand __tests__/payment-channel.test.ts __tests__/cooperative-escrow.test.ts && node --test tools/state-channel/chain-readiness.test.js'
```

The dependency image is a local build artifact, not an available registry tag.
It contains `/app/ain-blockchain` and its native test dependencies, plus this SDK's
locked dependencies. The reproduction workspace supplies `kpi/docker/chain.Dockerfile`
and `channel-sdk.Dockerfile` for its initial build. An install with `--ignore-scripts`
must subsequently apply `patch-package --error-on-fail`: skipping the existing
ain-util/eccrypto secp256k1 compatibility patches breaks account creation and signing.
The obsolete isomorphic-ws default-export declaration patch conflicts with the SDK's
current `import WebSocket = require('isomorphic-ws')` and has been removed.

## Isolated native DB check

```bash
RUN_ID=native_db_$(date -u +%Y%m%dT%H%M%SZ) \
  AIN_CHANNEL_IMAGE=ain-cert-channel-sdk:cooperative-local \
  bash tools/state-channel/run-native-db.sh /absolute/new/evidence-directory
```

No live-chain volumes, peer network, GPU, or publisher keys are mounted. The wrapper
uses Docker CPU2, CPU set0–7, RAM/total memory+swap4GiB, read-only root, tmpfs256MiB,
no capabilities, and the invoking UID/GID. It initializes an ephemeral genesis,
verifies real AIN transaction signatures with signature bypass disabled, executes
native DB rules/functions with rollback enabled, and records all operations.
Zero gas prices are explicitly enabled only for this development experiment.

Verified 2026-09-11: 1 AIN escrow, 20 co-signed transfers of 3 micro-AIN, final
allocations 499,940/500,060 micro-AIN; 24 native DB operations, including 11 negative
cases. Failed deposits (including a negative deposit), unauthorized withdrawal,
missing/mismatched approvals, policy replacement, owner-only function installation,
wrong ratio, and repeated release leave the entire DB proof unchanged.
This is isolated DB execution, **not network finality or a throughput measurement**.
Earlier missing account-injection configuration and evidence-directory permission
failures are retained in the reproduction evidence rather than counted as successes.

## Ten-node preflight and future network experiment

From the reproduction workspace:

```bash
node kpi/pr/js-m2/tools/state-channel/chain-readiness.js observe \
  kpi/evidence/chain-readiness-NEW.json
RUN_ID=escrow_$(date -u +%Y%m%dT%H%M%SZ) \
  AIN_CHANNEL_IMAGE=ain-cert-channel-sdk:cooperative-local \
  bash kpi/pr/js-m2/tools/state-channel/run-escrow.sh \
  kpi/harness/genesis_accounts.json kpi/evidence/escrow-NEW kpi/secrets/escrow-NEW
```

The network runner is staged but **not successfully validated end to end**. It
targets the local `ain-cert-docker` project at RPC18081–18090 and refuses missing or
enabled `ENABLE_TX_SIG_VERIF_WORKAROUND`, non-development gas settings, a wrong owner
or genesis, unhealthy consensus, or lack of block progress before creating keys or
submitting transactions. Docker `healthy`/node `SERVING` alone is insufficient.

On 2026-09-11 the existing ten containers enabled signature bypass; observed finalized
blocks stayed at 23086 and native consensus health was false where the read completed.
Some requests timed out; they are recorded as unavailable, not successful observations.
The guarded runner refused this environment before signing, funding, or creating keys.
Existing chain/model/trainer containers were not restarted or replaced.

After the environment is independently repaired and reverified, the staged runner
uses a 1 AIN escrow, separate Docker HTTP peers, 20 co-signed micro-transfers and 20
duplicate deliveries, SIGKILL/restart of only its own peer, journal replay, matching
AIN approvals and native payout. Each client has CPU1/RAM2GiB/no GPU. Positive chain
operations require independent finalized state and block inclusion.

Every signed transaction intent is saved before submission. An uncertain response
must be investigated by the **same saved hash**; never rerun opening with new keys
to hide it. There is no automatic partial-opening/funding resume or unilateral fund
recovery. Inspect retained containers, operation responses and private state before
any manual recovery. A timeout is not authorization to reset the blockchain.

## Evidence boundary

The reproduction workspace retains `channel_escrow_sdk_tests_r5_20260911` (10 SDK
tests), `m2_chain_preflight_20260911` (four detector tests plus failed live preflight),
`m2_native_escrow_guard_r3_20260911` (no-side-effect refusal), and
`m2_native_db_r3_20260911` (successful native DB experiment).
The earlier 100-channel HTTP test measured 667.85 average /796 peak TPS with test
credits and on-chain checkpoints, not AIN escrow. Neither that result nor this DB
test completes native network settlement, unilateral dispute safety, or 7,000 TPS.
