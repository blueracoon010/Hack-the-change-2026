#!/usr/bin/env bash
# Create ONE shared Postgres database on AWS RDS so every teammate's localhost backend sees the same users,
# profiles, follows, RSVPs and events. Paid from AWS credits (db.t4g.micro + 20 GB: roughly US$15-20/month).
#
#   AWS_PROFILE=YOUR_PROFILE_HERE ./cloud/aws/create-shared-db.sh
#
# Needs: AWS CLI v2 logged in (`aws configure` with the account that has the credits; brew install awscli).
# Takes ~10 minutes. Writes cloud/aws/.env.shared-db (git-ignored) with the DATABASE_URL + JWT_SECRET to share
# privately with the team (never commit or paste it in a public channel).
set -euo pipefail

DB_ID="${DB_ID:-nexus-shared-db}"
REGION="${AWS_REGION:-ca-central-1}"     # Montreal: keeps Canadian user data in Canada
DB_CLASS="${DB_CLASS:-db.t4g.micro}"
DB_NAME="${DB_NAME:-nexus}"
DB_USER="${DB_USER:-nexus_admin}"
SG_NAME="${SG_NAME:-nexus-shared-db-sg}"
OUT="$(cd "$(dirname "$0")" && pwd)/.env.shared-db"

aws_() { aws "$@" --region "$REGION"; }

if [[ "${AWS_PROFILE:-}" == "YOUR_PROFILE_HERE" ]]; then
  echo "Replace YOUR_PROFILE_HERE with your AWS CLI profile name (see: aws configure list-profiles)." >&2; exit 1
fi
aws_ sts get-caller-identity --query Account --output text >/dev/null || { echo "AWS CLI is not logged in. Run: aws configure" >&2; exit 1; }

if aws_ rds describe-db-instances --db-instance-identifier "$DB_ID" >/dev/null 2>&1; then
  echo "Database '$DB_ID' already exists. Its endpoint:"
  aws_ rds describe-db-instances --db-instance-identifier "$DB_ID" --query 'DBInstances[0].Endpoint.Address' --output text
  echo "The connection details from the first run are in $OUT"; exit 0
fi

echo "==> Firewall: only your current IP may connect (add teammates with allow-ip-shared-db.sh)"
VPC=$(aws_ ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
SG=$(aws_ ec2 describe-security-groups --filters Name=group-name,Values="$SG_NAME" Name=vpc-id,Values="$VPC" \
      --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)
if [[ -z "$SG" || "$SG" == "None" ]]; then
  SG=$(aws_ ec2 create-security-group --group-name "$SG_NAME" --vpc-id "$VPC" \
        --description "Postgres access for the Nexus hackathon team" --query GroupId --output text)
fi
MY_IP=$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')
aws_ ec2 authorize-security-group-ingress --group-id "$SG" --protocol tcp --port 5432 --cidr "$MY_IP/32" >/dev/null 2>&1 || true

echo "==> Creating RDS Postgres '$DB_ID' ($DB_CLASS) in $REGION"
DB_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))")   # letters, digits, - and _ only
aws_ rds create-db-instance \
  --db-instance-identifier "$DB_ID" \
  --engine postgres \
  --db-instance-class "$DB_CLASS" \
  --allocated-storage 20 --storage-type gp3 --storage-encrypted \
  --db-name "$DB_NAME" \
  --master-username "$DB_USER" --master-user-password "$DB_PASSWORD" \
  --vpc-security-group-ids "$SG" \
  --publicly-accessible \
  --backup-retention-period 1 --no-multi-az --no-deletion-protection \
  --tags Key=project,Value=nexus-hackathon >/dev/null

# Save the secret straight away so a failed wait doesn't lose the password.
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
umask 077
cat > "$OUT" <<ENV
# Shared database for the Nexus team. Copy these two lines into backend/.env on every laptop. Keep private.
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@PENDING_ENDPOINT:5432/$DB_NAME?sslmode=require
JWT_SECRET=$JWT_SECRET
ENV

echo "==> Waiting for the database to be ready (about 10 minutes)"
aws_ rds wait db-instance-available --db-instance-identifier "$DB_ID"
HOST=$(aws_ rds describe-db-instances --db-instance-identifier "$DB_ID" --query 'DBInstances[0].Endpoint.Address' --output text)
sed -i.bak "s/PENDING_ENDPOINT/$HOST/" "$OUT" && rm -f "$OUT.bak"

echo
echo "Done. Shared database: $HOST"
echo "Connection details saved to: $OUT"
echo "Next: copy its two lines into backend/.env on each laptop, add each teammate's IP with allow-ip-shared-db.sh,"
echo "restart the backend, and check http://localhost:8000/api/health says \"postgres (shared)\"."
