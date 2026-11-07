# Event map homepage

The Home route uses Leaflet and OpenStreetMap tiles (internet required), with six explicitly fictional Calgary sample events. Existing sign-in requirements remain in place.

Run `npm run dev` in `frontend/` and sign in to view Home. The project tooling requires Node 22.12+ (or another version supported by Vite).

## Ticketmaster handoff

Replace `getEvents()` in `src/lib/events.ts` with a call to your backend. Return `CommunityEvent[]`; the UI does not depend on Ticketmaster's raw response shape. Map the provider event ID, title, classification, venue coordinates, start datetime with timezone, and price into this contract. For missing prices, extend the contract to represent unknown pricing rather than treating it as free. Community-only demo entries are illustrative and are not claimed to exist in Ticketmaster.

Search and category/free filters update both markers and results. Selecting a marker or card opens details. Directions opens Google Maps. Bookmarks are temporary for the current page session; they are not saved to an account.
