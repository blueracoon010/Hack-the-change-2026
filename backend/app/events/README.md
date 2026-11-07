# Events → map (backend)

**Tech stack:** The backend pulls **real** events from the Ticketmaster Discovery API and the Meetup GraphQL API every 30 minutes, adds users' own (flyer) events, turns addresses into map pins with OpenStreetMap Nominatim (cached), and saves everything in the `Event` table. The map reads it from `GET /api/events` in exactly the `NexusEvent` shape used by `frontend/src/lib/nexus.ts`.

**Caveats:** Ticketmaster needs a free key (developer.ticketmaster.com → My Apps → Consumer Key, 5000 calls/day) in `backend/.env` as `TICKETMASTER_API_KEY`. Meetup needs an OAuth token (`MEETUP_ACCESS_TOKEN`) and may need Meetup Pro; its query in `sources/meetup.py` is untested, so fix the field names in the API playground if it errors. With no keys the map only shows community-posted events: nothing is ever faked (Voltex/Clio). There are no migrations, so if you change `models.py`, delete `backend/app.db` (local dev only).

**What to work on:** Replace `SAMPLE_EVENTS` in the Explore page with the snippet below. Show `/api/events/status` somewhere ("Updated 5 min ago from Ticketmaster, Meetup") for transparency. Add the flyer scanner → `POST /api/events`. Tune `classify.py` keywords.

## How it works

```
sources/ticketmaster.py ┐
sources/meetup.py       ┼─> sync.py ──> classify.py (categories, vibe) ──> geocode.py (address → lat/lon) ──> Event table
POST /api/events (flyer)┘   every EVENTS_SYNC_MINUTES, upsert by (source, source_id), drops past events
                                                                                          │
Explore map  <──  GET /api/events?lat=&lng=&bbox=&category=...  (router.py)  <────────────┘
```

| File | What it does |
|---|---|
| `models.py` | Tables: `Event`, `EventRsvp` (real going/buddy counts), `GeocodeCache`, `SyncRun` |
| `schemas.py` | `EventOut` = `NexusEvent` + extras (`source`, `url`, `imageUrl`, `distanceKm`, `meGoing`, `mine`, `end`, `isOnline`) |
| `sources/` | One file per source with `configured()` and `fetch()`. Add Eventbrite/City of Calgary here |
| `classify.py` | Keyword rules that turn source labels into app categories and introvert/extrovert vibe (explainable) |
| `geocode.py` | Nominatim, 1 request/s, Calgary-biased, cached forever |
| `sync.py` | Runs all sources, never lets one broken source break the others |
| `router.py` | The endpoints below |

## Endpoints (try them at http://localhost:8000/docs#/events)

| Endpoint | Notes |
|---|---|
| `GET /api/events` | Public. Filters: `lat`,`lng` (adds `distanceKm`, nearest first), `radiusKm`, `bbox=west,south,east,north`, `from`,`to` (ISO, default now→30 days), `category` (repeatable), `vibe`, `q`, `source`, `includeOnline`, `limit` |
| `GET /api/events/geojson` | Same filters, GeoJSON FeatureCollection |
| `GET /api/events/{id}` | One event |
| `GET /api/events/status` | Per source: configured, event count, last sync time, last error |
| `POST /api/events/sync` | Signed in. Pull from sources now (handy right before the demo) |
| `POST /api/events` | Signed in. Community/flyer event, same field names as `NexusEvent`; needs `address` or `position` |
| `DELETE /api/events/{id}` | Signed in, your own events only |
| `PUT` / `DELETE /api/events/{id}/rsvp` | Signed in. Body `{"lookingForBuddy": true}`; updates `going` / `lookingForBuddy` |

Account export/deletion (`/api/users/me`) includes the user's posted events and RSVPs.

## Frontend: swap sample data for live events

```tsx
// src/lib/nexus.ts
export type ApiEvent = Omit<NexusEvent, 'start'> & {
  start: string; end: string | null; source: 'ticketmaster' | 'meetup' | 'community'
  url: string | null; imageUrl: string | null; isOnline: boolean
  distanceKm: number | null; meGoing: boolean; mine: boolean
}
export const fromApi = (e: ApiEvent) => ({ ...e, start: new Date(e.start) }) // a NexusEvent plus the extras

// src/pages/Explore.tsx (instead of SAMPLE_EVENTS)
const { data, loading, error, reload } = useApi<ApiEvent[]>(`/api/events?lat=${here.lat}&lng=${here.lng}`, { refreshMs: 5 * 60_000 })
const events = useMemo(() => (data ?? []).map(fromApi), [data])
```

Show a "Get tickets / RSVP" button linking to `url` for Ticketmaster and Meetup events (their terms want people sent to the source page), and credit the source on each card (`scannedFrom`).

## Quick check

```bash
cd backend && source .venv/bin/activate
python -m pytest -q tests/test_events.py
curl -s localhost:8000/api/events/status
```
