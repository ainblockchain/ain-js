# State Channel 7,000 TPS 재현 가이드

이 문서는 `ain-js`의 병렬 State Channel 성능·복구 시험을 새 Docker 실행으로 재현하는 절차서다. 거래를 batch 개수로 세지 않고, **각 갱신의 양측 Ed25519 서명과 양측 durable journal fsync가 끝난 peer ACK**만 TPS에 포함한다.

## 1. 범위와 판정

- 목표: 60초 측정 구간의 평균 TPS `>= 7,000`, 모든 1초 구간 `>= 7,000`, 오류 `0`.
- 안정성: 수신 peer를 의도적으로 `SIGKILL`한 뒤 키 없는 독립 audit container가 양측 journal을 재생하고 서명·순번·잔액·최종 상태를 일치시킨다.
- 권장 반복: 동일 조건으로 고유 `RUN_ID`를 사용해 최소 3회 실행한다. 낮은 결과와 실패 결과도 삭제하지 않는다.
- 이 시험은 실제 Docker peer 간 off-chain State Channel 용량 시험이다. 온체인 escrow 예치·정산은 별도 시험이며 이 결과와 합산하지 않는다.

## 2. 사전 조건

호스트에는 Docker, `runc`, cgroup v2, Node.js, `systemd-run`, `ss`가 있어야 한다. 아래 명령은 저장소 루트(`/mnt/newdata/gov/kpi/pr/js-m2`)에서 실행한다.

```bash
cd /mnt/newdata/gov/kpi/pr/js-m2
git checkout year3/m2-state-channel-sdk
git pull --ff-only
node --version
docker version
test -f tools/state-channel/run-parallel-load.sh
test -f tools/state-channel/parallel-load.js
```

최종 재현 소스 커밋은 `a9ddcbb4f881c2bb1c5a24d1a75c97e39830ed36`다. 이미지를 사용할 수 있으면 다음 immutable image를 확인한다.

```bash
IMAGE=ain-cert-channel-sdk:parallel-batch-r8-20260912
docker image inspect "$IMAGE" --format '{{.Id}}'
# expected: sha256:d24d1a0712c00b9b81be10c3e7120c9a08bb9669c85aacfaee29554aaadfe488
```

이미지가 없으면 로컬 의존성 image를 명시해 새 image를 빌드한다. registry pull이나 기존 실행 container 변경에 의존하지 않는다.

```bash
docker build --network none \
  -f tools/state-channel/refresh-sdk.Dockerfile \
  --build-arg BASE_IMAGE=ain-cert-channel-sdk:repro-20260911 \
  -t ain-cert-channel-sdk:local-7000-tps-$(date -u +%Y%m%d) .
IMAGE=ain-cert-channel-sdk:local-7000-tps-$(date -u +%Y%m%d)
```

## 3. 시험 전용 자원 그룹

기존 chain/model/trainer container와 기존 cgroup은 수정하지 않는다. 매번 새 top-level slice를 만들고, 이 시험의 두 peer와 audit만 그 안에서 실행한다.

```bash
slice=ainkpi$(date -u +%Y%m%d%H%M%S).slice
keeper=${slice%.slice}keeper
test ! -d "/sys/fs/cgroup/$slice"
sudo systemd-run --unit="$keeper" --slice="$slice" \
  --property=RuntimeMaxSec=1800 /bin/sleep 1800
sudo systemctl set-property --runtime "$slice" \
  CPUWeight=1000 CPUQuota=600% MemoryMax=8G MemorySwapMax=0 TasksMax=1024
```

각 peer는 CPU 4개 상한, `cpuset 0-7`, RAM 4 GiB, swap 0, pids 512를 사용한다. 상위 slice는 CPU 합산 6개와 RAM 8 GiB를 제한한다. 이 수치는 AWS 320 vCPU 등가 성능을 뜻하지 않는다.

## 4. 1회 실행

`evidence`는 공개 가능한 실행 로그를 저장하고, `private`는 서명키를 저장하므로 서로 다른 경로를 사용한다. 두 디렉터리는 새 경로여야 한다.

