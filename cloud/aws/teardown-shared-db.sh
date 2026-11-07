#!/usr/bin/env bash
# Delete the shared database after the hackathon so it stops using credits. ALL users and data in it are lost.
set -euo pipefail
DB_ID="${DB_ID:-nexus-shared-db}"
REGION="${AWS_REGION:-ca-central-1}"
SG_NAME="${SG_NAME:-nexus-shared-db-sg}"
read -r -p "Permanently delete RDS database '$DB_ID' in $REGION and all its data? Type the name to confirm: " ok
[[ "$ok" == "$DB_ID" ]] || { echo "Cancelled."; exit 1; }
aws rds delete-db-instance --region "$REGION" --db-instance-identifier "$DB_ID" --skip-final-snapshot --delete-automated-backups >/dev/null
echo "Deleting (a few minutes)..."
aws rds wait db-instance-deleted --region "$REGION" --db-instance-identifier "$DB_ID"
SG=$(aws ec2 describe-security-groups --region "$REGION" --filters Name=group-name,Values="$SG_NAME" --query 'SecurityGroups[0].GroupId' --output text)
[[ -n "$SG" && "$SG" != "None" ]] && aws ec2 delete-security-group --region "$REGION" --group-id "$SG" || true
rm -f "$(dirname "$0")/.env.shared-db"
echo "Deleted."
