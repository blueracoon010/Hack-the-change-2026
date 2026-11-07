"""Keep tests offline and independent of anyone's backend/.env (real env vars win over .env)."""

import os

os.environ["TICKETMASTER_API_KEY"] = ""
os.environ["MEETUP_ACCESS_TOKEN"] = ""
os.environ["EVENTS_SYNC_MINUTES"] = "0"
