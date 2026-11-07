import re

from fastapi import APIRouter, HTTPException, Query

from ..services import calgary

router = APIRouter(prefix="/api/calgary", tags=["calgary open data"])


async def _call(coro):
    try:
        return await coro
    except calgary.CalgaryDataError as e:
        raise HTTPException(502, str(e))


@router.get("/solar/monthly")
async def solar_monthly(months: int = Query(24, ge=1, le=120)):
    """Total solar kWh produced at City of Calgary facilities, per month."""
    return {"source": "City of Calgary Open Data: Monthly Solar Energy Production", "source_url": "https://data.calgary.ca/d/iric-4rrc",
            "rows": await _call(calgary.solar_by_month(months))}


@router.get("/solar/top-sites")
async def solar_top_sites(limit: int = Query(10, ge=1, le=50)):
    return {"source": "City of Calgary Open Data: Monthly Solar Energy Production", "source_url": "https://data.calgary.ca/d/iric-4rrc",
            "rows": await _call(calgary.solar_top_sites(limit))}


@router.get("/dataset/{dataset_id}")
async def dataset(
    dataset_id: str,
    limit: int = Query(100, ge=1, le=5000),
    select: str | None = None,
    where: str | None = None,
    order: str | None = None,
):
    """Generic proxy for ANY data.calgary.ca dataset. Example: /api/calgary/dataset/crbp-innf?limit=5"""
    if not re.fullmatch(r"[a-z0-9]{4}-[a-z0-9]{4}", dataset_id):
        raise HTTPException(400, "dataset_id looks like 'abcd-1234'")
    params = {"$limit": str(limit)}
    for key, value in {"$select": select, "$where": where, "$order": order}.items():
        if value:
            params[key] = value
    return await _call(calgary.query(dataset_id, params))
