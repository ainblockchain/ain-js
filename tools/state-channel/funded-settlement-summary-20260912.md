# Funded escrow evidence — 2026-09-12

This is a separate funded correctness and recovery gate. It is not claimed as settlement of the high-throughput state-channel load.

- Network: isolated native 10-node network, RPC ports `23181–23190`.
- Funding: source and target each deposited `0.5 AIN` into escrow.
- Transfers: `20` co-signed transfers of `3 micro-AIN`.
- Recovery: peer was terminated with `SIGKILL`; journal recovery completed.
- Safety checks: invalid approvals, inflation, foreign approval, policy replacement, native installation, allocation, and duplicate release were rejected.
- Settlement: cooperative release finalized at block `482`; duplicate release was rejected.
- Independent audit: `pass=true`, `scenarioPassed=true`.
- Final balances: source `9.99994 AIN`, target `10.00006 AIN`, escrow `0`.

Source evidence is retained under `kpi/evidence/native_escrow_funded_fresh2_r3_20260912/`. The public release asset is a sanitized copy of `settlement-audit.json`; private keys and runtime secrets are excluded.
