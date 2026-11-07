"""Serves the model trained in /ml. Optional: works only after `python ml/train.py` and with ML deps installed."""

import sys

from fastapi import APIRouter, HTTPException

from ..config import REPO_ROOT
from ..services import aeso

router = APIRouter(prefix="/api/ml", tags=["ml"])

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@router.get("/forecast")
async def forecast(hours: int = 24):
    try:
        from ml import predict  # imported lazily so the API runs without pandas/sklearn installed
    except ImportError as e:
        raise HTTPException(503, f"ML dependencies not installed ({e.name}). Run: pip install -r requirements-ml.txt")
    if not predict.model_available():
        raise HTTPException(503, "No trained model yet. Run: python ml/fetch_aeso.py && python ml/train.py")

    try:
        history = (await aeso.pool_price(14))["rows"]
    except aeso.AesoError as e:
        raise HTTPException(502, str(e))

    return {
        "model": predict.model_info(),
        "history": history[-48:],
        "forecast": predict.forecast_ail(history, hours=min(max(hours, 1), 24)),
    }
