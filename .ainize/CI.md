# CI runs on Ainize, not GitHub Actions

ain-js's test pipeline has moved off GitHub Actions to an **Ainize Run** (`kind: script`).

- Project: `comcom/ain-js-ci` (Ainize)
- What it does: clones ain-js, installs it, runs the unit test suites, reports PASS/FAIL.
- Triggers: nightly schedule + an `http` webhook (call it from a PR check if per-PR
  gating is wanted — see below).

The removed workflows (`pr_test.yml`, `pr_test_when_merged.yml`) ran the test pipeline
per PR on `master`/`develop`. The Ainize Run currently runs nightly and on webhook, so
**merging this PR drops automatic per-PR test gating** unless the webhook is wired to PR
events. Decide which the team wants:

1. Nightly + manual webhook (as-is after this PR), or
2. Keep per-PR gating by having a PR status call the Run's webhook.

No GitHub Actions going forward — CI/CD is on Ainize. See
https://ainize.ai/docs/en/how-to/ci-cd (ko: https://ainize.ai/docs/ko/how-to/ci-cd).
