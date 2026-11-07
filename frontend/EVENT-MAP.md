# Integrated event map

The main route now uses the team's `Explore.tsx` / `NexusMap.tsx`, reading real event data from `GET /api/events`. Profile, Community, Settings, and invitations remain available. Sign-in is required for the app pages. The previous `Home.tsx` sample-map implementation is retained but is not routed as the homepage.

## Run

Start the backend from `backend/` with `.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload`.
Start the frontend from `frontend/` with `npm run dev` and open http://localhost:5173.

## Ticketmaster setup

Add `TICKETMASTER_API_KEY=your_consumer_key` to `backend/.env` (keep this file private), then restart the backend. No Ticketmaster key was configured on this machine during integration. With the default `EVENTS_SYNC_MINUTES=30`, the backend starts a sync immediately and repeats it every 30 minutes. Wait for that first sync, then use Retry / refresh the map; the feed also refreshes every five minutes. If automatic syncing is disabled, sign in and use `POST /api/events/sync` in the API docs.

Check http://localhost:8000/api/events/status for configured sources and sync results, and http://localhost:8000/api/events for listings. With no source keys the map displays only real community-posted events, which may mean no pins. No sample events are substituted into the main feed.

Google Maps is optional: add `VITE_GOOGLE_MAPS_API_KEY` to `frontend/.env` to use it. Otherwise OpenStreetMap/Leaflet works without a map API key. Internet is required for map tiles.

Map RSVPs/buddy requests use authenticated backend endpoints; browsing the app requires login. Bookmarks/reminder controls and the people-map previews are still local/demo features. Manage actual followers and following under Profile. Profile/Community logic was preserved during the merge.

Node 22.12+ is recommended by the current Vite tooling. Backend tests and the production build are the integration checks; live Ticketmaster testing needs a configured key.