```bash
RUN_ID=m2_parallel_repro_$(date -u +%Y%m%d%H%M%S)
OUT=/mnt/newdata/gov/kpi/evidence/$RUN_ID
PRIVATE=/mnt/newdata/gov/kpi/secrets/$RUN_ID
RUNNER=$(mktemp -d)
cp tools/state-channel/{run-parallel-load.sh,parallel-load.js} "$RUNNER/"

RUN_ID="$RUN_ID" AIN_CHANNEL_IMAGE="$IMAGE" \
CHANNELS=512 WORKERS=8 WARMUP_MS=30000 DURATION_MS=60000 \
CHANNEL_TRANSPORT=batch TRANSPORT_BATCH=16 \
JOURNAL_BATCH=64 JOURNAL_DELAY_MS=1 \
PEER_CPUS=4 PEER_CPU_SHARES=131072 \
PEER_CGROUP_PARENT="$slice" \
bash "$RUNNER/run-parallel-load.sh" "$OUT" "$PRIVATE"
```

정상 실행 후 wrapper는 의도적으로 수신 peer를 `SIGKILL`하고 audit을 수행한다. audit이 끝난 뒤 시험 container가 남아 있지 않은지 확인한다.

```bash
docker ps --format '{{.Names}}' | grep "$RUN_ID" || true
cat "$OUT/runner-exit.txt"
```

## 5. 결과 판정

`summary.json`의 측정 구간만 판정에 사용한다. warmup과 drain은 journal 재생에는 포함하지만 TPS에는 포함하지 않는다.

```bash
node - "$OUT/summary.json" "$OUT/journal-audit.json" <<'NODE'
const fs = require('fs');
const summary = JSON.parse(fs.readFileSync(process.argv[2]));
const audit = JSON.parse(fs.readFileSync(process.argv[3]));
const min = Math.min(...summary.counts);
const pass = summary.averageTPS >= 7000 && min >= 7000 &&
  summary.errors.length === 0 && summary.statesAgree === true &&
  audit.pass === true;
console.log(JSON.stringify({
  runId: summary.runId,
  averageTPS: summary.averageTPS,
  peakTPS: summary.peakTPS,
  minimumOneSecondTPS: min,
  p50ms: summary.p50ms,
  p99ms: summary.p99ms,
  acknowledged: summary.acknowledged,
  journalAudit: audit.pass,
  pass
}, null, 2));
process.exitCode = pass ? 0 : 1;
NODE
```

기준을 충족한 최종 예시는 다음과 같다.

| 항목 | r9 결과 |
|---|---:|
| 평균 TPS | `10,521.08` |
| 1초 peak | `11,818` |
| 1초 최저 | `8,864` |
| P50 / P99 | `46 ms / 106 ms` |
| 양측 journal 재생 | `919,760건`, `pass=true` |
| 오류 / runner exit | `0 / 0` |

## 6. 반복·정리

동일한 자원과 설정으로 `RUN_ID`, `OUT`, `PRIVATE`만 새로 만들어 3회 이상 반복한다. 기존 결과를 덮어쓰지 않는다.

```bash
# 각 회차마다 위 4절의 RUN_ID/OUT/PRIVATE를 새로 생성해 실행
find /mnt/newdata/gov/kpi/evidence -maxdepth 1 -type d \
  -name 'm2_parallel_repro_*' -print

# 해당 RUN_ID의 container가 모두 종료된 뒤에만 자체 slice를 정리
sudo systemctl stop "$keeper" || true
sudo systemctl stop "$slice" || true
```

공개 게시 시 `private` 디렉터리와 개인키는 제외한다. 공개 journal·summary·audit만 별도 압축하고 SHA-256을 기록한다.

## 7. 재현 자료

- 실행 wrapper: `tools/state-channel/run-parallel-load.sh`
- 부하·audit 구현: `tools/state-channel/parallel-load.js`
- 결과 설명: `tools/state-channel/parallel-load-results-20260912.md`
- 공개 증빙: GitHub prerelease `state-channel-parallel-20260912`
