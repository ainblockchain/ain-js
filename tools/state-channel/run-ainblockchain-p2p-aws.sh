#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
AWS_ENV_FILE=${AWS_ENV_FILE:-"$ROOT_DIR/../../../.aws_ain_prod_env"}
AWS_REGION=${AWS_REGION:-us-east-1}
set -a; source "$AWS_ENV_FILE"; set +a
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-${KEY:-${AWS_KEY:-}}}" \
  AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-${SECRET_KEY:-${AWS_SECRET:-}}}" \
  AWS_DEFAULT_REGION="$AWS_REGION" AWS_REGION
AWS_IMAGE=amazon/aws-cli:2.27.57
aws(){ docker run --rm --network host -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION -e AWS_REGION "$AWS_IMAGE" "$@"; }
RUN_ID=${RUN_ID:-ain-p2p-$(date -u +%Y%m%d%H%M%S)}
AZ=${AZ:-us-east-1a}
WORK=$(mktemp -d /tmp/$RUN_ID.XXXXXX); KEY="$WORK/$RUN_ID.pem"; EVIDENCE=${EVIDENCE_DIR:-/mnt/newdata/gov/kpi/evidence/$RUN_ID}; mkdir -p "$EVIDENCE"; chmod 700 "$EVIDENCE"
VPC= SUBNET=IGW=RT=ASSOC=SG=KP=; IDS=(); IPS=(); KEEP=${KEEP_RESOURCES:-0}
cleanup(){ s=$?; set +e; echo "cleanup status=$s" >&2; if [[ "$KEEP" != 1 ]]; then [[ ${#IDS[@]} -gt 0 ]] && aws ec2 terminate-instances --instance-ids "${IDS[@]}" >/dev/null; [[ ${#IDS[@]} -gt 0 ]] && aws ec2 wait instance-terminated --instance-ids "${IDS[@]}" >/dev/null; [[ -n "$KP" ]] && aws ec2 delete-key-pair --key-name "$KP" >/dev/null; [[ -n "$ASSOC" ]] && aws ec2 disassociate-route-table --association-id "$ASSOC" >/dev/null; [[ -n "$RT" ]] && aws ec2 delete-route-table --route-table-id "$RT" >/dev/null; [[ -n "$SG" ]] && aws ec2 delete-security-group --group-id "$SG" >/dev/null; [[ -n "$IGW" && -n "$VPC" ]] && aws ec2 detach-internet-gateway --internet-gateway-id "$IGW" --vpc-id "$VPC" >/dev/null; [[ -n "$IGW" ]] && aws ec2 delete-internet-gateway --internet-gateway-id "$IGW" >/dev/null; [[ -n "$SUBNET" ]] && aws ec2 delete-subnet --subnet-id "$SUBNET" >/dev/null; [[ -n "$VPC" ]] && aws ec2 delete-vpc --vpc-id "$VPC" >/dev/null; fi; rm -rf "$WORK"; exit $s; }
trap cleanup EXIT INT TERM
MY_IP=$(curl -4 -fsS --max-time 10 https://checkip.amazonaws.com | tr -d '[:space:]')
AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 --query Parameter.Value --output text)
VPC=$(aws ec2 create-vpc --cidr-block 10.99.0.0/16 --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=$RUN_ID},{Key=Project,Value=ain-p2p}]" --query Vpc.VpcId --output text)
aws ec2 modify-vpc-attribute --vpc-id "$VPC" --enable-dns-support '{"Value":true}'
aws ec2 modify-vpc-attribute --vpc-id "$VPC" --enable-dns-hostnames '{"Value":true}'
SUBNET=$(aws ec2 create-subnet --vpc-id "$VPC" --cidr-block 10.99.1.0/24 --availability-zone "$AZ" --tag-specifications "ResourceType=subnet,Tags=[{Key=RunId,Value=$RUN_ID}]" --query Subnet.SubnetId --output text)
IGW=$(aws ec2 create-internet-gateway --query InternetGateway.InternetGatewayId --output text)
aws ec2 attach-internet-gateway --internet-gateway-id "$IGW" --vpc-id "$VPC"
RT=$(aws ec2 create-route-table --vpc-id "$VPC" --query RouteTable.RouteTableId --output text)
aws ec2 create-route --route-table-id "$RT" --destination-cidr-block 0.0.0.0/0 --gateway-id "$IGW" >/dev/null
ASSOC=$(aws ec2 associate-route-table --route-table-id "$RT" --subnet-id "$SUBNET" --query AssociationId --output text)
SG=$(aws ec2 create-security-group --group-name "$RUN_ID" --description "AIN P2P experiment" --vpc-id "$VPC" --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id "$SG" --protocol tcp --port 22 --cidr "$MY_IP/32" >/dev/null
aws ec2 authorize-security-group-ingress --group-id "$SG" --protocol -1 --source-group "$SG" >/dev/null
KP="$RUN_ID"; aws ec2 create-key-pair --key-name "$KP" --key-type ed25519 --query KeyMaterial --output text > "$KEY"; chmod 600 "$KEY"
mapfile -t IDS < <(aws ec2 run-instances --image-id "$AMI" --instance-type m6i.8xlarge --count 10 --key-name "$KP" --network-interfaces "DeviceIndex=0,SubnetId=$SUBNET,Groups=$SG,AssociatePublicIpAddress=true" --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=40,VolumeType=gp3,DeleteOnTermination=true,Encrypted=true}' --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$RUN_ID},{Key=Project,Value=ain-p2p},{Key=RunId,Value=$RUN_ID}]" "ResourceType=volume,Tags=[{Key=Project,Value=ain-p2p},{Key=RunId,Value=$RUN_ID}]" --query 'Instances[].InstanceId' --output text | tr '\t' '\n')
[[ ${#IDS[@]} == 10 ]] || { echo 'did not launch 10 instances' >&2; exit 1; }
printf '%s\n' "${IDS[@]}" > "$EVIDENCE/instance-ids.txt"
aws ec2 wait instance-running --instance-ids "${IDS[@]}"
mapfile -t IPS < <(aws ec2 describe-instances --instance-ids "${IDS[@]}" --query 'Reservations[].Instances[].PublicIpAddress' --output text | tr '\t' '\n')
NODE0_PRIVATE=$(aws ec2 describe-instances --instance-ids "${IDS[0]}" --query 'Reservations[0].Instances[0].PrivateIpAddress' --output text)
printf '%s\n' "${IPS[@]}" > "$EVIDENCE/public-ips.txt"
printf 'run=%s nodes=10\n' "$RUN_ID" | tee "$EVIDENCE/run.txt"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$WORK/known_hosts")
for ip in "${IPS[@]}"; do for n in $(seq 1 60); do if "${SSH[@]}" "ec2-user@$ip" 'echo ready' >/dev/null 2>&1; then break; fi; [[ $n == 60 ]] && exit 1; sleep 5; done; done
for idx in "${!IPS[@]}"; do ip=${IPS[$idx]}; key_json=$(node -e "const a=require('/mnt/newdata/gov/kpi/pr/ab-m1/blockchain-configs/base/genesis_accounts.json').others[$idx]; process.stdout.write(a.private_key)"); "${SSH[@]}" "ec2-user@$ip" bash -s -- "$idx" "$RUN_ID" "$NODE0_PRIVATE" "$key_json" <<'REMOTE' > "$EVIDENCE/node-$idx-bootstrap.log" 2>&1 &
set -Eeuo pipefail
idx=$1; run_id=$2; tracker_ip=$3; private_key=$4
sudo dnf install -y docker git >/dev/null
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user || true
rm -rf "$HOME/ain-blockchain-$run_id"
git clone --depth 1 --branch year3/m1-sharding-protocol https://github.com/ainblockchain/ain-blockchain.git "$HOME/ain-blockchain-$run_id"
cd "$HOME/ain-blockchain-$run_id"
cat > /tmp/Dockerfile.ain <<'DOCKER'
FROM node:22-bookworm
WORKDIR /app/ain-blockchain
COPY . /app/ain-blockchain
RUN yarn install --frozen-lockfile
ENV HOSTING_ENV=aws
ENTRYPOINT bash ./start_node_docker.sh
DOCKER
sudo docker build --network host -f /tmp/Dockerfile.ain -t "ain-p2p:$run_id" .
if [[ "$idx" == 0 ]]; then
  sudo docker run --name "ain-tracker-$run_id" --network host -d --cpus=1 --memory=2g --entrypoint node -e PORT=8079 -e CONSOLE_LOG=false "ain-p2p:$run_id" tracker-server/index.js
fi
sleep 3
mkdir -p "$HOME/ain-data-$run_id"
sync_mode=peer
[[ "$idx" == 0 ]] && sync_mode=full
 sudo docker run --name "ain-node-$run_id" --network host -d --cpus=32 --memory=120g \
  -e ACCOUNT_INJECTION_OPTION=private_key -e PRIVATE_KEY="$private_key" -e SYNC_MODE="$sync_mode" \
  -e BLOCKCHAIN_CONFIGS_DIR=blockchain-configs/cert-10-nodes \
  -e BLOCKCHAIN_DATA_DIR=/home/ain_blockchain_data \
  -e PORT=8080 -e P2P_PORT=5000 \
  -e TRACKER_UPDATE_JSON_RPC_URL="http://$tracker_ip:8079/json-rpc" \
  -e PEER_CANDIDATE_JSON_RPC_URL="http://$tracker_ip:8080/json-rpc" \
  -e STAKE=1000000 -e SEASON=custom -e CONSOLE_LOG=false \
  -e ENABLE_EXPRESS_RATE_LIMIT=false -e ENABLE_GAS_FEE_WORKAROUND=true \
  -e ENABLE_TX_SIG_VERIF_WORKAROUND=true -e TX_POOL_SIZE_LIMIT=1000000 \
  -v "$HOME/ain-data-$run_id:/home/ain_blockchain_data" \
  "ain-p2p:$run_id"
REMOTE
done
wait
printf 'all nodes launched; probing node APIs\n'
for idx in "${!IPS[@]}"; do ip=${IPS[$idx]}; for n in $(seq 1 90); do if curl -fsS --max-time 5 "http://$ip:8080/node_status" > "$EVIDENCE/node-$idx-status.json" 2>/dev/null && grep -q '"state":"SERVING"' "$EVIDENCE/node-$idx-status.json"; then break; fi; [[ $n == 90 ]] && { echo "node $idx did not reach SERVING" >&2; exit 1; }; sleep 5; done; done
curl -fsS --max-time 10 "http://${IPS[0]}:8080/node_status" > "$EVIDENCE/node0-status.json"
curl -fsS --max-time 10 "http://${IPS[0]}:8079/network_status" > "$EVIDENCE/network-status.json"
node -e "const x=require(process.argv[1]); if (x.numNodesAlive < 10) { console.error('tracker sees '+x.numNodesAlive+'/10 nodes'); process.exit(1); }" "$EVIDENCE/network-status.json"
printf 'P2P node probe passed; evidence=%s\n' "$EVIDENCE"
