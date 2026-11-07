"""Train a next-24h Alberta Internal Load (AIL) forecaster on real AESO data.

    python ml/fetch_aeso.py   # once, to download data
    python ml/train.py

Saves ml/models/ail_forecast.joblib + ml/models/metrics.json. Compares against a "same hour yesterday"
baseline so you can tell judges exactly how much better the model is.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_absolute_percentage_error

from features import FEATURES, TARGET, build_features

HERE = Path(__file__).parent
DATA_PATH = HERE / "data" / "aeso_hourly.csv"
MODEL_DIR = HERE / "models"


def main() -> None:
    if not DATA_PATH.exists():
        raise SystemExit("No data yet. Run: python ml/fetch_aeso.py")

    df = pd.read_csv(DATA_PATH, parse_dates=["time"]).set_index("time").sort_index()
    df.index = pd.to_datetime(df.index, utc=True)
    X = build_features(df[TARGET])
    data = X.join(df[TARGET]).dropna()

    cut = data.index.max() - pd.Timedelta(days=30)  # hold out the most recent 30 days
    train, test = data[data.index <= cut], data[data.index > cut]
    print(f"Train: {len(train):,} rows  |  Test (last 30 days): {len(test):,} rows")

    model = HistGradientBoostingRegressor(max_iter=400, learning_rate=0.05, random_state=42)
    model.fit(train[FEATURES], train[TARGET])
    pred = model.predict(test[FEATURES])

    metrics = {
        "target": TARGET,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "data_source": "AESO Historical Pool Price report (ets.aeso.ca)",
        "train_rows": len(train),
        "test_rows": len(test),
        "mae_mw": round(mean_absolute_error(test[TARGET], pred), 1),
        "mape_pct": round(100 * mean_absolute_percentage_error(test[TARGET], pred), 2),
        "baseline_same_hour_yesterday_mae_mw": round(mean_absolute_error(test[TARGET], test["lag_24"]), 1),
    }
    metrics["improvement_vs_baseline_pct"] = round(
        100 * (1 - metrics["mae_mw"] / metrics["baseline_same_hour_yesterday_mae_mw"]), 1
    )

    # Refit on everything for the deployed model.
    model.fit(data[FEATURES], data[TARGET])
    MODEL_DIR.mkdir(exist_ok=True)
    joblib.dump(model, MODEL_DIR / "ail_forecast.joblib")
    (MODEL_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2))
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
