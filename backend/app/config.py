import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")


def _list(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


class Settings:
    app_name = os.getenv("APP_NAME", "Project Spark API")
    database_url = os.getenv("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'app.db'}")
    jwt_secret = os.getenv("JWT_SECRET", "dev-secret-change-me")
    jwt_expire_minutes = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
    cors_origins = _list(os.getenv("CORS_ORIGINS", "http://localhost:5173,file://,null"))
    calgary_app_token = os.getenv("CALGARY_APP_TOKEN", "")

    # Events -> map (see app/events/README.md). A source with no key is skipped, never faked.
    ticketmaster_api_key = os.getenv("TICKETMASTER_API_KEY", "")
    meetup_access_token = os.getenv("MEETUP_ACCESS_TOKEN", "")
    calgary_events = os.getenv("CALGARY_EVENTS", "1").strip().lower() not in ("0", "false", "no", "off")  # City of Calgary open data, no key
    events_center_lat = float(os.getenv("EVENTS_CENTER_LAT", "51.0447"))  # downtown Calgary
    events_center_lon = float(os.getenv("EVENTS_CENTER_LON", "-114.0719"))
    events_radius_km = float(os.getenv("EVENTS_RADIUS_KM", "50"))
    events_days_ahead = int(os.getenv("EVENTS_DAYS_AHEAD", "30"))
    events_sync_minutes = int(os.getenv("EVENTS_SYNC_MINUTES", "30"))  # 0 = only sync via POST /api/events/sync
    # Password reset emails. No SMTP_HOST = the reset link is printed in the backend terminal instead (dev only).
    app_url = os.getenv("APP_URL", "http://localhost:5173").rstrip("/")  # where the frontend runs; link = APP_URL/#/reset-password?token=…
    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    mail_from = os.getenv("MAIL_FROM", "") or os.getenv("SMTP_USER", "")
    password_reset_minutes = int(os.getenv("PASSWORD_RESET_MINUTES", "30"))
    geocoder_user_agent = os.getenv("GEOCODER_USER_AGENT", "CodeTheChangeYYC-hackathon-events-map/0.1")


settings = Settings()
