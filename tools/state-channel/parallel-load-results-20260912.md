# State Channel 7,000 TPS 용량 시험 — 2026-09-12

## 판정 범위

**양측 서명·양측 fsync를 완료한 독립 상태 채널 갱신의 처리량은 7,000 TPS를 넘었다. 별도 실제 AIN 예치·협력 정산·peer 복구 회차도 통과했지만, 고처리량 부하 자체의 온체인 자금 정산까지 결합한 전체 M2 인증 합격은 아니다.**

이번 고처리량 영수증 전체를 실제 AIN 예치·지급과 연결한 시험, 원격 호스트 간 네트워크, 장애 도중 자금 보전, 일방 분쟁·기한 종료는 미완료다. 별도 소규모 native escrow는 새 10노드 망에서 독립적으로 성공했으며 이번 부하 전체의 정산으로 재사용하지 않는다.

## 적용한 구현

- `PaymentChannel`: 불변 키 객체의 참가자 소유권 검사 캐시와 정확히 일치하는 자체 생성 서명 재사용. 외부 서명·도메인·순서·정수 잔액·이전 해시 검사는 유지한다.
- `batch-peer`: 같은 채널은 직렬화하고 독립 채널만 HTTP batch로 전송한다. 각 전송마다 실제 양측 Ed25519 서명이 있다. batch 개수나 중복 요청을 거래 개수로 세지 않는다.
- `GroupCommitJournal`: 모든 영수증을 기록하고 여러 채널 쓰기가 한 fsync를 공유한다. fsync 전 ACK 금지, 부분 write 처리, 오류 시 안전 거부, checksum 프레임과 독립 재생을 제공한다.
- `parallel-load`: 송신/수신 각8worker, 채널별 in-flight1개. 수신 fsync → receipt 전송 → 송신 검증/fsync 완료 시각으로 TPS를 센다. 공통 단조 시계의 사전 지정 구간을 사용한다.

공식 자료와 대안 비교는 [기술 조사](7000-tps-web-research-20260912.md)를 따른다. 새 L1 합의나 rollup으로 KPI 종류를 바꾸지 않았다.

## 탐색 회차 전부

evidence 경로는 재현 워크스페이스의 `kpi/evidence/<run-id>/`이다.

| run-id 끝부분 | 구간 | 채널/worker | 평균 TPS | 1초 최대 TPS | 판정 |
|---|---|---|---:|---:|---|
| `m2_parallel_group_r1_20260912` | 30초, 준비0초 | 128/4 | 2,403.80 | 3,403 | 양측72,242건 재생 통과, 목표 미달 |
| `m2_parallel_batch_r2_20260912` | 30초, 준비0초 | 256/8 | 4,691.23 | 6,620 | 양측140,993건 재생 통과, 목표 미달 |
| `m2_parallel_batch_r3_20260912` | 60초, 준비0초 | 256/8 | 5,228.27 | 6,458 | 양측313,952건 재생 통과, wrapper exit127 별도 보존 |
| `m2_parallel_batch_r4_20260912` | 60초, 준비0초 | 512/8 | 6,141.87 | 8,636 | 양측369,024건 재생 통과; 평균 목표 미달 |
| `m2_parallel_batch_r5_20260912` | 60초, 준비0초 | 1024/4 | 5,395.73 | 6,720 | 양측324,768건 재생 통과, 목표 미달 |
| `m2_parallel_batch_r6_20260912` | 60초, 사전 지정 준비30초 | 512/8 | 10,419.98 | 11,756 | 양측922,736건 재생 통과, 평균/최대 용량 기준 달성 |
| `m2_parallel_batch_r7_20260912` | 60초, 사전 지정 준비30초 | 512/8 | 10,547.30 | 12,000 | 양측932,672건 재생 통과, 평균/최대 용량 기준 달성 |
| `m2_parallel_batch_r8_20260912` | 60초, 사전 지정 준비30초 | 512/8 | 10,235.98 | 11,452 | 양측901,568건 재생 통과, 평균/최대 용량 기준 달성 |
| `m2_parallel_batch_r9_20260912` | 60초, 사전 지정 준비30초 | 512/8 | 10,521.08 | 11,818 | 크기 제한 보강 소스; 양측919,760건 재생 통과 |

r3은 실행 중 shell 원본을 편집하여 마지막 출력 명령의 읽기 위치가 바뀌었다. 실제 client와 독립 audit container는 각각 exit0이지만 wrapper exit127을 성공으로 고치지 않았다. 원본 로그와 `runner-incident.json`을 보존했다. 이후 실행은 별도 고정 runner 사본을 사용한다. 최초 r7 테스트 시작 시에는 빌드 이미지가 아직 없어 Docker가 거부했다. 실패 로그를 보존하고 빌드 완료 후 별도 실행한 실제 테스트 결과만 사용한다.

