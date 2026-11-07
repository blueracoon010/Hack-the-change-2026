# Cloud: Docker + AWS

**Tech stack:** One Docker image (Python 3.13, FastAPI backend with the ML model trained during the build), run locally with Docker Compose and deployed to **AWS Lightsail Containers** in `ca-central-1` (Montreal, so Canadian data stays in Canada).

**Caveats:** You need Docker Desktop, AWS CLI v2 logged in (`aws configure`), and the `lightsailctl` plugin (`brew install aws/tap/lightsailctl`). SQLite inside the container is wiped on every redeploy, so for persistent users set `DATABASE_URL` to a Postgres database (Lightsail or RDS) and add `psycopg[binary]` to `backend/requirements.txt`. Run `teardown-lightsail.sh` afterwards so it stops billing.

**What to work on:** Usually nothing until the end. Deploy once early on the day to confirm it works, then redeploy before judging and point the app at the URL with `VITE_API_URL`. This is optional, because the demo can run fully on localhost.

```bash
# Local Docker (from repo root)
docker compose -f cloud/docker-compose.yml up --build

# Deploy to AWS (from repo root)
export JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
./cloud/aws/deploy-lightsail.sh          # prints the public URL when done
./cloud/aws/teardown-lightsail.sh        # delete after the hackathon
```

Why Lightsail and not App Runner: AWS stopped accepting new App Runner customers on April 30, 2026. If you'd rather use ECS, the same image works with ECS Express Mode.
