from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .events.router import router as events_router
from .events.sync import start_background_sync
from .routers import auth, calgary, energy, ml, users, social


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    sync_task = start_background_sync()
    yield
    if sync_task:
        sync_task.cancel()


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, users.router, energy.router, calgary.router, ml.router, social.router, events_router):
    app.include_router(r)


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "app": settings.app_name}
