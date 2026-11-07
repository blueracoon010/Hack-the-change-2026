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
: "${DATABASE_URL:?Set DATABASE_URL to a persistent PostgreSQL database before deploying}"
: "${CORS_ORIGINS:?Set CORS_ORIGINS to the frontend origins your team uses}"
[[ "$DATABASE_URL" == postgresql+psycopg://* ]] || { echo "Use postgresql+psycopg:// for the shared database." >&2; exit 1; }
[[ ${#JWT_SECRET} -ge 32 ]] || { echo "JWT_SECRET must be at least 32 characters." >&2; exit 1; }

cd "$(dirname "$0")/../.."
aws_ls() { aws lightsail "$@" --region "$REGION"; }
state() { aws_ls get-container-services --service-name "$SERVICE" --query 'containerServices[0].state' --output text; }

echo "==> Building image"
docker build --platform linux/amd64 -f cloud/Dockerfile.shared -t "$SERVICE:latest" .

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
# JSON encoding preserves special characters in secrets. Pipe the request so
# credentials aren't placed in command arguments or persisted to a JSON file.
export SERVICE IMAGE
python3 - <<'PY' | aws_ls create-container-service-deployment --cli-input-json file:///dev/stdin >/dev/null
import json, os
names = ('JWT_SECRET', 'DATABASE_URL', 'CORS_ORIGINS', 'TICKETMASTER_API_KEY',
         'MEETUP_ACCESS_TOKEN', 'EVENTS_SYNC_MINUTES', 'EVENTS_DAYS_AHEAD',
         'EVENTS_RADIUS_KM', 'EVENTS_CENTER_LAT', 'EVENTS_CENTER_LON',
         'GEOCODER_USER_AGENT')
environment = {name: os.environ[name] for name in names if name in os.environ}
print(json.dumps({
    'serviceName': os.environ['SERVICE'],
    'containers': {'api': {'image': os.environ['IMAGE'], 'ports': {'8000': 'HTTP'}, 'environment': environment}},
    'publicEndpoint': {'containerName': 'api', 'containerPort': 8000, 'healthCheck': {'path': '/api/health'}},
}))
PY

until [[ "$(state)" == "RUNNING" ]]; do sleep 15; echo "    state: $(state)"; done
URL=$(aws_ls get-container-services --service-name "$SERVICE" --query 'containerServices[0].url' --output text)
echo
echo "Deployed: ${URL}api/health"
echo "Point the app at it: echo 'VITE_API_URL=${URL%/}' > frontend/.env"
