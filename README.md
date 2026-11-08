# Nexus

**Never miss out. Never go alone.**

Nexus is a community-events app for Calgary, built for Code the Change YYC 2026.

## The problem

- **Events get missed.** A lot of what's happening in a neighbourhood only lives on paper flyers, on café corkboards and library walls. If you don't walk past at the right time, you never hear about it.
- **Going alone is a barrier.** Even when people find something they'd enjoy, showing up by yourself is hard, so many people stay home.

## What Nexus does

| | |
|---|---|
| **Map of what's on** | The home screen is a map of Calgary events: live listings from Ticketmaster and the City of Calgary, plus events people create in Nexus. Filter by type (tech, social, outdoorsy, arts, food…), introvert or extrovert vibe, date and distance. |
| **My people** | Switch the map to see the people you follow and which events they're going to. |
| **Create events** | Host your own event with From and To dates and a place on the map. Make it **public** (everyone) or **friends only** (people you follow who follow you back). Manage them in *Profile → My events*. |
| **Go together** | RSVP and say you're looking for a buddy, so nobody has to go alone. |
| **Calendar** | Your RSVPs in a calendar, with "Add to Google Calendar" and iCalendar export. |
| **Weather-aware** | Event details show the Calgary forecast for that day. |
| **Communities** | Join interest groups (walking, books, art, coffee) and chat in their channels. |
| **Profiles & invites** | Public or private profile, interests, invite friends with a code or link. |
| **Accessible** | Light and dark mode, text size, high contrast, reduced motion, keyboard navigation and screen-reader labels. |

## How it's built

| Folder | What it is |
|---|---|
| [`frontend/`](frontend/README.md) | React 19 + TypeScript + Vite + Tailwind. Runs in the browser or as an Electron desktop app. Maps use OpenStreetMap (Leaflet), or Google Maps if you add a key. |
| [`backend/`](backend/README.md) | FastAPI + SQLModel API: accounts, events, RSVPs, follows, communities. Uses SQLite by default or a shared Postgres database. |
| [`backend/app/events/`](backend/app/events/README.md) | Event sync from Ticketmaster and City of Calgary open data, geocoding, and the events API. |
| [`cloud/`](cloud/README.md) | Docker and AWS deployment, plus the shared team database. |
| [`ml/`](ml/README.md) | Model training left over from the starter template. |

---

## Run it locally

You run two things, each in its own terminal: the **backend** (API on http://localhost:8000) and the **frontend** (app on http://localhost:5173).

### What you need

- **Python 3.12 or newer**: [python.org/downloads](https://www.python.org/downloads/)
- **Node.js 22.12 or newer** (the LTS version is fine): [nodejs.org](https://nodejs.org/)
- **Git**

Check what you have:

```bash
python3 --version   # Windows: python --version
node --version
```

### 1. Get the code

```bash
git clone <this repo's URL>
cd Hack-the-change-2026
```

### 2. Configure (once)

Copy the example settings files. Every value has a working default for local development.

**macOS / Linux**

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

**Windows (PowerShell)**

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

Set in `backend/.env`:

- `TICKETMASTER_API_KEY`: a free key from [developer.ticketmaster.com](https://developer.ticketmaster.com). Without it, the map still shows City of Calgary events (free, no key) and events created in Nexus.
- `DATABASE_URL` and `JWT_SECRET`: leave these alone to use a local SQLite file (`backend/app.db`) that only you can see. To share users and events with the team, paste the values from the team's shared database settings (see [cloud/README.md](cloud/README.md)). Never commit `.env` files.

### 3. Start the backend (terminal 1)

**macOS / Linux**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Windows (PowerShell)**

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```
The API is up when you see `Uvicorn running on http://127.0.0.1:8000`. Interactive API docs: http://localhost:8000/docs.

Next time you only need to activate the environment (`source .venv/bin/activate` or `.\.venv\Scripts\Activate.ps1`) and run `uvicorn app.main:app --reload`.

### 4. Start the frontend (terminal 2)

Same on every OS:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and create an account.

Prefer a desktop window? Run `npm run desktop` instead of `npm run dev` to open it in Electron (with hot reload).

### Handy commands

| Where | Command | What it does |
|---|---|---|
| `backend/` | `pytest` | Runs the API tests |
| `frontend/` | `npm run typecheck` | Checks the TypeScript |
| `frontend/` | `npm run build` | Production build into `frontend/dist` |
| `frontend/` | `npm run desktop:prod` | Builds and opens the desktop app |

## Deploying

See [cloud/README.md](cloud/README.md) for Docker and AWS (Lightsail, Canadian region), and [cloud/SHARED-DEPLOYMENT.md](cloud/SHARED-DEPLOYMENT.md) for the shared team setup.
