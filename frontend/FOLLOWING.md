# Following and followers

Profile includes clickable Followers and Following counts, searchable lists, Find people, and follow/unfollow controls.

## Tracking

`Follow` stores `follower_id`, `following_id`, and `created_at`. If Ana follows Raj, the row is `(Ana.id, Raj.id)`. Ana's following count is the number of rows with Ana as follower. Raj's follower count is the number with Raj as following. Following is directed; following back creates a separate row. The composite primary key prevents duplicates and a check constraint rejects self-follows. Counts are derived from relationships rather than separately incremented counters.

Authenticated endpoints:
- `GET /api/social/me`: people previews (ID and display name only), follower/following IDs and counts.
- `PUT /api/social/following/{id}`: follow; repeated requests are idempotent.
- `DELETE /api/social/following/{id}`: unfollow; repeated requests are idempotent.

The authenticated session supplies the follower identity, never a client-supplied source ID. Account deletion removes incoming and outgoing edges in the same transaction; export includes both. Restart the backend to create the new table through its existing startup initialization. Existing accounts are preserved.

## Try it

Without login, Profile shows explicitly labeled demo people and fixed sample followers. Follow/unfollow updates local browser storage only. Demo relationships never become real account relationships.

For real persistence, run the backend, create two accounts through `/#/signup`, and sign in through `/#/login`. Under Profile, use Find people and follow the other account. Sign in as the other account and open Followers to see the relationship. Use Refresh connections to fetch changes made by another user; there is no live subscription yet. Display names in real lists come from account names, not the separate local prototype profile editor.

The initial account directory returns all other accounts; pagination and server-side search can be added for a larger user base.

## Social links, invitations, and suggestions

Profile now includes optional self-reported Instagram handles and a separate set of interests to share for discovery. Discovery is off by default. Saving with discovery enabled shares those interests for matching and exposes the Instagram link; there is no Instagram login, verification, follower import, or scraping.

`SocialProfile` is a new table created by the existing startup hook. Restart the backend after updating. `GET/PUT /api/social/profile` reads/writes the authenticated user's preferences. Social profile data is included in account export and deleted with the account. These shared interests are separate from the local-only Profile editor and local community memberships.

Suggestions come from overlapping opted-in interests or a two-hop follow path (you follow B, and B follows A). Both users must enable discovery. Suggested people exclude accounts already followed and include reasons. No follow happens automatically. Community membership is not used for real suggestions yet because that feature remains local-only.

An opted-in signed-in user can copy an invitation URL from Profile. `GET /api/social/invite/{token}` exposes only account ID, account name, and the optional Instagram handle. Signed tokens expire after 30 days and have a distinct purpose that cannot authorize account API requests. Disabling discovery or deleting the account makes the invitation unavailable. Recipients can sign up/sign in, return to the invitation, and explicitly follow. No messages are sent automatically. Localhost URLs only work on the originating computer; deployment is needed for sharing across devices.

Guest previews use clearly labeled sample people and locally selected shared interests. Real invitation links require an account and backend. The app does not automatically publish or sync guest data.

## Go together

Profile -> Go together stores server-side availability separately from social discovery. Choose Off, Any event, or selected event IDs, and Everyone (signed-in users), Mutual follows (both directions), or selected people from your following list. Availability never shares location and does not automatically RSVP, message, or match people.

`BuddyPreference` is a new table, created on backend restart without changing existing tables. `GET/PUT /api/buddies/me` reads/writes the authenticated user's preferences. `GET /api/buddies/events/{id}` returns only IDs/display names of other people whose preferences allow that viewer to see their availability. Mutual/selected audiences are checked against live follow edges; unfollowing revokes that audience access. Off overrides all availability and clears existing RSVP buddy flags. Invalid/non-followed selected people are rejected. Account exports include preferences and deletion removes the user's settings and their ID from other selected lists.

General availability is not attendance. Any event can show you as available without creating RSVPs for unselected events. Saving preferences updates buddy flags only on existing RSVPs. Selected-event preferences and explicit event-level Find a buddy requests both contribute to availability. An explicit Find a buddy request can re-enable Selected mode after Off. An active Any event preference continues to apply until changed in Profile; turning off an event RSVP buddy flag alone does not turn off that general availability.

The opened event details show a separate audience-filtered people list and a link back to preferences. The aggregate attendee buddy count continues to count RSVP flags, not every person generally open to going. People-map pins remain labeled demo data. No invitations/acceptance or direct messaging is implemented.

## Attendance calendar

Profile -> Calendar displays only your authenticated RSVPs, including past events, in Calgary time. It supports month navigation and a selected-day agenda; events spanning multiple days appear on each applicable day. Hosting an event alone does not count as attending it: RSVP to include it.

`GET /api/events/attending` returns the signed-in user's visible RSVP events without the Explore feed's 30-day window. `GET /api/events/attending/calendar.ics` exports upcoming or in-progress visible RSVP events using UTC timestamps, escaped text, folded UTF-8 lines, and stable per-event UIDs. Cancelled RSVPs and events whose private access was revoked are excluded. Exports contain no attendee list or authentication tokens.

Each agenda item has Add to Google Calendar, opening an event draft for the user to review/save. The bulk .ics export is imported on Google Calendar's website under Settings -> Import & export. These are one-time copies, not automatic synchronization; later changes or cancellations must be updated in the external calendar. Exported events are marked private, but users should still check the destination calendar's sharing settings. No Google OAuth connection or API key is required.
