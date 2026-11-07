"""Feature engineering shared by training and prediction (keep them in sync by only editing here).

Every feature only looks at data >= 24h in the past, so we can forecast the next 24 hours directly.
"""

import pandas as pd

TARGET = "ail_mw"
FEATURES = ["hour", "dow", "month", "is_weekend", "lag_24", "lag_48", "lag_168", "mean_24_lag_24"]


def build_features(series: pd.Series) -> pd.DataFrame:
    """series: hourly values indexed by a UTC DatetimeIndex (may contain NaN for future hours)."""
    local = series.index.tz_convert("America/Edmonton")
    s = series.astype(float)
    known = s.dropna()
    X = pd.DataFrame(index=series.index)
    X["hour"] = local.hour
    X["dow"] = local.dayofweek
    X["month"] = local.month
    X["is_weekend"] = (local.dayofweek >= 5).astype(int)
    for h in (24, 48, 168):
        X[f"lag_{h}"] = known.shift(freq=f"{h}h").reindex(series.index)
    X["mean_24_lag_24"] = known.rolling("24h").mean().shift(freq="24h").reindex(series.index)
    return X[FEATURES]
