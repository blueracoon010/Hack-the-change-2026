"""Real Alberta grid data from AESO's public ETS reports (no API key needed).

Reports used (all public, updated live by AESO):
  - Current Supply Demand (CSD): live load, generation by fuel, interchange. Updates every ~1-2 min.
  - Historical Pool Price: hourly price + Alberta Internal Load (AIL).
  - Actual / Forecast: AESO's own price + load forecast vs actuals.

Hour-ending (HE) rows are converted to the START of the hour as timezone-aware ISO strings (America/Edmonton).
"""

import csv
import html
import io
import re
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx

from ..cache import ttl_cache

ETS = "http://ets.aeso.ca/ets_web/ip/Market/Reports"
CSD_URL = f"{ETS}/CSDReportServlet"
POOL_PRICE_URL = f"{ETS}/HistoricalPoolPriceReportServlet"
ACTUAL_FORECAST_URL = f"{ETS}/ActualForecastWMRQHReportServlet"
EDMONTON = ZoneInfo("America/Edmonton")
RENEWABLE_FUELS = {"WIND", "SOLAR", "HYDRO"}


class AesoError(RuntimeError):
    pass


async def _get_text(url: str, params: dict | None = None) -> str:
    try:
        async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
            r = await client.get(url, params=params, headers={"User-Agent": "ctc-hackathon-app/0.1"})
            r.raise_for_status()
            return r.text
    except httpx.HTTPError as e:
        raise AesoError(f"Could not reach AESO ({url}): {e}") from e


def _num(value: str) -> float | None:
    value = value.replace(",", "").replace("$", "").strip()
    try:
        return float(value)
    except ValueError:
        return None


def _slug(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")


# ---------- Current Supply Demand ----------

def parse_csd(page: str) -> dict:
    tokens = [html.unescape(t).strip() for t in re.split(r"<[^>]+>", page)]
    tokens = [t for t in tokens if t]

    last_update = next((t.split(":", 1)[1].strip() for t in tokens if t.startswith("Last Update")), None)

    def index_of(label: str, start: int = 0) -> int:
        for i in range(start, len(tokens)):
            if tokens[i] == label:
                return i
        raise AesoError(f"Unexpected CSD report format (missing '{label}')")

    summary: dict[str, float | None] = {}
    i = index_of("SUMMARY") + 1
    while i + 1 < len(tokens) and tokens[i] != "GENERATION":
        summary[_slug(tokens[i])] = _num(tokens[i + 1])
        i += 2

    generation = []
    i = index_of("DCR", index_of("GENERATION")) + 1
    while i + 3 < len(tokens) and tokens[i] != "TOTAL":
        generation.append({
            "fuel": tokens[i].title(),
            "max_capability_mw": _num(tokens[i + 1]),
            "net_generation_mw": _num(tokens[i + 2]),
            "dispatched_reserve_mw": _num(tokens[i + 3]),
        })
        i += 4

    interchange = []
    i = index_of("ACTUAL FLOW", index_of("INTERCHANGE")) + 1
    while i + 1 < len(tokens) and tokens[i] != "TOTAL":
        interchange.append({"path": tokens[i], "flow_mw": _num(tokens[i + 1])})
        i += 2

    total_gen = sum(g["net_generation_mw"] or 0 for g in generation)
    renewable = sum(g["net_generation_mw"] or 0 for g in generation if g["fuel"].upper() in RENEWABLE_FUELS)

    return {
        "last_update": last_update,
        "summary": summary,
        "generation": generation,
        "interchange": interchange,
        "renewable_share_pct": round(100 * renewable / total_gen, 1) if total_gen else None,
    }


@ttl_cache(60)
async def current_supply_demand() -> dict:
    data = parse_csd(await _get_text(CSD_URL))
    return {
        "source": "AESO Current Supply Demand report",
        "source_url": CSD_URL,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        **data,
    }


# ---------- Hourly CSV reports ----------

def _hourly_rows(text: str, header_prefix: str) -> list[tuple[datetime, list[str]]]:
    """Yield (hour_start, row) for each hour-ending row; handles DST's repeated '02*' hour."""
    lines = text.splitlines()
    start = next((i for i, line in enumerate(lines) if line.startswith(header_prefix)), None)
    if start is None:
        raise AesoError("Unexpected AESO CSV format")
    out: list[tuple[datetime, list[str]]] = []
    hours_seen: dict[str, int] = {}
    for row in csv.reader(io.StringIO("\n".join(lines[start + 1:]))):
        if not row or not re.match(r"\d{2}/\d{2}/\d{4} \d{2}", row[0]):
            continue
        day = row[0][:10]
        n = hours_seen.get(day, 0)
        hours_seen[day] = n + 1
        midnight = datetime.strptime(day, "%m/%d/%Y").replace(tzinfo=EDMONTON)
        hour_start = (midnight.astimezone(timezone.utc) + timedelta(hours=n)).astimezone(EDMONTON)
        out.append((hour_start, row))
    return out


def _date_range(days: int, include_today_in_days: bool = True) -> dict:
    # Some AESO "historical" reports reject a begin date of today, so they start one day earlier.
    today = datetime.now(EDMONTON).date()
    begin: date = today - timedelta(days=days - 1 if include_today_in_days else days)
    return {"beginDate": begin.strftime("%m%d%Y"), "endDate": (today + timedelta(days=1)).strftime("%m%d%Y"), "contentType": "csv"}


def parse_pool_price(text: str) -> list[dict]:
    rows = []
    for hour_start, row in _hourly_rows(text, "Date (HE)"):
        price = _num(row[1]) if len(row) > 1 else None
        if price is None:
            continue  # future hours not settled yet
        rows.append({
            "time": hour_start.isoformat(),
            "price": price,
            "rolling_30d_avg": _num(row[2]) if len(row) > 2 else None,
            "ail_mw": _num(row[3]) if len(row) > 3 else None,
        })
    return rows


@ttl_cache(300)
async def pool_price(days: int = 7) -> dict:
    text = await _get_text(POOL_PRICE_URL, _date_range(days))
    return {"source": "AESO Historical Pool Price report", "source_url": POOL_PRICE_URL, "rows": parse_pool_price(text)}


def parse_actual_forecast(text: str) -> list[dict]:
    rows = []
    for hour_start, row in _hourly_rows(text, "Date,"):
        if len(row) < 5:
            continue
        rows.append({
            "time": hour_start.isoformat(),
            "forecast_price": _num(row[1]),
            "actual_price": _num(row[2]),
            "forecast_ail_mw": _num(row[3]),
            "actual_ail_mw": _num(row[4]),
        })
    return rows


@ttl_cache(300)
async def actual_vs_forecast(days: int = 1) -> dict:
    text = await _get_text(ACTUAL_FORECAST_URL, _date_range(days, include_today_in_days=False))
    return {"source": "AESO Actual / Forecast report", "source_url": ACTUAL_FORECAST_URL, "rows": parse_actual_forecast(text)}
