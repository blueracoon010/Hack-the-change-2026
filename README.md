
# Nexus

**Never miss out. Never go alone.**

Nexus is a community-events app designed to help young people, newcomers, and individuals experiencing social isolation build meaningful connections in Calgary.

Whether you're new to the city, settling into a different neighbourhood, or simply looking to expand your social circle, Nexus helps you discover what's happening around you, find people to attend events with, and turn shared experiences into lasting friendships.

## Who it's for

Moving somewhere new or trying to find your place in an existing community can be isolating. Young people, newcomers, and individuals without an established local support network often face barriers to discovering community activities, meeting like-minded people, and feeling comfortable participating in social events.

Nexus is designed to make that first step easier. It helps people discover nearby activities, connect with others who share their interests, and find companions to attend events with. By creating opportunities for low-pressure social interactions, Nexus aims to make community participation more accessible and help turn first encounters into meaningful relationships.

## Focus areas

Nexus addresses the **Community Connection & Inclusion** challenge.

| Focus area | How Nexus does it |
|---|---|
| **Reduce loneliness among vulnerable populations** (young people, newcomers, and individuals experiencing social isolation) | "Wants company" buddy requests so nobody has to attend events alone, introvert-friendly event descriptions, friends' schedules side by side to coordinate meetups, direct messaging, and a private journal for personal reflection. |
| **Encourage neighbourhood engagement** (volunteering, skill-sharing, and community building) | An interactive map of local events (clean-ups, workshops, recreation-centre activities, and meetups), the ability for anyone to host their own events, interest-based communities with chat channels, and badges that encourage participation and community involvement. |

## The problem

- **Events get missed.** Many neighbourhood activities are advertised through physical flyers, community boards, libraries, and local businesses. People who aren't already connected to these spaces can easily miss opportunities to participate.
- **Going alone is a barrier.** Even when people discover activities that interest them, attending unfamiliar events without someone they know can feel intimidating. This can discourage participation and reinforce social isolation.
- **Finding your community takes time.** Meeting people with shared interests and building meaningful relationships can be challenging, especially when starting from scratch in a new environment.

## The solution

Nexus addresses these barriers by bringing local events and social connections together in one platform. Users can discover activities around them, find companions through buddy requests, connect with interest-based communities, and create their own events.

**Nexus doesn't just help people find events. It helps them find their people.**


## What Nexus does

### Find what's on

| | |
|---|---|
| **Map of what's on** | The Explore screen is a map of Calgary events: live listings from Ticketmaster, Meetup and the City of Calgary, plus events people create in Nexus, with event photos on cards and in details. |
| **Filters** | Filter by type (tech, social, outdoorsy, arts, food…), ntrovert / extrovert / mixed vibe, date or a specific day, distance from you or any spot you tap on the map, and keyword search. Show only friends' events, or only events where someone wants company. |
| **Weather-aware** | Event details show the Calgary forecast for that day, with a tip when an outdoor event looks cold, snowy or wet. |
| **Saved events** | Bookmark events to your profile and jump back to them on the map. |

### Never go alone

| | |
|---|---|
| **Wants company** | RSVP and say you're looking for a buddy. Friends' buddy requests show on the map, and one tap says "I'll go with you". |
| **Buddy preferences** | Choose whether you're open to going with someone for any event or only selected ones, and who can ask: everyone, mutual friends, or people you choose. |
| **Plan with friends** | See your week beside your friends' weeks, spot shared free windows, and get events that fit. Make a plan at a suggested event or copy an invite. |
| **Your schedule** | Block time by hand (busy, work, class, me time, open to plans, weekly repeat) or link Google Calendar through its iCal address or an `.ics` import. Friends only ever see that you're busy, never what. |

### Build community

| | |
|---|---|
| **Create events** | Host your own event with From and To dates and a place on the map, such as a walk, a skill-share or a volunteer day. Make it **public** (everyone) or **friends only** (people you follow who follow you back). |
| **Communities** | Join interest groups (walking, books, art, coffee and more) and chat in channels with welcome notes for new members. Create your own public or friends-only community, and add friends straight from the chat. |
| **Direct messages** | Private one-to-one chats with friends. |
| **Follow** | Follow people. Private profiles get follow requests that you accept or decline. |
| **Profiles & invites** | Profile photo, interests, social links, memories from events you went to, and an invite code or link to bring a friend in. View other members' profiles. |
| **Badges** | Add a photo from an event you attended and earn milestone and connection badges. |

### Look after yourself

| | |
|---|---|
| **Journal** | Private notes with a mood (great, grateful, tired, anxious…) that save as you type. Only you can see them. |
| **Affirmations** | Flashcards of positive affirmations on happiness and belonging. |

### Stay on track

| | |
|---|---|
| **Calendar** | Your RSVPs in a calendar, with "Add to Google Calendar" and iCalendar export. |
| **Reminders** | An email the day before an event you're going to. |
| **Privacy controls** | Public or private profile, a switch for sharing free/busy with friends, and account deletion in *Settings*. |
| **Accounts** | Sign up, log in, and reset a forgotten password by email. |

## How it's built

| Folder | What it is |
|---|---|
| [`frontend/`](frontend/README.md) | React 19 + TypeScript + Vite + Tailwind. Runs in the browser or as an Electron desktop app. Maps use OpenStreetMap (Leaflet), or Google Maps if you add a key. |
| [`backend/`](backend/README.md) | FastAPI + SQLModel API: accounts, events, RSVPs, buddy matching, follows, communities, direct messages, schedules, badges and the journal. Uses SQLite by default or a shared Postgres database. `scripts/seed_demo.py` fills it with demo friends, a buddy request, a DM and a busy week. |
| [`backend/app/events/`](backend/app/events/README.md) | Event sync from Ticketmaster, Meetup and City of Calgary open data, geocoding, reminders and the events API. |
| [`cloud/`](cloud/README.md) | Docker and AWS deployment (Canadian region), plus the shared team database. |

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
