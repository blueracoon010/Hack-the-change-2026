#!/usr/bin/env bash
# Deploy the backend container to AWS Lightsail Containers (~US$7/month for "micro"; covered by AWS credits).
#
#   export JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
#   ./cloud/aws/deploy-lightsail.sh
#
# Needs: Docker running, AWS CLI v2 logged in (aws configure / aws sso login), and the lightsailctl plugin:
#   brew install aws/tap/lightsailctl
# Re-run the script any time to ship a new version.
set -euo pipefail

SERVICE="${SERVICE:-spark-api}"
REGION="${AWS_REGION:-ca-central-1}"   # Montreal: keeps Canadian user data in Canada
POWER="${POWER:-micro}"
: "${JWT_SECRET:?Set JWT_SECRET first (see top of this file)}"

cd "$(dirname "$0")/../.."
aws_ls() { aws lightsail "$@" --region "$REGION"; }
state() { aws_ls get-container-services --service-name "$SERVICE" --query 'containerServices[0].state' --output text; }

echo "==> Building image"
docker build --platform linux/amd64 -f cloud/Dockerfile -t "$SERVICE:latest" .

if ! aws_ls get-container-services --service-name "$SERVICE" >/dev/null 2>&1; then
  echo "==> Creating Lightsail container service '$SERVICE' ($POWER) in $REGION"
  aws_ls create-container-service --service-name "$SERVICE" --power "$POWER" --scale 1 >/dev/null
fi

echo "==> Waiting for service to be ready"
until [[ "$(state)" =~ ^(READY|RUNNING)$ ]]; do sleep 15; echo "    state: $(state)"; done

echo "==> Pushing image"
aws_ls push-container-image --service-name "$SERVICE" --label api --image "$SERVICE:latest" >/dev/null
IMAGE=$(aws_ls get-container-images --service-name "$SERVICE" --query 'containerImages[0].image' --output text)

echo "==> Deploying $IMAGE"
DB_ENV=""
if [[ -n "${DATABASE_URL:-}" ]]; then DB_ENV=", \"DATABASE_URL\": \"$DATABASE_URL\""; fi
CONTAINERS=$(cat <<EOF
{"api": {"image": "$IMAGE", "ports": {"8000": "HTTP"},
  "environment": {"JWT_SECRET": "$JWT_SECRET", "CORS_ORIGINS": "${CORS_ORIGINS:-http://localhost:5173,file://,null}"$DB_ENV}}}
EOF
)
aws_ls create-container-service-deployment --service-name "$SERVICE" --containers "$CONTAINERS" \
  --public-endpoint '{"containerName": "api", "containerPort": 8000, "healthCheck": {"path": "/api/health"}}' >/dev/null

until [[ "$(state)" == "RUNNING" ]]; do sleep 15; echo "    state: $(state)"; done
URL=$(aws_ls get-container-services --service-name "$SERVICE" --query 'containerServices[0].url' --output text)
echo
echo "Deployed: ${URL}api/health"
echo "Point the app at it: echo 'VITE_API_URL=${URL%/}' > frontend/.env"
