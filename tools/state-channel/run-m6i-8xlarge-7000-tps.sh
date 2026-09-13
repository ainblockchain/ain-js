#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
if [[ -z "${AWS_ENV_FILE:-}" ]]; then
  for candidate in "$PWD/aws_env" "$PWD/.aws_env" "$ROOT_DIR/../../../.aws_env"; do
    if [[ -r "$candidate" ]]; then AWS_ENV_FILE=$candidate; break; fi
  done
fi
AWS_ENV_FILE=${AWS_ENV_FILE:-"$ROOT_DIR/../../../.aws_env"}
AWS_REGION=${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}
AWS_CLI_IMAGE=${AWS_CLI_IMAGE:-amazon/aws-cli:2.27.57}
BRANCH=${BRANCH:-year3/m2-state-channel-sdk}
INSTANCE_TYPE=${INSTANCE_TYPE:-m6i.8xlarge}
INSTANCE_COUNT=${INSTANCE_COUNT:-10}
TEST_DURATION_MS=${TEST_DURATION_MS:-60000}
TEST_WARMUP_MS=${TEST_WARMUP_MS:-30000}
CHANNELS=${CHANNELS:-512}
WORKERS=${WORKERS:-8}
PROJECT=${PROJECT:-ain-kpi-7000-tps}
RUN_ID=${RUN_ID:-m6i7000_$(date -u +%Y%m%d%H%M%S)}

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ -r "$AWS_ENV_FILE" ]] || die "AWS credentials file not found: $AWS_ENV_FILE"
source "$AWS_ENV_FILE"
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID:-${AWS_KEY:-}}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY:-${AWS_SECRET:-}}
[[ -n "$AWS_ACCESS_KEY_ID" && -n "$AWS_SECRET_ACCESS_KEY" ]] || die 'set AWS_KEY/AWS_SECRET or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in aws_env'
[[ "$INSTANCE_COUNT" == 10 ]] || die 'this guide requires exactly 10 instances'
[[ "$RUN_ID" =~ ^[a-z0-9_-]{1,50}$ ]] || die 'RUN_ID must contain lowercase letters, digits, _ or -'
command -v docker >/dev/null || die 'Docker is required for the local AWS CLI container'
command -v ssh >/dev/null || die 'ssh is required'
command -v scp >/dev/null || die 'scp is required'
command -v node >/dev/null || die 'Node.js is required for aggregate verification'

export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"
aws_cli() {
  docker run --rm --network host \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
    -e AWS_REGION -e AWS_DEFAULT_REGION "$AWS_CLI_IMAGE" "$@"
}

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/$RUN_ID.XXXXXX")
KEY_FILE="$WORK_DIR/$RUN_ID.pem"
LOCAL_EVIDENCE=${LOCAL_EVIDENCE:-"$ROOT_DIR/../../evidence/$RUN_ID"}
mkdir -p "$LOCAL_EVIDENCE"
chmod 700 "$LOCAL_EVIDENCE"
VPC_ID= SUBNET_ID= IGW_ID= ROUTE_TABLE_ID= ASSOCIATION_ID= SG_ID= KEY_NAME=
INSTANCE_IDS=()
INSTANCE_IPS=()
KEEP_RESOURCES=${KEEP_RESOURCES:-0}

