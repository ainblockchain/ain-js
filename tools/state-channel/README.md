# Cooperative native-AIN escrow prerequisites

Experimental, development-chain only. This is not a production payment channel,
unilateral dispute protocol, or a 7,000 TPS result. Do not deposit valuable funds.
Both AIN account holders must cooperate to close; a missing participant can lock funds.

## Current failure and safety boundary — 2026-09-11

An opt-in version2 implementation is isolated-DB tested and now deployed on a
**separate** ten-validator development network, not the original ten validators.
It uses `nativeReleaseVersion:2` in `cooperativeEscrow()` and
`microUnitEscrowRelease(close)`, with the corresponding native flag and code. The
default/version1 policy and default legacy safety refusal remain unchanged; the
existing locked1AIN is not migrated or recovered. Native builds and remaining
gates are in the reproduction workspace's
`kpi/pr/ab-m1/tools/cert-kpi/native-escrow-micro-units.md`.

The explicit `ESCROW_NETWORK_PLAN` mode verifies the actual ten native images,
runtime/config/entrypoint hashes, activation and resource limits before funding.
See `kpi/pr/ab-m1/tools/cert-kpi/native-escrow-network.md` for fresh preparation,
the repaired existing configuration, source-image boundaries and exact commands.
It does not upgrade the original network or recover its locked1AIN.

The first funded v2 run found a harness error: RPC rule failure12103 was treated
as a final rejection, but its signed transaction stayed in the native pool and
paid after approvals. Exact-intent reconciliation proves both payouts in block520
while preserving `scenarioPassed:false`. The runner now waits for finalized
REVERTED receipts before later approvals, and audits unchanged state/independent
receipt/block inclusion. Admission-only failures are limited to native precheck
codes excluded from blocks. Unknown outcomes never trigger resubmission or reset.

`resume-unstarted-settlement.sh` is restricted to an already-funded/recovered
channel whose closing preflight failed **before any closing intent was signed**.
It preserves the original failed run, uses fresh audited source/protocol evidence,
locks against concurrent/live resumes, and never opens or funds another channel.
Partial/uncertain closing intents require exact-hash investigation instead.
See the separate-network guide for the actual same-channel resume command.

The real ten-node run `m2_native_escrow_live_20260911` funded 1 native development
AIN, completed twenty 3-micro-AIN co-signed transfers and duplicate deliveries,
and recovered its own Docker peer after SIGKILL and journal replay. **Settlement
failed.** Native `_release` computes `1 - 0.50006 = 0.49994000000000005`; the live
transfer rule requires at most six decimal places. The earlier genesis-only DB
experiment lacked that precision bandage and was not a valid settlement predictor.

The saved release transaction
`0x44a46ba16c8ddac56e665aa69b7a2cf42663d052eb8f6213d59fb1e7a63fe0da`
is finalized as **REVERTED** in block26320. Independent readers node5/node9 confirm
the same block, source/target balances9.5/9.5, escrow1, and absent release/payout
records. Approvals remain frozen; **the 1 AIN is still locked, not recovered**.
Do not replace the channel, reapprove different allocations, weaken rules, or
resend the failed intent. No production funds were used.

`nativeEscrowRelease()` refuses unrepresentable allocations without rounding them
into a different native transaction. The fixed twenty-transfer runner checks its
shared scenario before reading owner credentials, creating keys or funding, and
checks the actual closing state before approvals. This is a fail-closed guard,
not a native arithmetic fix or proof that other allocations settle safely. A
compatible native protocol/policy correction is still required; changing only
`_release` rounding would conflict with the already-frozen balance policy.

