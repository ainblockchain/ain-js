#!/usr/bin/env bash
set -euo pipefail
umask 077
output=${1:?Pass a NEW evidence directory}
private=${2:?Pass a NEW private key directory outside evidence}
image=${AIN_CHANNEL_IMAGE:?Set the source-built SDK image}
run_id=${RUN_ID:?Set a unique lowercase RUN_ID}
[[ "$run_id" =~ ^[a-z0-9_-]{1,60}$ ]] || exit 2
channels=${CHANNELS:-128}
workers=${WORKERS:-4}
duration=${DURATION_MS:-60000}
port=${CHANNEL_PORT:-22000}
cpu=${PEER_CPUS:-4}
shares=${PEER_CPU_SHARES:-32768}
parent=${PEER_CGROUP_PARENT:-}
if [[ -n "$parent" ]]; then
  [[ "$parent" =~ ^[a-z0-9]+\.slice$ && -d "/sys/fs/cgroup/$parent" ]] || { echo 'pass an existing dedicated top-level systemd slice'; exit 2; }
fi
[[ "$channels" =~ ^[0-9]+$ && "$port" =~ ^[0-9]+$ ]] || exit 2
[[ -z "$(ss -H -ltn "( sport >= :$port and sport < :$((port + channels)) )")" ]] || { echo 'experiment ports are occupied; do not replace those processes'; exit 1; }
[[ -z "$(ss -H -ltn "( sport >= :$((port + 1024)) and sport < :$((port + 1024 + workers)) )")" ]] || { echo 'batch ports are occupied'; exit 1; }
mkdir "$output" "$private"
output=$(realpath "$output")
private=$(realpath "$private")
case "$private/" in "$output/"*) exit 2;; esac
case "$output/" in "$private/"*) exit 2;; esac
image_id=$(docker image inspect "$image" --format '{{.Id}}')
printf '%s\n' "$image_id" > "$output/image-id.txt"
docker ps --format '{{.ID}} {{.Names}} {{.Status}}' > "$output/background-before.txt"
if [[ -n "$parent" ]]; then
  for setting in cpu.max cpu.weight memory.max memory.swap.max; do
    printf '%s=' "$setting" >> "$output/parent-cgroup.txt"
    cat "/sys/fs/cgroup/$parent/$setting" >> "$output/parent-cgroup.txt"
  done
  cat "/sys/fs/cgroup/$parent/cpu.stat" > "$output/parent-cpu-before.txt"
fi
source=$(cd "$(dirname "$0")" && pwd)
cp "$source/parallel-load.js" "$source/run-parallel-load.sh" "$output/"
sha256sum "$output/parallel-load.js" "$output/run-parallel-load.sh" > "$output/source.sha256"
server="ain-m2-parallel-$run_id-server"
client="ain-m2-parallel-$run_id-client"
audit="ain-m2-parallel-$run_id-audit"
containers=()
capture() {
  code=$?
  trap - EXIT
  for container in "${containers[@]}"; do
    docker logs "$container" > "$output/$container.log" 2>&1 || true
    docker inspect "$container" --format '{{json .State}}' > "$output/$container-state.json" || true
  done
  if [[ -n "$parent" && -d "/sys/fs/cgroup/$parent" ]]; then
    cat "/sys/fs/cgroup/$parent/cpu.stat" > "$output/parent-cpu-after.txt"
  fi
  printf '%s\n' "$code" > "$output/runner-exit.txt"
  exit "$code"
}
trap capture EXIT
base=(--runtime runc --cpus "$cpu" --cpu-shares "$shares" --cpuset-cpus 0-7
  --memory 4g --memory-swap 4g --pids-limit 512 --read-only --tmpfs /tmp:rw,size=256m
  --cap-drop ALL --security-opt no-new-privileges --user "$(id -u):$(id -g)"
  --env NVIDIA_VISIBLE_DEVICES=void --env "RUN_ID=$run_id" --env "CHANNELS=$channels"
  --env "WORKERS=$workers" --env "DURATION_MS=$duration" --env "CHANNEL_PORT=$port"
  --env "WARMUP_MS=${WARMUP_MS:-0}"
  --env "JOURNAL_BATCH=${JOURNAL_BATCH:-64}" --env "JOURNAL_DELAY_MS=${JOURNAL_DELAY_MS:-2}"
  --env "CHANNEL_TRANSPORT=${CHANNEL_TRANSPORT:-single}"
  --env "TRANSPORT_BATCH=${TRANSPORT_BATCH:-32}"
  --env "STATUS_URL=${STATUS_URL:-}" --env "STATUS_TOKEN=${STATUS_TOKEN:-}" --env "STATUS_NODE=${STATUS_NODE:-p2p-node}"
  --mount "type=bind,src=$output,dst=/evidence" --entrypoint node)
if [[ -n "$parent" ]]; then base+=(--cgroup-parent "$parent"); fi
docker run --rm --network none "${base[@]}" --mount "type=bind,src=$private,dst=/private" "$image_id" tools/state-channel/parallel-load.js init
docker create --name "$server" --network host "${base[@]}" --mount "type=bind,src=$private/server,dst=/private,readonly" "$image_id" tools/state-channel/parallel-load.js server > "$output/server-id.txt"
containers+=("$server")
docker start "$server" >/dev/null
ready=false
for attempt in {1..60}; do
  [[ "$(docker inspect "$server" --format '{{.State.Running}}')" == true ]] || { echo 'server exited; inspect retained state'; exit 1; }
  if [[ -f "$output/server-ready.json" ]]; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { echo 'server readiness observation expired; inspect this same container'; exit 1; }
docker create --name "$client" --network host "${base[@]}" --mount "type=bind,src=$private/client,dst=/private,readonly" "$image_id" tools/state-channel/parallel-load.js client > "$output/client-id.txt"
containers+=("$client")
for container in "$server" "$client"; do
  docker inspect "$container" --format '{{json .HostConfig}}' > "$output/$container-limits.json"
done
docker start -a "$client" > "$output/client.log" 2>&1
[[ "$(docker inspect "$client" --format '{{.State.Running}}')" == false ]] || { echo 'client is still running; do not start another load'; exit 1; }
[[ "$(docker inspect "$client" --format '{{.State.ExitCode}}')" == 0 ]] || { cat "$output/client.log"; exit 1; }
docker exec "$server" node -e 'const fs=require("fs");console.log(JSON.stringify(Object.fromEntries(["cpu.stat","memory.current"].map(name=>[name,fs.readFileSync("/sys/fs/cgroup/"+name,"utf8")]))))' > "$output/server-resources-after.json"
docker kill --signal KILL "$server" > "$output/post-drain-crash.txt"
docker create --name "$audit" --network none "${base[@]}" "$image_id" tools/state-channel/parallel-load.js audit > "$output/audit-id.txt"
containers+=("$audit")
docker start -a "$audit" > "$output/audit.log" 2>&1
[[ "$(docker inspect "$audit" --format '{{.State.ExitCode}}')" == 0 ]]
cat "$output/client.log" "$output/audit.log"
echo 'Unfunded capacity diagnostic completed; this does not certify settlement or the full M2 KPI.'
