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

## Shared database (AWS RDS)

**Why:** each laptop's backend normally uses its own `backend/app.db`, so users on one laptop can't see users on another. With one shared Postgres on AWS, everyone keeps running the app on **localhost**, but all backends read and write the same users, profiles, follows, RSVPs and events. Only one backend calls Ticketmaster every 30 minutes; the others reuse its results.

**Cost:** `db.t4g.micro` + 20 GB in `ca-central-1` is roughly US$15–20/month, paid from AWS credits. Delete it after the hackathon.

**One person sets it up (once the credits are on the account):**
```bash
brew install awscli && aws configure          # access key of the account with the credits, region ca-central-1
AWS_PROFILE=YOUR_PROFILE_HERE ./cloud/aws/create-shared-db.sh   # ~10 min; or leave AWS_PROFILE unset for "default"
```
It prints the endpoint and writes `cloud/aws/.env.shared-db` (git-ignored) containing `DATABASE_URL` and `JWT_SECRET`. Share those two lines privately (DM, not the repo).

**Every teammate:**
1. Paste both lines into `backend/.env` (replacing any existing `JWT_SECRET`).
2. Send the setup person your IP from https://checkip.amazonaws.com; they run `./cloud/aws/allow-ip-shared-db.sh <your-ip>`. Venue Wi-Fi usually means one IP for everyone; add it again if you move.
3. `cd backend && .venv/bin/pip install -r requirements.txt` (adds the Postgres driver), then restart the backend.
4. Check http://localhost:8000/api/health says `"database": "postgres (shared) at nexus-shared-db…"`.
5. Sign up again: accounts in your old local `app.db` are not copied over.

**Caveats:** tables are created automatically on first start, but there are no migrations: if someone changes a table in `models.py`, coordinate before restarting (new tables are fine; new columns on an existing table need it to be dropped). Never run the tests with `TEST_DATABASE_URL` pointing at the shared database (they wipe it). If a backend can't connect, it's almost always the IP allow-list.

**After the hackathon:** `./cloud/aws/teardown-shared-db.sh` deletes the database and all its data.