cleanup() {
  local status=$?
  set +e
  if [[ "$KEEP_RESOURCES" != 1 ]]; then
    if ((${#INSTANCE_IDS[@]})); then
      aws_cli ec2 terminate-instances --instance-ids "${INSTANCE_IDS[@]}" >/dev/null 2>&1 || true
      aws_cli ec2 wait instance-terminated --instance-ids "${INSTANCE_IDS[@]}" >/dev/null 2>&1 || true
    fi
    [[ -n "$KEY_NAME" ]] && aws_cli ec2 delete-key-pair --key-name "$KEY_NAME" >/dev/null 2>&1 || true
    [[ -n "$ASSOCIATION_ID" ]] && aws_cli ec2 disassociate-route-table --association-id "$ASSOCIATION_ID" >/dev/null 2>&1 || true
    [[ -n "$ROUTE_TABLE_ID" ]] && aws_cli ec2 delete-route-table --route-table-id "$ROUTE_TABLE_ID" >/dev/null 2>&1 || true
    [[ -n "$SG_ID" ]] && aws_cli ec2 delete-security-group --group-id "$SG_ID" >/dev/null 2>&1 || true
    [[ -n "$IGW_ID" && -n "$VPC_ID" ]] && aws_cli ec2 detach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID" >/dev/null 2>&1 || true
    [[ -n "$IGW_ID" ]] && aws_cli ec2 delete-internet-gateway --internet-gateway-id "$IGW_ID" >/dev/null 2>&1 || true
    [[ -n "$SUBNET_ID" ]] && aws_cli ec2 delete-subnet --subnet-id "$SUBNET_ID" >/dev/null 2>&1 || true
    [[ -n "$VPC_ID" ]] && aws_cli ec2 delete-vpc --vpc-id "$VPC_ID" >/dev/null 2>&1 || true
  else
    printf 'KEEP_RESOURCES=1; resources were intentionally retained.\n' >&2
  fi
  rm -rf "$WORK_DIR"
  exit "$status"
}
trap cleanup EXIT INT TERM

printf 'Checking AWS identity and region %s...\n' "$AWS_REGION"
aws_cli sts get-caller-identity --output json > "$LOCAL_EVIDENCE/aws-caller-identity.json"
ACCOUNT_ID=$(node -e 'const x=require(process.argv[1]); process.stdout.write(x.Account)' "$LOCAL_EVIDENCE/aws-caller-identity.json")
printf 'Account: %s; project: %s; instances: %s x %s\n' "$ACCOUNT_ID" "$PROJECT" "$INSTANCE_COUNT" "$INSTANCE_TYPE"

MY_IP=${MY_IP:-$(curl -4 -fsS --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]')}
[[ "$MY_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die 'could not determine caller public IPv4; set MY_IP explicitly'

AMI_ID=$(aws_cli ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query 'Parameter.Value' --output text)
[[ "$AMI_ID" != None && -n "$AMI_ID" ]] || die 'could not resolve the Amazon Linux 2023 AMI'

VPC_ID=$(aws_cli ec2 create-vpc --cidr-block 10.77.0.0/16 \
  --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=$PROJECT-$RUN_ID},{Key=Project,Value=$PROJECT},{Key=AutoCleanup,Value=true}]" \
  --query 'Vpc.VpcId' --output text)
aws_cli ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-support '{"Value":true}'
aws_cli ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames '{"Value":true}'

SUBNET_ID=$(aws_cli ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block 10.77.1.0/24 \
  --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=$PROJECT-$RUN_ID},{Key=Project,Value=$PROJECT},{Key=AutoCleanup,Value=true}]" \
  --query 'Subnet.SubnetId' --output text)
IGW_ID=$(aws_cli ec2 create-internet-gateway \
  --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=$PROJECT-$RUN_ID},{Key=Project,Value=$PROJECT}]" \
  --query 'InternetGateway.InternetGatewayId' --output text)
aws_cli ec2 attach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID"
ROUTE_TABLE_ID=$(aws_cli ec2 create-route-table --vpc-id "$VPC_ID" \
  --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=$PROJECT-$RUN_ID},{Key=Project,Value=$PROJECT}]" \
  --query 'RouteTable.RouteTableId' --output text)
aws_cli ec2 create-route --route-table-id "$ROUTE_TABLE_ID" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW_ID" >/dev/null
ASSOCIATION_ID=$(aws_cli ec2 associate-route-table --route-table-id "$ROUTE_TABLE_ID" --subnet-id "$SUBNET_ID" --query 'AssociationId' --output text)
SG_ID=$(aws_cli ec2 create-security-group --group-name "$PROJECT-$RUN_ID" --description 'Temporary 7000 TPS experiment SSH only' --vpc-id "$VPC_ID" --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=$PROJECT-$RUN_ID},{Key=Project,Value=$PROJECT}]" --query 'GroupId' --output text)
aws_cli ec2 authorize-security-group-ingress --group-id "$SG_ID" --protocol tcp --port 22 --cidr "$MY_IP/32" >/dev/null

KEY_NAME="$PROJECT-$RUN_ID"
aws_cli ec2 create-key-pair --key-name "$KEY_NAME" --key-type ed25519 --query 'KeyMaterial' --output text > "$KEY_FILE"
chmod 600 "$KEY_FILE"

INSTANCE_TAGS="ResourceType=instance,Tags=[{Key=Name,Value=$PROJECT-$RUN_ID},{Key=Project,Value=$PROJECT},{Key=RunId,Value=$RUN_ID},{Key=AutoCleanup,Value=true}]"
VOLUME_TAGS="ResourceType=volume,Tags=[{Key=Project,Value=$PROJECT},{Key=RunId,Value=$RUN_ID},{Key=AutoCleanup,Value=true}]"
mapfile -t INSTANCE_IDS < <(aws_cli ec2 run-instances --image-id "$AMI_ID" --instance-type "$INSTANCE_TYPE" --count "$INSTANCE_COUNT" \
  --key-name "$KEY_NAME" --network-interfaces "DeviceIndex=0,SubnetId=$SUBNET_ID,Groups=$SG_ID,AssociatePublicIpAddress=true" \
  --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=30,VolumeType=gp3,DeleteOnTermination=true,Encrypted=true}' \
  --tag-specifications "$INSTANCE_TAGS" "$VOLUME_TAGS" \
  --query 'Instances[].InstanceId' --output text | tr '\t' '\n')
[[ ${#INSTANCE_IDS[@]} -eq "$INSTANCE_COUNT" ]] || die "expected $INSTANCE_COUNT instances, got ${#INSTANCE_IDS[@]}"
printf '%s\n' "${INSTANCE_IDS[@]}" > "$LOCAL_EVIDENCE/instance-ids.txt"
aws_cli ec2 wait instance-running --instance-ids "${INSTANCE_IDS[@]}"
aws_cli ec2 describe-instances --instance-ids "${INSTANCE_IDS[@]}" --output json > "$LOCAL_EVIDENCE/instances.json"

ssh_opts=(-i "$KEY_FILE" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$WORK_DIR/known_hosts")
remote_bootstrap() {
  local ip=$1
  ssh "${ssh_opts[@]}" "ec2-user@$ip" 'sudo dnf install -y docker git iproute-tc >/dev/null && sudo systemctl enable --now docker && sudo usermod -aG docker ec2-user'
}
remote_build() {
  local ip=$1
  ssh "${ssh_opts[@]}" "ec2-user@$ip" bash -s -- "$BRANCH" "$RUN_ID" "$TEST_DURATION_MS" "$TEST_WARMUP_MS" "$CHANNELS" "$WORKERS" <<'REMOTE'
set -Eeuo pipefail
branch=$1; run_id=$2; duration=$3; warmup=$4; channels=$5; workers=$6
rm -rf "$HOME/ain-js-$run_id" "$HOME/evidence/$run_id" "$HOME/private/$run_id"
git clone --depth 1 --branch "$branch" https://github.com/ainblockchain/ain-js.git "$HOME/ain-js-$run_id"
cd "$HOME/ain-js-$run_id"
cat > /tmp/ain-channel.Dockerfile <<'DOCKERFILE'
FROM node:22-bookworm
WORKDIR /opt/ain-js
COPY . .
RUN npm ci && npm run build
DOCKERFILE
docker build --network host -f /tmp/ain-channel.Dockerfile -t "ain-channel:$run_id" .
mkdir -p "$HOME/evidence" "$HOME/private"
RUN_ID="$run_id" AIN_CHANNEL_IMAGE="ain-channel:$run_id" \
CHANNELS="$channels" WORKERS="$workers" WARMUP_MS="$warmup" DURATION_MS="$duration" \
CHANNEL_TRANSPORT=batch TRANSPORT_BATCH=16 JOURNAL_BATCH=64 JOURNAL_DELAY_MS=1 \
PEER_CPUS=4 PEER_CPU_SHARES=131072 \
bash tools/state-channel/run-parallel-load.sh "$HOME/evidence/$run_id" "$HOME/private/$run_id"
REMOTE
}

printf 'Waiting for SSH and building the identical source image on all 10 nodes...\n'
for id in "${INSTANCE_IDS[@]}"; do
  ip=$(aws_cli ec2 describe-instances --instance-ids "$id" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
  INSTANCE_IPS+=("$ip")
done
printf '%s\n' "${INSTANCE_IPS[@]}" > "$LOCAL_EVIDENCE/public-ips.txt"

for ip in "${INSTANCE_IPS[@]}"; do
  for attempt in {1..60}; do
    if remote_bootstrap "$ip" >/dev/null 2>&1; then break; fi
    [[ "$attempt" -eq 60 ]] && die "SSH/bootstrap timed out for $ip"
    sleep 5
  done
done

build_pids=()
for ip in "${INSTANCE_IPS[@]}"; do
  remote_build "$ip" "$BRANCH" "$RUN_ID" "$TEST_DURATION_MS" "$TEST_WARMUP_MS" "$CHANNELS" "$WORKERS" > "$LOCAL_EVIDENCE/build-$ip.log" 2>&1 &
  build_pids+=("$!")
done
build_failed=0
for pid in "${build_pids[@]}"; do wait "$pid" || build_failed=1; done
((build_failed == 0)) || die 'one or more remote builds/tests failed; logs were retained'

printf 'Collecting and aggregating 10 independent m6i.8xlarge results...\n'
for index in "${!INSTANCE_IPS[@]}"; do
  ip=${INSTANCE_IPS[$index]}
  scp "${ssh_opts[@]}" "ec2-user@$ip:/home/ec2-user/evidence/$RUN_ID/summary.json" "$LOCAL_EVIDENCE/node-$index-summary.json"
  scp "${ssh_opts[@]}" "ec2-user@$ip:/home/ec2-user/evidence/$RUN_ID/journal-audit.json" "$LOCAL_EVIDENCE/node-$index-journal-audit.json"
  scp "${ssh_opts[@]}" "ec2-user@$ip:/home/ec2-user/evidence/$RUN_ID/runner-exit.txt" "$LOCAL_EVIDENCE/node-$index-runner-exit.txt"
done

node - "$LOCAL_EVIDENCE" "$RUN_ID" "$INSTANCE_TYPE" "$INSTANCE_COUNT" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [directory, runId, instanceType, instanceCount] = process.argv.slice(2);
const summaries = fs.readdirSync(directory).filter(name => /^node-\d+-summary\.json$/.test(name))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  .map(name => JSON.parse(fs.readFileSync(path.join(directory, name))));
if (summaries.length !== Number(instanceCount)) throw new Error(`expected ${instanceCount} summaries, got ${summaries.length}`);
const counts = summaries[0].counts.map((_, index) => summaries.reduce((total, item) => total + item.counts[index], 0));
const measured = counts.reduce((total, value) => total + value, 0);
const duration = summaries[0].duration;
const audits = summaries.map((_, index) => JSON.parse(fs.readFileSync(path.join(directory, `node-${index}-journal-audit.json`))));
const errors = summaries.flatMap(item => item.errors);
const pass = summaries.every(item => item.errors.length === 0 && item.statesAgree === true && Math.min(...item.counts) >= 7000)
  && audits.every(item => item.pass === true) && errors.length === 0;
const result = { runId, instanceType, instanceCount: summaries.length, measured, duration,
  aggregateAverageTPS: measured * 1000 / duration, aggregatePeakTPS: Math.max(...counts),
  aggregateMinimumOneSecondTPS: Math.min(...counts), perNode: summaries.map(item => ({ runId: item.runId,
    averageTPS: item.averageTPS, peakTPS: item.peakTPS, minimumOneSecondTPS: Math.min(...item.counts),
    p50ms: item.p50ms, p99ms: item.p99ms, acknowledged: item.acknowledged, errors: item.errors.length,
    statesAgree: item.statesAgree })), audits, pass,
  scope: 'ten independent Docker State Channel peer pairs on ten m6i.8xlarge instances; aggregate capacity, not one on-chain block TPS' };
fs.writeFileSync(path.join(directory, 'aggregate-summary.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
console.log(JSON.stringify(result, null, 2));
if (!pass) process.exitCode = 1;
NODE

printf '7000 TPS experiment completed; cleanup is now running to stop all billable instances and delete the temporary VPC.\n'
