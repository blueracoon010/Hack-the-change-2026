from fastapi import APIRouter, HTTPException, Query

from ..services import aeso

router = APIRouter(prefix="/api/energy", tags=["energy (AESO)"])


async def _call(coro):
    try:
        return await coro
    except aeso.AesoError as e:
        raise HTTPException(502, str(e))


@router.get("/current")
async def current():
    """Live Alberta load, generation mix by fuel, interchange, renewable share."""
    return await _call(aeso.current_supply_demand())


@router.get("/pool-price")
async def pool_price(days: int = Query(7, ge=1, le=60)):
    """Hourly pool price ($/MWh) and Alberta Internal Load (MW)."""
    return await _call(aeso.pool_price(days))


@router.get("/actual-vs-forecast")
async def actual_vs_forecast(days: int = Query(1, ge=1, le=14)):
    """AESO's own price/load forecast next to actuals (includes upcoming hours of today)."""
    return await _call(aeso.actual_vs_forecast(days))
