# Shared backend on AWS

Target: one API instance in `ca-central-1`, an HTTPS Lightsail container endpoint, and a persistent PostgreSQL database. No resources are provisioned merely by adding these files. Verify the selected compute/database plans and costs before creating them.

## Deployment prerequisites

1. Install AWS CLI v2 and authenticate with `aws login --profile nexus --region ca-central-1`. Authentication happens in your browser; do not paste AWS passwords or access keys into chat. AWS IAM permissions must allow the deployment operations.
2. Start Docker Desktop with Linux containers and install the AWS `lightsailctl` image-push plugin. The existing deployment script runs in Bash (WSL or another Linux environment with Docker access).
3. Create or select a persistent PostgreSQL database reachable from the API. Keep its connection credentials private. Use `postgresql+psycopg://` and TLS settings appropriate to the database. URL-encode special characters in credentials. Restrict database network access according to the selected AWS service.
4. Supply the environment variables in `cloud/shared.env.example` as exported variables. Keep `JWT_SECRET` stable across restarts/redeployments. Supply the Ticketmaster key on the backend only.
5. Run `AWS_PROFILE=nexus ./cloud/aws/deploy-lightsail.sh`. It builds `cloud/Dockerfile.shared`, uses a single API worker, requires PostgreSQL, and passes event configuration to the deployment. The image contains only API code and dependencies, not local databases or `.env` files. The optional ML endpoint is unavailable in this lightweight image.

## Connect every teammate

After the service is running, verify its `/api/health` and `/api/events/status` endpoints. Set each teammate's `frontend/.env` to `VITE_API_URL=https://YOUR-SHARED-API-HOST` and restart Vite. If frontends run on different ports, add each exact origin to backend `CORS_ORIGINS` (for example `http://localhost:5173,http://localhost:5174`). Use the same shared backend/database for every frontend.

Existing local accounts are not automatically copied to PostgreSQL. Start with shared test accounts, or explicitly plan an account migration without deleting local databases. Optional social discovery data and follow relationships are shared; the prototype bio, neighbourhood, community memberships and messages remain browser-local. Deploying alone does not make those fields visible to other users.

## Validation and persistence

Create two test accounts against the shared service, follow one from the other, and verify the follower appears on another device. Restart/redeploy the API and repeat login and relationship checks. Verify that Ticketmaster sync succeeds without printing its API key. Database backups/retention and deletion are separate from deleting the API container service.

Do not run a production database inside the ephemeral API container. The existing local SQLite database remains supported for local development. The PostgreSQL driver and boolean-count compatibility are included, but a live PostgreSQL connection must be tested as part of deployment.
