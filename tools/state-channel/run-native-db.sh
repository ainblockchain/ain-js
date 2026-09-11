#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd "$(dirname "$0")/../.." && pwd)
out=${1:?Pass a new evidence directory}
mode=${2:-legacy}
[[ "$mode" == legacy || "$mode" == micro-units || "$mode" == micro-units-fractional ]] || exit 2
mode_args=()
if [[ "$mode" != legacy ]]; then mode_args+=("$mode"); fi
image=${AIN_CHANNEL_IMAGE:?Set the source-built SDK image with native blockchain test dependencies}
RUN_ID=${RUN_ID:-native_db_$(date -u +%Y%m%dT%H%M%SZ)}
[[ "$RUN_ID" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
mkdir "$out"
out=$(realpath "$out")
printf '%s\n' "$mode" > "$out/mode.txt"
cp "$root/tools/state-channel/native-db-check.js" "$root/tools/state-channel/run-native-db.sh" "$out/"
(cd "$out" && sha256sum native-db-check.js run-native-db.sh) > "$out/source.sha256"
docker image inspect "$image" --format '{{.Id}}' > "$out/image-id.txt"
container="ain-cert-native-db-$RUN_ID"
docker create --name "$container" --runtime runc --network none --cpus 2 --cpuset-cpus 0-7 \
  --memory 4g --memory-swap 4g --pids-limit 256 --read-only --tmpfs /tmp:rw,size=256m \
  --user "$(id -u):$(id -g)" --cap-drop ALL --security-opt no-new-privileges \
  --env NVIDIA_VISIBLE_DEVICES=void --env BLOCKCHAIN_DATA_DIR=/tmp/chain \
  --env ACCOUNT_INJECTION_OPTION=private_key --env ENABLE_TX_SIG_VERIF_WORKAROUND=false \
  --env ENABLE_GAS_FEE_WORKAROUND=true --env CONSOLE_LOG=false \
  --mount "type=bind,src=$out/native-db-check.js,dst=/opt/ain-js/tools/state-channel/native-db-check.js,readonly" \
  --mount "type=bind,src=$out,dst=/evidence" \
  "$image" /opt/ain-js/tools/state-channel/native-db-check.js "${mode_args[@]}" > "$out/container-id.txt"
docker inspect "$container" --format '{{json .HostConfig}}' > "$out/limits.json"
result=0
docker start -a "$container" > "$out/test.log" 2>&1 || result=$?
docker inspect "$container" --format '{{json .State}}' > "$out/state.json"
printf '%s\n' "$result" > "$out/exit-code.txt"
cat "$out/test.log"
exit "$result"
