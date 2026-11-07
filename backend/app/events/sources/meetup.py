"""Meetup GraphQL API: https://www.meetup.com/api/guide/  (endpoint https://api.meetup.com/gql-ext)

Caveats (check on the day):
  * Needs an OAuth access token (MEETUP_ACCESS_TOKEN). Meetup has tied API access to Meetup Pro;
    if you can't get a token, leave it blank and this source is skipped.
  * Meetup's public docs don't fully document location search, so QUERY below is our best reading of
    the gql-ext schema (keywordSearch was split into eventSearch/groupSearch). If it errors, open the
    API playground, fix field names in QUERY, and adjust parse(). The rest of the pipeline won't change.
"""

from datetime import datetime, timedelta, timezone

import httpx

from ...config import settings
from ..schemas import EventIn

NAME = "meetup"
URL = "https://api.meetup.com/gql-ext"

QUERY = """
query ($filter: EventSearchFilter!, $first: Int, $after: String) {
  eventSearch(filter: $filter, first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id title description eventUrl dateTime endTime eventType
        venue { name address city state lat lon }
        group { name }
        featuredEventPhoto { baseUrl }
      }
    }
  }
}
"""


def configured() -> bool:
    return bool(settings.meetup_access_token)


def _dt(v: str | None) -> datetime | None:
    return datetime.fromisoformat(v.replace("Z", "+00:00")) if v else None


def parse(node: dict) -> EventIn | None:
    start = _dt(node.get("dateTime"))
    if not start:
        return None
    venue = node.get("venue") or {}
    online = (node.get("eventType") or "").upper() == "ONLINE"
    addr = ", ".join(p for p in [venue.get("address"), venue.get("city"), venue.get("state")] if p)
    photo = (node.get("featuredEventPhoto") or {}).get("baseUrl")
    return EventIn(
        source=NAME,
        source_id=str(node["id"]),
        title=node.get("title") or "Untitled event",
        start=start,
        end=_dt(node.get("endTime")),
        description=(node.get("description") or "")[:2000] or None,
        host=(node.get("group") or {}).get("name"),
        raw_category=(node.get("group") or {}).get("name"),
        scanned_from="Meetup",
        venue_name=venue.get("name"),
        address=addr or None,
        lat=venue.get("lat") or None,  # Meetup uses 0,0 for "no venue"
        lon=venue.get("lon") or None,
        url=node.get("eventUrl"),
        image_url=photo,
        is_online=online,
    )


async def fetch(lat: float, lon: float, radius_km: float, days: int) -> list[EventIn]:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    variables = {
        "first": 100,
        "after": None,
        "filter": {
            "query": "",
            "lat": lat,
            "lon": lon,
            "radius": round(radius_km / 1.609, 1),  # Meetup radius is in miles
            "startDateRange": now.isoformat(),
            "endDateRange": (now + timedelta(days=days)).isoformat(),
        },
    }
    headers = {"Authorization": f"Bearer {settings.meetup_access_token}"}
    out: list[EventIn] = []
    async with httpx.AsyncClient(timeout=20, headers=headers) as client:
        for _ in range(5):
            r = await client.post(URL, json={"query": QUERY, "variables": variables})
            if r.status_code in (401, 403):
                raise RuntimeError(f"Meetup rejected the token ({r.status_code}). Check MEETUP_ACCESS_TOKEN / Pro access.")
            r.raise_for_status()
            body = r.json()
            if body.get("errors"):
                raise RuntimeError(f"Meetup GraphQL error (fix QUERY in sources/meetup.py): {body['errors'][0].get('message')}")
            result = body["data"]["eventSearch"]
            out += [e for e in (parse(edge["node"]) for edge in result.get("edges", [])) if e]
            if not result["pageInfo"]["hasNextPage"]:
                break
            variables["after"] = result["pageInfo"]["endCursor"]
    return out
