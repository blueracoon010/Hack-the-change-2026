"""City of Calgary Open Data (Socrata / SODA API). Browse datasets at https://data.calgary.ca.

Every dataset has an id like 'iric-4rrc' (in its URL). Query with SoQL: $select, $where, $group, $order, $limit.
"""

import httpx

from ..cache import ttl_cache
from ..config import settings

BASE = "https://data.calgary.ca/resource"
SOLAR_MONTHLY = "iric-4rrc"  # Monthly Solar Energy Production (kWh) at City facilities


class CalgaryDataError(RuntimeError):
    pass


async def query(dataset_id: str, params: dict[str, str]) -> list[dict]:
    headers = {"X-App-Token": settings.calgary_app_token} if settings.calgary_app_token else {}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(f"{BASE}/{dataset_id}.json", params=params, headers=headers)
    except httpx.HTTPError as e:
        raise CalgaryDataError(f"Could not reach Calgary Open Data: {e}") from e
    if r.status_code >= 400:
        raise CalgaryDataError(f"Calgary Open Data error {r.status_code}: {r.text[:300]}")
    return r.json()


@ttl_cache(3600)
async def solar_by_month(months: int = 24) -> list[dict]:
    rows = await query(SOLAR_MONTHLY, {
        "$select": "period, sum(solar_pv_production_kwh) as kwh, count(facility_name) as sites",
        "$group": "period",
        "$order": "period DESC",
        "$limit": str(months),
    })
    return [{"period": r["period"], "kwh": float(r["kwh"]), "sites": int(r["sites"])} for r in reversed(rows)]


@ttl_cache(3600)
async def solar_top_sites(limit: int = 10) -> list[dict]:
    rows = await query(SOLAR_MONTHLY, {
        "$select": "facility_name, facility_address, sum(solar_pv_production_kwh) as kwh",
        "$group": "facility_name, facility_address",
        "$order": "kwh DESC",
        "$limit": str(limit),
    })
    return [{"name": r["facility_name"].strip().title(), "address": r.get("facility_address"), "kwh": float(r["kwh"])} for r in rows]
