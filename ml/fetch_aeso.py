"""Download REAL hourly Alberta pool price + load (AIL) history from AESO into ml/data/aeso_hourly.csv.

    python ml/fetch_aeso.py              # last 365 days
    python ml/fetch_aeso.py --days 730   # two years

Pulls in 60-day chunks from AESO's public Historical Pool Price report (no API key).
"""

import argparse
import csv
import io
import re
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pandas as pd

URL = "http://ets.aeso.ca/ets_web/ip/Market/Reports/HistoricalPoolPriceReportServlet"
EDMONTON = ZoneInfo("America/Edmonton")
DATA_PATH = Path(__file__).parent / "data" / "aeso_hourly.csv"


def _num(v: str) -> float | None:
    try:
        return float(v.replace(",", "").strip())
    except ValueError:
        return None


def parse(text: str) -> list[dict]:
    lines = text.splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith("Date (HE)"))
    rows, seen = [], {}
    for row in csv.reader(io.StringIO("\n".join(lines[start + 1:]))):
        if not row or not re.match(r"\d{2}/\d{2}/\d{4} \d{2}", row[0]):
            continue
        day = row[0][:10]
        n = seen.get(day, 0)
        seen[day] = n + 1  # counting hours handles DST days (23 or 25 rows)
        midnight = datetime.strptime(day, "%m/%d/%Y").replace(tzinfo=EDMONTON).astimezone(timezone.utc)
        price, ail = _num(row[1]), _num(row[3]) if len(row) > 3 else None
        if price is None or ail is None:
            continue
        rows.append({"time": midnight + timedelta(hours=n), "price": price, "ail_mw": ail})
    return rows


def fetch(days: int) -> pd.DataFrame:
    end = datetime.now(EDMONTON).date()
    start: date = end - timedelta(days=days)
    rows: list[dict] = []
    with httpx.Client(timeout=60, follow_redirects=True) as client:
        chunk_start = start
        while chunk_start <= end:
            chunk_end = min(chunk_start + timedelta(days=59), end)
            print(f"  fetching {chunk_start} -> {chunk_end}")
            r = client.get(URL, params={
                "beginDate": chunk_start.strftime("%m%d%Y"),
                "endDate": (chunk_end + timedelta(days=1)).strftime("%m%d%Y"),
                "contentType": "csv",
            })
            r.raise_for_status()
            rows += parse(r.text)
            chunk_start = chunk_end + timedelta(days=1)
            time.sleep(0.5)  # be polite to AESO
    df = pd.DataFrame(rows).drop_duplicates("time").sort_values("time")
    return df


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=365)
    args = ap.parse_args()
    df = fetch(args.days)
    DATA_PATH.parent.mkdir(exist_ok=True)
    df.to_csv(DATA_PATH, index=False)
    print(f"Saved {len(df):,} hourly rows ({df['time'].min()} to {df['time'].max()}) -> {DATA_PATH}")