## 최초 60초 목표 달성: r6

- 측정 구간625,199건 /60초 = **10,419.9833 TPS**.
- 1초 구간60개 모두7,000 이상: 최저9,024, 최고11,756 TPS.
- 측정 완료 영수증의 P50=47ms, P99=110ms, 전송 오류0, 양측 상태 일치. 지연은1ms histogram 버킷의 하한으로 표시한다.
- 준비 구간297,025건, 측정625,199건, drain512건 = 전체922,736건. 준비 구간까지 포함한90초 처리량도10,246.93 TPS이며 drain은 제외한다.
- 수신 프로세스 강제 종료 후 키 없는 별도 audit container에서 양측 전체 journal을 재생했다. 각 갱신의 양쪽 서명·도메인·순서·잔액을 다시 검증하고 최종 상태를 대조했다. `journal-audit.json` pass=true, runner/client/audit exit0; 수신 exit137은 의도한 SIGKILL이다.

이는 **완료 후 프로세스 장애/디스크 재생** 시험이지, 전원 차단 또는 진행 중 모든 장애 시나리오의 합격이 아니다.

동일 조건 r6/r7/r8의60초 평균은 각각10,419.98 /10,547.30 /10,235.98 TPS다. 총180개의1초 구간이 모두7,000 이상이고 최저 구간은8,917 TPS다. 오류0이며 준비·측정·drain 전체2,756,976건을 양측 journal에서 독립 재생했다. 전체 재생 건수를 측정 TPS의 분자로 사용하지 않는다.

최종 크기 경계 보강 소스의 r9도 평균10,521.08·최대11,818·최저8,864 TPS, P50=46/P99=106ms, 오류0이다. 측정631,265건, 준비287,983건, drain512건을 합한919,760건 모두 양측 journal 재생에 통과했다. r6–r9 합계3,676,736개의 고유 전송을 재검증했으며240개 측정1초 구간 모두7,000 이상이다.

### 실제 예치·정산 보조 게이트

`native_escrow_funded_fresh2_r3_20260912`에서 RPC23181–23190의 격리 10노드 망에 실제 0.5+0.5 AIN을 예치하고, 3 micro-AIN 공동서명 전송 20건, peer SIGKILL 뒤 journal 복구, 잘못된 승인·인플레이션·중복 release 거부를 검증했다. block482에서 cooperative release가 FINALIZED 되었고, 독립 settlement audit가 `pass=true`, `scenarioPassed=true`를 기록했다. 최종 잔액은 source 9.99994, target 10.00006, escrow 0이다. 이 회차는 실제 자금·복구·정산 통과 증빙이지만 7,000 TPS 부하와 결합한 정산은 아니다.

## 자원 조건과 비교의 한계

호스트는 공유8vCPU·약755GiB RAM이며, 본 시험은 GPU를 사용하지 않는다. 컨테이너에32 CPU quota를 지정하는 것과 실제32개 코어를 할당하는 것은 다르다. AWS320 vCPU와 같다고 환산하지 않는다.

모든 새 peer는 runc·cpuset0–7·CPU4 상한·RAM4GiB·memory+swap4GiB·pids512·읽기 전용root·tmpfs256MiB·cap-drop ALL·no-new-privileges이다. 각 peer의 CPU shares는131072다. 통신은 서로 다른 두 Docker 프로세스 사이의 loopback HTTP이고 audit은 network none이다.

r6부터 새 상위 `ainkpi20260912.slice`에 **CPU 합산6개 상한, RAM8GiB, 추가 swap0, weight1000, TasksMax1024**를 설정했다. 이 그룹에 새 시험 컨테이너만 넣었다. 기존 chain/model/trainer를 정지하거나 기존 slice 속성을 변경하지 않았다. 상위 CPU 경쟁을 조정한 결과이므로 baseline 대비 배율을 코드만의 개선이라고 주장하지 않는다. r1/r2는 CPU shares32768이고 r3 이후131072다. r6/r7의 프로토콜3파일과 `parallel-load.js` 소스 SHA-256은 동일하다.

## 재현