`inspect-escrow.js EXISTING_EVIDENCE NEW_OUTPUT.json` is read-only and requires no
keys. Run it with this SDK's dependencies and access to local RPC18086/18090;
mount only the existing public experiment evidence. It verifies the saved hash,
finalized REVERTED receipt, independent block inclusion and current balances.
It never submits, retries, resumes or claims fund recovery.

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
  -c 'npm test -- --runInBand __tests__/payment-channel.test.ts __tests__/cooperative-escrow.test.ts __tests__/escrow-precision.test.ts && node --test tools/state-channel/chain-readiness.test.js'
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

The default invocation retains the legacy precision-failure regression. With the
new native image explicitly selected as CHAIN_IMAGE during SDK build, pass a second
argument `micro-units` or `micro-units-fractional` to `run-native-db.sh` for the
version2 fixtures. Each runs27 operations/12 rollback rejections, including failure
after the first payout leg, followed by successful native payout and duplicate
rejection. Escrow balances are canonical micro-units; ordinary account balances
retain raw native arithmetic and are audited at1e-6AIN. These are not network-finalized
payments. The native flag is disabled by default outside the isolated fixture.

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

Historical genesis-only check: 1 AIN escrow, 20 co-signed transfers of 3 micro-AIN, final
allocations 499,940/500,060 micro-AIN; 24 native DB operations, including 11 negative
cases. Failed deposits (including a negative deposit), unauthorized withdrawal,
missing/mismatched approvals, policy replacement, owner-only function installation,
wrong ratio, and repeated release leave the entire DB proof unchanged.
This is isolated DB execution, **not network finality or a throughput measurement**.
Earlier missing account-injection configuration and evidence-directory permission
failures are retained in the reproduction evidence rather than counted as successes.

The current `run-native-db.sh` applies the native
`allow_up_to_6_decimal_transfer_value_only` bandage to its isolated fixture and
reproduces the precision rejection. Its23 operations include11 rejected operations
with unchanged whole-DB proofs. `pass:true` means this regression passed;
`settlementSuccessful:false` is explicit. Applying this one native bandage is not
a full replay of the live ledger or its other upgrades.

## Default legacy preflight and blocked rerun

From the reproduction workspace:

```bash
node kpi/pr/js-m2/tools/state-channel/chain-readiness.js observe \
  kpi/evidence/chain-readiness-NEW.json
RUN_ID=escrow_$(date -u +%Y%m%dT%H%M%SZ) \
  AIN_CHANNEL_IMAGE=ain-cert-channel-sdk:cooperative-local \
  bash kpi/pr/js-m2/tools/state-channel/run-escrow.sh \
  kpi/harness/genesis_accounts.json kpi/evidence/escrow-NEW kpi/secrets/escrow-NEW
```

The default legacy network runner was exercised but **failed settlement**. It
targets the local `ain-cert-docker` project at RPC18081–18090 and refuses missing or
enabled `ENABLE_TX_SIG_VERIF_WORKAROUND`, non-development gas settings, a wrong owner
or genesis, unhealthy consensus, or lack of block progress before creating keys or
submitting transactions. Docker `healthy`/node `SERVING` alone is insufficient.

Earlier on 2026-09-11 the existing ten containers enabled signature bypass; observed finalized
blocks stayed at 23086 and native consensus health was false where the read completed.
Some requests timed out; they are recorded as unavailable, not successful observations.
The guarded runner refused this environment before signing, funding, or creating keys.
Existing chain/model/trainer containers were not restarted or replaced.

At18:38 and18:42 UTC, both ten-node native-health/advancement checks passed after
independent chain repair, with signature bypass disabled. The funded run then
reached the precision failure. A healthy chain is necessary, not sufficient to
make this escrow policy safe. The current runner refuses its known-unsafe scenario;
do not bypass the guard to repeat funding.

The intended experiment
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

The actual failed live run and read-only REVERTED audit are in
`m2_native_escrow_live_20260911`; the corrected fixture, SDK tests and no-key/no-network
opening refusal are in `m2_native_precision_regression_20260911`,
`m2_precision_guard_tests_20260911` and `m2_precision_open_refusal_20260911`.
