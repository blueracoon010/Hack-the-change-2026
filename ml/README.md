# ML: models on real AESO data

**Tech stack:** pandas + scikit-learn (HistGradientBoostingRegressor) trained on a year of real hourly Alberta load and pool-price data downloaded from AESO, saved with joblib and served by the backend at `/api/ml/forecast`.

**Caveats:** Use the backend's venv (`backend/.venv`, installed with `requirements-ml.txt`) so the model is trained and served with the same scikit-learn version; the committed `models/ail_forecast.joblib` may fail to load on a different version, and retraining (about 1 minute) fixes that. Voltex judges disqualify made-up or AI-generated data, so only train on real sources.

**What to work on:** Adapt the target and features to your idea (for example, forecast price to tell Calgarians the cheapest hours to run appliances, or add real Calgary temperature from the free [Open-Meteo archive API](https://open-meteo.com/en/docs/historical-weather-api), the biggest accuracy win available).

```bash
source ../backend/.venv/bin/activate
python fetch_aeso.py --days 365   # downloads REAL data -> data/aeso_hourly.csv
python train.py                   # -> models/ail_forecast.joblib + models/metrics.json
```

| File | Purpose |
|---|---|
| `fetch_aeso.py` | Downloads hourly price + Alberta Internal Load from AESO (no key needed) |
| `features.py` | Feature engineering shared by training and prediction (edit only here) |
| `train.py` | Trains, evaluates on the last 30 days against a "same hour yesterday" baseline, and saves the model |
| `predict.py` | `forecast_ail(history)`, the function the backend calls |

Current result: **1.67% average error** (MAE about 180 MW) on the last 30 days, **5.4% better than the baseline**. Quote numbers like these in your pitch, because honest metrics against a baseline impress technical judges.