`PAYMENT_CHANNEL.md`의 이미지 빌드 절차를 따른다. 사용한 기본 SDK image는 `sha256:59fb934608c4d70604d1df941f11ea2c35cbe5f96d83f318e3e79e68376cf3df`, native image는 `sha256:90c46c1e44cb734b915c678b786a2964324b8e47b8e50cfa3e35dd5b5807c747`이다. 반복 r7/r8 image는 `sha256:9754e72f1a70498a9e2734a6f70c5bce90e2839ce8e5da406808b35c068fa8c5`, 최종 r9 image는 `sha256:d24d1a0712c00b9b81be10c3e7120c9a08bb9669c85aacfaee29554aaadfe488`다. 이미지들은 로컬 빌드이며 공개 Docker registry 게시를 뜻하지 않는다.

systemd cgroup v2를 사용하는 관리 가능한 시험 호스트에서 **새 이름**의 전용 그룹을 만든다. 이미 있는 그룹의 속성을 덮어쓰지 않는다.

```bash
slice=ainkpi$(date -u +%Y%m%d%H%M%S).slice
keeper=${slice%.slice}keeper
test ! -d "/sys/fs/cgroup/$slice"
sudo systemd-run --unit="$keeper" --slice="$slice" --property=RuntimeMaxSec=1800 /bin/sleep 1800
sudo systemctl set-property --runtime "$slice" CPUWeight=1000 CPUQuota=600% MemoryMax=8G MemorySwapMax=0 TasksMax=1024
runner=$(mktemp -d)
cp tools/state-channel/{run-parallel-load.sh,parallel-load.js} "$runner/"
RUN_ID=unique_new_run AIN_CHANNEL_IMAGE=source-built-image \
CHANNELS=512 WORKERS=8 WARMUP_MS=30000 DURATION_MS=60000 \
CHANNEL_TRANSPORT=batch TRANSPORT_BATCH=16 JOURNAL_DELAY_MS=1 \
PEER_CPUS=4 PEER_CPU_SHARES=131072 PEER_CGROUP_PARENT="$slice" \
bash "$runner/run-parallel-load.sh" /new/evidence /new/private
```

3회 반복은 RUN_ID와 evidence/private 경로를 매번 새로 지정하고, 이전 audit이 끝난 뒤 같은 조건으로 진행한다. 결과가 낮은 회차도 삭제하지 않는다. 모든 해당 시험 컨테이너가 종료됐음을 확인한 뒤에만 자체 keeper와 빈 slice를 정지한다. 사전 생성한 상위 그룹의 부모 제한도 반드시 기록한다. 영수증 원본·실패 로그는 유지하고 private 디렉터리를 공개하지 않는다.

실제 종료 시 시험 전용 slice의 실행 중 Docker container0개를 확인하고 자체 keeper/빈 slice를 정지하여 runtime 속성을 정리했다. 기존41개 실행 컨테이너의 ID가 모두 유지됐고 기존 system.slice/user.slice weight는100이다. 이것은 컨테이너 보존 확인이지, 해당 애플리케이션들이 모두 정상 합의 상태라는 주장이 아니다.

공개 `m2-r9-public-journals.tar.gz`에는 마지막 회차의 공개 opening/key, 양측 journal, client 결과, 실행 설정만 들어간다. private 키나 원본 Ainize 지식 파일은 포함하지 않는다. 새 디렉터리에 압축을 풀고 동일 소스 이미지로 오프라인 재생할 수 있다. 이미 생성된 audit 파일을 덮어쓰지 않는다.

```bash
mkdir /new/offline-audit
tar -xzf m2-r9-public-journals.tar.gz -C /new/offline-audit
docker run --rm --runtime runc --network none --cpus 4 --memory 4g --memory-swap 4g \
  --user "$(id -u):$(id -g)" --env RUN_ID=m2_parallel_batch_r9_20260912 \
  --env CHANNELS=512 --env WORKERS=8 \
  --mount type=bind,src=/new/offline-audit,dst=/evidence \
  source-built-image tools/state-channel/parallel-load.js audit
```

## 검증·게시

프레임 크기 제한까지 보강한 최종 소스 이미지의 집중 회귀 테스트는 **43개 통과**다: Node test18개(배치 내구성·오류 거부·journal·체인 사전점검·확정 판정)와 Jest25개(채널·escrow 정책·정밀도). `m2_parallel_build_r8_20260912/tests.log`를 따른다. TypeScript build, JS/shell syntax, `git diff --check`도 통과했다. 크기가 재생 상한16MiB를 넘는 프레임은 쓰기/ACK 전에 안전하게 거부한다.

SDK 구현 커밋은 `f4c7263`, 프레임 크기 경계 보강은 `9364ea8`이며 `year3/m2-state-channel-sdk`에 push했다. 게시물은 실험용 GitHub 소스 prerelease와 선별한 공개 증빙이다. npm 패키지/기존 Ainize 런타임/공개 blockchain mainnet 배포를 뜻하지 않는다. DART dataset100개는 변경하지 않았다.
