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


settings = Settings()
