# 7,000 TPS 이상 달성 기술 조사와 AIN 적용 우선순위

조사일: 2026-09-12 UTC. 공식 문서·구현 저장소·원 논문만 기술 근거로 사용했다.
외부 성능 수치는 해당 시스템의 조건부 결과이며 이 머신의 성능 증빙이 아니다.
이 문서는 연구·설계 제안이고, 새 7,000 TPS 시험 합격 보고서가 아니다.

## 결론

현재 요구사항에는 **State Channel을 유지하면서 독립 채널 병렬 처리 +
서명/통신/저장 단계 분리 + 내구성을 유지하는 WAL group commit**을 먼저 적용하는 것이 적합하다.
새 L1 합의나 ZK rollup으로 바꾸어 다른 종류의 TPS를 제출하는 것은 요구사항 대체다.
아래 우선순위는 외부 자료와 로컬 코드 구조를 종합한 설계 판단이다. 구현과 후속 실측은 `PAYMENT_CHANNEL.md` 및 별도 시험 결과 보고서를 따른다.

## 실제 사용되는 기술

| 기술 | 공식 근거와 최신 동향 | 현재 AIN 시험에 대한 판단 |
|---|---|---|
| 오프체인 상태 채널 | 참여자끼리 상태를 갱신하고 개설·종료·분쟁에 주로 L1을 사용한다. 모든 중간 거래를 L1에 올리지 않는 것이 확장 원리다. [Ethereum State Channels](https://ethereum.org/developers/docs/scaling/state-channels/) | 요구사항에 직접 부합. 개별 갱신의 양측 서명·순서·잔액 검증과 실제 정산을 유지한다. |
| 충돌을 고려한 병렬 실행 | Aptos Block-STM은 정해진 순차 실행 결과를 유지하면서 독립 트랜잭션을 병렬 실행한다. Monad도 낙관적 실행 후 충돌 시 재실행한다. [Block-STM 논문](https://arxiv.org/abs/2203.06871), [Monad 병렬 실행](https://docs.monad.xyz/monad-arch/execution/parallel-execution) | `channelId` 기준으로 작업을 분배한다. 같은 채널의 sequence/hash 연결은 순서대로 유지하고 서로 다른 채널만 병렬화한다. |
| 처리 단계 분리와 CPU 배치 | Firedancer는 네트워크 수신·서명 검증·중복 제거·스케줄링·실행 등을 tile로 나누고 일부 단계를 여러 CPU에서 병렬 수행한다. [Firedancer 구성](https://docs.firedancer.io/guide/configuring.html) | 다수 HTTP 서버를 단일 JS 프로세스에서 실행하는 대신, 송신·검증·저장 경로를 분리하고 실제 CPU 한도 내 worker 수를 측정한다. |
| DAG 합의와 중복 인증 제거 | Sui의 2025-11 Mysticeti v2 설명은 거래 검증을 합의에 통합하고, 건별 검증자 서명을 블록 단위로 묶으며, 클라이언트 중복 방송을 줄인다. [Mysticeti v2](https://www.sui.io/blog/mysticeti-v2-sui-consensus) | L1을 전면 교체하기보다 중복 검증·직렬 대기·불필요한 방송을 줄이는 설계를 참고한다. 사용자 거래 서명을 생략해도 된다는 뜻은 아니다. |
| Rollup + 데이터 가용성 확장 | Ethereum Fusaka는 2025-12-03 가동되었으며 PeerDAS를 도입했다. 노드별 데이터 부담을 분산해 rollup용 blob 확장을 지원한다. [Fusaka](https://ethereum.org/roadmap/fusaka/), [PeerDAS](https://ethereum.org/roadmap/fusaka/peerdas/) | 최신 확장 방향이지만 AIN State Channel 처리량을 직접 높이는 패치가 아니다. DA 용량 배율을 TPS 배율로 바꾸어 쓰지 않는다. |
| WAL group commit·비동기 I/O | RocksDB는 여러 쓰기를 WAL에 묶어 한 번의 fsync로 확정하는 group commit을 설명한다. MonadDb는 비동기 I/O를 활용한다. 최신 발명은 아니지만 고성능 구현에서 여전히 중요한 기법이다. [RocksDB WAL](https://github.com/facebook/rocksdb/wiki/WAL-Performance), [MonadDb](https://docs.monad.xyz/monad-arch/execution/monaddb) | 가장 직접적인 후보. 모든 영수증을 기록하되 여러 채널의 기록을 묶어 동기화하고, 동기화 완료 뒤 해당 ACK들을 보낸다. |

## 숫자를 비교할 때 주의할 점

- Monad 공식 문서는 10,000 TPS·400ms 블록·800ms finality를 제시한다. 이는 프로젝트의 성능 설명이며 우리 Docker 환경에서 재현된 수치가 아니다. [Monad 공식 소개](https://docs.monad.xyz/)
- Block-STM 논문은 32 threads에서 Aptos benchmark 최대 170,000 TPS를 보고한다. Aptos 백서는 관련 성능 시험이 인메모리 DB를 쓰는 execution-only 시험이라고 명시한다. 네트워크 합의·영구 저장까지 포함한 E2E TPS와 동일시하면 안 된다. [논문](https://arxiv.org/abs/2203.06871), [Aptos 백서](https://aptosnetwork.com/whitepaper/aptos-whitepaper_en.pdf)
- Mysticeti v2 설명의 아시아 약 1.00→0.65초, 유럽 약 0.55→0.40초는 운영팀이 관측한 지연 개선이다. 이를 AIN의 TPS 증가율로 환산하지 않는다. [Sui 관측](https://www.sui.io/blog/mysticeti-v2-sui-consensus)
- 검증 단계 TPS, RPC 수락 TPS, 실제 거래 실행 TPS, 합의 확정 TPS, L2 양측 확인 TPS는 서로 다른 값이다. 합의 투표·중복 재전송·실패 요청·블록 내 하위 명령을 별도 거래로 부풀리지 않는다.

## 로컬 구현 확인

확인한 ain-js 기반 커밋은 `d48cd43`이다. 경로는 이 저장소 기준이다.

1. `src/state-channel/index.ts`는 이미 Node `crypto`의 Ed25519와 재사용 `KeyObject`를 사용한다. 이 경로가 JS secp256k1 fallback 때문에 느리다고 단정할 근거는 없다.
2. `src/state-channel/http-peer.ts`는 채널별 Promise 대기열에서 `accept → await persist → ACK`를 처리한다. 채널 내부 순서 보장은 필요하다. CPU 작업을 서로 다른 채널까지 한 프로세스의 이벤트 루프에 몰아넣을 필요는 없다.
3. `tools/state-channel/escrow-peer.js`는 영수증마다 `writeSync + fsyncSync`를 수행한다. 이는 이벤트 루프를 막을 수 있다. 단, 프로파일링 전에는 이것이 전체 지연의 몇 퍼센트인지 알 수 없다.
4. 재현 워크스페이스의 `kpi/harness/channel-network-load.js`는 100개 채널 서버를 한 Node 프로세스에서 열고, 송신 측도 한 프로세스에서 실행한다. 채널별 동시 요청은 있지만 CPU 병렬 worker는 없다. 각 컨테이너 2 CPU 제한이 JS 메인 스레드를 두 개로 만들지는 않는다.
5. 기존 `PAYMENT_CHANNEL.md`의 실측은 60초 동안 40,071건, 평균 667.85 TPS, 최대 796 TPS다. 종료 후 drain 100건은 측정 TPS에서 제외했고 전체 40,171건을 재검증했다. 이 부하 시험의 온체인 기록은 opening/final checkpoint이며 실제 에스크로 지급 시험과 구분해야 한다.

기존 평균에서 평균 7,000까지는 약 **10.48배**, 기존 최대에서 최대 7,000까지는 약 **8.79배**가 필요하다. 이는 필요한 배율 계산일 뿐 달성 예측이 아니다.

## 권장 변경 순서

### 1. 먼저 구간별 비용을 계측한다

서명 생성, 검증, JSON 직렬화, 네트워크 대기, 대기열 체류, WAL append,
fsync, 송신자의 최종 receipt 검증을 구분한다. CPU 프로파일·event-loop 지연·
Docker `cpu.stat` throttling·실제 디스크 지연도 함께 남긴다.

### 2. 독립 채널을 병렬 worker로 분배한다

`hash(channelId) % workerCount` 등 결정적 분배로 같은 채널의 순서를 유지한다.
송신·수신 양쪽을 개선해야 한다. 100개 채널을 만들거나 Promise를 늘리는 것만으로
실제 CPU 병렬성이 생기지 않는다. worker 수 1/2/4와 채널 수를 같은 자원 제한에서 비교한다.

### 3. 내구성을 보존하는 group commit을 추가한다

제안 실험값은 batch 1/16/64/128건, 최대 대기 0/1/2/5ms다. 이 숫자는 문헌의
보장값이 아닌 A/B 시험 후보이다. 각 거래의 양측 서명과 영수증을 모두 보존하고,
WAL flush/fsync 완료 전에는 성공 ACK를 보내지 않는다. 순서·중복 처리와
부분 write·디스크 오류·SIGKILL 후 재생을 검증한다. 서로 다른 채널의 쓰기를 묶으면
채널 내부 상태 의존성을 임의로 깨지 않고 디스크 동기화 비용을 분담할 수 있다.

`fsync`를 삭제하거나 영수증을 RAM에만 둔 수치는 현재 내구성 조건의 합격 증빙이 아니다.
프로세스 강제 종료 시험과 커널 장애·전원 차단 내구성 시험도 구분한다.

### 4. 통신과 암호 연산은 측정 후 최적화한다

영구 연결, 제한된 in-flight 요청, 요청 일괄 전달, 중복 직렬화 감소를 비교한다.
같은 채널에서는 ACK 전에 상태를 앞당겨 확정하지 않는다. 키의 소유권 검사를
안전한 초기화 단계로 옮기는 캐시 등은 검토할 수 있으나, 수신자의 서명 검증과
sender의 receipt 검증을 없애지 않는다. BLS/서명 집약은 검증 규칙과 정산 프로토콜까지
변경해야 하므로 즉시 적용하는 속도 스위치로 취급하지 않는다.

### 5. 실제 체인 정산과 장애 시험을 결합한다

상태 채널 부하의 성공 건수는 양측이 검증하고 내구성 있게 수락한 고유 갱신으로 센다.
개설·자금 잠금·최종 지급을 ain-js로 ain-blockchain에 보내고, 다른 검증자의
확정값·블록 포함·잔액 보존을 확인한다. 협력 종료만 지원하는 현재 구현을
일방 종료·분쟁 안전성까지 통과한 것으로 표현하지 않는다.

## 시험 및 자원 해석

- 재현절차서의 현재 판정은 1초 최대 TPS이며, 중앙부 평균·60초 평균·목표 미달 구간·p50/p99도 병기한다. 기존 HTTP 부하 스크립트는 평균 기준 `performancePass`를 사용하므로 서로 다른 플래그를 같은 판정이라고 인용하지 않는다. 판정값은 시험 전에 일치시켜야 하며, 실패 결과에 맞추어 사후 변경하지 않는다.
- 최고 1초만 목표에 도달한 경우와 지속적으로 도달한 경우를 구분한다. 기존 반복 시험 규정과 안정성 조건을 유지한다.
- 송신·수신 컨테이너 CPU/메모리/cpuset과 실제 사용량을 함께 보존한다. 8개 호스트 CPU에서 32 CPU quota를 여러 개 설정해도 물리 처리 능력이 늘지는 않는다. 기존 모델·학습·다른 체인 부하는 자의적으로 중단하지 않는다.
- 자체 산술 예시: 거래당 1KiB를 7,000건/s 보내면 순수 payload 약 57.34Mbit/s, 100KiB면 약 5.73Gbit/s다. 서명·응답·재전송·복제 비용은 별도다. payload 크기를 줄인 시험을 같은 대규모 데이터 시험이라고 주장하지 않는다.
- 채널별 요청 하나만 대기시키고 평균 왕복 지연이 20ms라면 7,000건/s에는 산술적으로 약 140개의 독립 in-flight 작업이 필요하다. 이 역시 CPU·디스크 한도를 고려하지 않은 계산이지 성능 보장이 아니다.

## 적용한 기술과 CPU 계층 보완

`PaymentChannel`의 정확히 일치하는 자체 생성 서명만 재사용하고, 외부 서명·금액·도메인·순서 검증은 유지했다. 독립 채널을 worker로 분배하고 HTTP batch와 group journal을 추가했다. 새 영수증은 수신 측 fsync와 송신 측 검증·fsync가 모두 끝난 뒤 성공으로 집계한다. 신규 journal의 독립 재생은 캐시 없이 양쪽 서명을 다시 검증한다.

후속 자원 관측에서 자식 컨테이너의 높은 CPU weight만으로는 상위 계층의 경쟁을 해결할 수 없었다. cgroup v2의 자원 제어는 계층적으로 적용되므로 상위 제약을 하위에서 무시할 수 없다. Docker는 `--cgroup-parent`로 새 시험 컨테이너를 관리자가 지정한 그룹에 넣을 수 있다. [Linux 커널 cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html), [Docker custom cgroups](https://docs.docker.com/reference/cli/docker/container/run/#specify-custom-cgroups)

비교 시험은 기존 프로세스를 정지하거나 기존 그룹을 변경하지 않고, 새 시험 전용 상위 slice에 CPU 합산 상한6개·RAM8GiB·추가 swap0·weight1000을 설정했다. 각 peer는 여전히 CPU4·RAM4GiB 상한이다. 호스트는 총8vCPU이며, 상한6은 전용 물리 코어6개를 보장하지 않는다. 상위 그룹을 바꾼 결과는 소프트웨어만의 개선 배율로 표현하지 않는다. 준비 구간을 쓰는 경우 실행 전에 `WARMUP_MS`를 고정하고 전체 journal은 준비 구간까지 재검증한다.
