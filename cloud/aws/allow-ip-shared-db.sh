#!/usr/bin/env bash
# Let another IP address connect to the shared database (a teammate's home, the venue Wi-Fi, a phone hotspot).
#
#   ./cloud/aws/allow-ip-shared-db.sh              # your current public IP
#   ./cloud/aws/allow-ip-shared-db.sh 203.0.113.7  # a teammate's IP (they find it at https://checkip.amazonaws.com)
set -euo pipefail
REGION="${AWS_REGION:-ca-central-1}"
SG_NAME="${SG_NAME:-nexus-shared-db-sg}"
IP="${1:-$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')}"
SG=$(aws ec2 describe-security-groups --region "$REGION" --filters Name=group-name,Values="$SG_NAME" \
      --query 'SecurityGroups[0].GroupId' --output text)
[[ -n "$SG" && "$SG" != "None" ]] || { echo "Security group $SG_NAME not found. Run create-shared-db.sh first." >&2; exit 1; }
aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG" --protocol tcp --port 5432 --cidr "$IP/32" >/dev/null \
  && echo "Allowed $IP" || echo "$IP is probably already allowed."
