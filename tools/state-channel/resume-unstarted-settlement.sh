#!/usr/bin/env bash
set -euo pipefail
umask 077
fixtures=$(realpath "${1:?Pass the SAME private genesis_accounts.json}")
out=$(realpath "${2:?Pass the EXISTING funded evidence directory}")
private=$(realpath "${3:?Pass the SAME funded private directory}")
image=${AIN_CHANNEL_IMAGE:?Set the original SDK dependency image}
root=$(cd "$(dirname "$0")/../.." && pwd)
exec 9>"$out/settlement-resume.lock"
flock --nonblock 9 || { echo 'Another settlement resume holds this channel lock' >&2; exit 1; }
for identity in "$out"/resume-*/container-id.txt; do
  [[ -e "$identity" ]] || continue
  test "$(docker inspect "$(cat "$identity")" --format '{{.State.Running}}')" = false
done
test "$(docker image inspect "$image" --format '{{.Id}}')" = "$(cat "$out/image-id.txt")"
node - "$out" <<'NODE'
const fs = require('fs');
const assert = require('assert/strict');
const out = process.argv[2];
assert.ok(fs.existsSync(`${out}/prepared.json`) && fs.existsSync(`${out}/funded.json`));
assert.equal(JSON.parse(fs.readFileSync(`${out}/recovery-result.json`)).pass, true);
assert.ok(!fs.existsSync(`${out}/settled.json`) && !fs.existsSync(`${out}/settlement-audit.json`));
for (const name of fs.readdirSync(`${out}/operations`).filter(name => name.endsWith('-intent.json'))) {
  const intent = JSON.parse(fs.readFileSync(`${out}/operations/${name}`));
  assert.ok(!intent.label.startsWith('reject-') && !intent.label.startsWith('approve-') && intent.label !== 'cooperative-release', 'partial settlement requires exact-intent investigation, not this resume command');
}
assert.equal(JSON.parse(fs.readFileSync(`${out}/network-plan.json`)).nativeReleaseVersion, 2);
NODE
stamp=$(date -u +%Y%m%d%H%M%S)
resume="resume-$stamp"
mkdir "$out/$resume" "$out/$resume/source"
cp "$root/tools/state-channel/"{escrow-chain,escrow-scenario,escrow-network,chain-readiness,transaction-finality,inspect-settlement}.js "$out/$resume/source/"
cp "$root/tools/state-channel/resume-unstarted-settlement.sh" "$out/$resume/source/"
(cd "$out/$resume/source" && sha256sum *) > "$out/$resume/source.sha256"
node "$out/$resume/source/escrow-network.js" "$out/$resume-protocol.json" "$out/network-plan.json" > "$out/$resume/protocol.log" 2>&1
run_id=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).runId)' "$out/prepared.json")
[[ "$run_id" =~ ^[A-Za-z0-9_-]{1,100}$ ]] || exit 1
base=(--runtime runc --network host --cpus 1 --cpuset-cpus 0-7 --memory 2g --memory-swap 2g --pids-limit 128
  --read-only --tmpfs /tmp:rw,size=128m --cap-drop ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)"
  -e NVIDIA_VISIBLE_DEVICES=void -e "RUN_ID=$run_id" -e ESCROW_NETWORK_PLAN=/evidence/network-plan.json
  --mount "type=bind,src=$out,dst=/evidence"
  --mount "type=bind,src=$out/$resume/source,dst=/opt/ain-js/tools/state-channel,readonly" --entrypoint node)
container="ain-escrow-$run_id-$resume"
docker create --name "$container" "${base[@]}" -e "ESCROW_PROTOCOL_AUDIT=$resume-protocol.json" \
  --mount "type=bind,src=$private,dst=/private,readonly" \
  --mount "type=bind,src=$fixtures,dst=/fixtures/genesis_accounts.json,readonly" \
  "$image" /opt/ain-js/tools/state-channel/escrow-chain.js settle > "$out/$resume/container-id.txt"
docker inspect "$container" --format '{{json .HostConfig}}' > "$out/$resume/limits.json"
set +e
docker start -a "$container" > "$out/$resume/settle.log" 2>&1
status=$?
set -e
printf '%s\n' "$status" > "$out/$resume/exit-code.txt"
docker inspect "$container" --format '{{json .State}}' > "$out/$resume/state.json"
[[ "$status" = 0 ]] || { echo 'Resume stopped; original channel and all signed intents retained' >&2; exit "$status"; }
audit="$container-audit"
docker create --name "$audit" "${base[@]}" "$image" /opt/ain-js/tools/state-channel/inspect-settlement.js \
  /evidence /evidence/settlement-audit.json > "$out/$resume/audit-container-id.txt"
docker inspect "$audit" --format '{{json .HostConfig}}' > "$out/$resume/audit-limits.json"
docker start -a "$audit" > "$out/$resume/audit.log" 2>&1
peer=$(cat "$out/peer-container-id.txt")
test "$(docker inspect "$peer" --format '{{.Name}}')" = "/ain-cert-escrow-$run_id-peer"
docker stop -t 20 "$peer" > "$out/$resume/peer-completed-stop.log"
echo "Same funded channel closed and independently audited: $out"
