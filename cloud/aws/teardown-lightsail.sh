#!/usr/bin/env bash
# Delete the Lightsail container service after the hackathon so it stops billing.
set -euo pipefail
SERVICE="${SERVICE:-spark-api}"
REGION="${AWS_REGION:-ca-central-1}"
read -r -p "Delete Lightsail service '$SERVICE' in $REGION? [y/N] " ok
[[ "$ok" == "y" ]] && aws lightsail delete-container-service --service-name "$SERVICE" --region "$REGION" && echo "Deleted."
