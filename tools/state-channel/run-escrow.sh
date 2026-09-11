#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd "$(dirname "$0")/../.." && pwd)
fixtures=$(realpath "${1:?Pass the local development-chain genesis_accounts.json}")
out=${2:?Pass a new evidence directory}
private=${3:?Pass a new private directory outside evidence}
image=${AIN_CHANNEL_IMAGE:?Set the source-built SDK image with dependency patches applied}
RUN_ID=${RUN_ID:-m2_escrow_$(date -u +%Y%m%dT%H%M%SZ)}
[[ "$RUN_ID" =~ ^[A-Za-z0-9_-]{1,100}$ ]] || exit 1
[[ -z "$(ss -H -ltn 'sport = :19041')" ]] || { echo 'Port19041 is already used; do not replace its process' >&2; exit 1; }
mkdir "$out"
mkdir "$private"
out=$(realpath "$out")
private=$(realpath "$private")
case "$private/" in "$out/"*) echo 'Private state cannot be inside evidence' >&2; exit 1;; esac
case "$out/" in "$private/"*) echo 'Evidence cannot be inside private state' >&2; exit 1;; esac
mkdir "$out/source"
cp "$root/tools/state-channel/escrow-chain.js" "$root/tools/state-channel/escrow-peer.js" "$root/tools/state-channel/run-escrow.sh" "$root/tools/state-channel/chain-readiness.js" "$out/source/"
(cd "$out/source" && sha256sum *) > "$out/source.sha256"
git -C "$root" rev-parse HEAD > "$out/base-commit.txt"
docker image inspect "$image" --format '{{.Id}}' > "$out/image-id.txt"
node "$out/source/chain-readiness.js" inspect "$out/chain-runtime.json"
docker inspect $(docker ps -q --filter label=com.docker.compose.project=ain-cert-docker) \
  --format '{"name":{{json .Name}},"id":{{json .Id}},"image":{{json .Image}},"state":{{json .State}},"limits":{{json .HostConfig}}}' > "$out/chain-containers.jsonl"
base=(--runtime runc --network host --cpus 1 --cpuset-cpus 0-7 --memory 2g --memory-swap 2g --pids-limit 128
  --read-only --tmpfs /tmp:rw,size=128m --cap-drop ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)"
  --env NVIDIA_VISIBLE_DEVICES=void --env "RUN_ID=$RUN_ID" --entrypoint node
  --mount "type=bind,src=$out,dst=/evidence"
  --mount "type=bind,src=$out/source,dst=/opt/ain-js/tools/state-channel,readonly")
containers=()
record_states() {
  result=$?
  trap - EXIT
  for container in "${containers[@]}"; do
    docker logs "$container" > "$out/$container.log" 2>&1 || true
    docker inspect "$container" --format '{{json .State}}' > "$out/$container-state.json" 2>/dev/null || true
  done
  printf '%s\n' "$result" > "$out/exit-code.txt"
  if [ "$result" != 0 ]; then echo 'Failure retained; inspect this run and its signed intents before resuming. Existing chain/model containers are untouched.' >&2; fi
  exit "$result"
}
trap record_states EXIT
run_chain() {
  phase=$1
  container="ain-cert-escrow-$RUN_ID-$phase"
  docker create --name "$container" "${base[@]}" --mount "type=bind,src=$private,dst=/private" \
    --mount "type=bind,src=$fixtures,dst=/fixtures/genesis_accounts.json,readonly" \
    "$image" /opt/ain-js/tools/state-channel/escrow-chain.js "$phase" > "$out/$phase-container-id.txt"
  containers+=("$container")
  docker inspect "$container" --format '{{json .HostConfig}}' > "$out/$phase-limits.json"
  docker start -a "$container" > "$out/$phase.log" 2>&1
}
run_chain open
peer="ain-cert-escrow-$RUN_ID-peer"
docker create --name "$peer" "${base[@]}" --mount "type=bind,src=$private/target.pem,dst=/private/key.pem,readonly" \
  "$image" /opt/ain-js/tools/state-channel/escrow-peer.js server > "$out/peer-container-id.txt"
containers+=("$peer")
docker inspect "$peer" --format '{{json .HostConfig}}' > "$out/peer-limits.json"
docker start "$peer" >/dev/null
client="ain-cert-escrow-$RUN_ID-client"
docker create --name "$client" "${base[@]}" --mount "type=bind,src=$private/source.pem,dst=/private/key.pem,readonly" \
  "$image" /opt/ain-js/tools/state-channel/escrow-peer.js client > "$out/client-container-id.txt"
containers+=("$client")
docker inspect "$client" --format '{{json .HostConfig}}' > "$out/client-limits.json"
docker start -a "$client" > "$out/client.log" 2>&1
docker kill --signal KILL "$peer" > "$out/crash.log"
docker inspect "$peer" --format '{{json .State}}' > "$out/peer-crashed.json"
docker start "$peer" > "$out/restart.log"
recovery="ain-cert-escrow-$RUN_ID-recovery"
docker create --name "$recovery" "${base[@]}" "$image" /opt/ain-js/tools/state-channel/escrow-peer.js recover > "$out/recovery-container-id.txt"
containers+=("$recovery")
docker inspect "$recovery" --format '{{json .HostConfig}}' > "$out/recovery-limits.json"
docker start -a "$recovery" > "$out/recovery.log" 2>&1
run_chain settle
docker stop -t 20 "$peer" >/dev/null
echo "Native cooperative escrow and peer recovery verified: $out; 7000TPS and unilateral disputes remain separate gates."
