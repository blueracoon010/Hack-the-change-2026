"""Inference helpers used by the backend (/api/ml/forecast)."""

import json
from functools import lru_cache
from pathlib import Path

import joblib
import pandas as pd

try:  # works both as `ml.predict` (backend) and `predict` (scripts in this folder)
    from .features import FEATURES, build_features
except ImportError:
    from features import FEATURES, build_features

MODEL_DIR = Path(__file__).parent / "models"
MODEL_PATH = MODEL_DIR / "ail_forecast.joblib"


def model_available() -> bool:
    return MODEL_PATH.exists()


@lru_cache(maxsize=1)
def _model():
    return joblib.load(MODEL_PATH)


def model_info() -> dict:
    path = MODEL_DIR / "metrics.json"
    return json.loads(path.read_text()) if path.exists() else {}


def forecast_ail(history: list[dict], hours: int = 24) -> list[dict]:
    """history: rows like {"time": iso, "ail_mw": float} (needs >= 8 days). Returns the next `hours` hours."""
    s = pd.Series(
        [r.get("ail_mw") for r in history],
        index=pd.to_datetime([r["time"] for r in history], utc=True),
        dtype=float,
    ).sort_index()
    s = s[~s.index.duplicated()].dropna()
    future = pd.date_range(s.index.max() + pd.Timedelta(hours=1), periods=hours, freq="h")
    full = pd.concat([s, pd.Series(index=future, dtype=float)])
    X = build_features(full).loc[future]
    preds = _model().predict(X[FEATURES])
    local = future.tz_convert("America/Edmonton")
    return [{"time": t.isoformat(), "predicted_ail_mw": round(float(p), 1)} for t, p in zip(local, preds)]
