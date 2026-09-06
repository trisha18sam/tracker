"""
FastAPI main application entry point.

Architecture note:
  - All prediction logic lives in app/prediction/
  - All DB models in app/models.py
  - Routers in app/routers/
  - WebSocket manager in app/websocket_manager.py

The frontend (passenger app + ops dashboard) connects via:
  - REST for initial data load
  - WebSocket for live updates
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from app.database import async_engine
from app.models import Base
from app.websocket_manager import manager
from app.routers.trains import router as trains_router
from app.routers.telemetry import router as telemetry_router
from app.routers.simulation import router as sim_router
from app.routers.analytics import router as analytics_router
from app.routers.network import stations_router, routes_router
from app.routers.seats import router as seats_router
from app.routers.pantry import router as pantry_router
from app.prediction.engine import get_engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables (idempotent; use Alembic in production)
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ensured.")

    # Check if database needs expanded authentic railway dataset
    try:
        from app.database import SyncSessionLocal
        from app.models import Station
        from app.seed_expanded import seed_expanded_data
        with SyncSessionLocal() as session:
            st_count = session.query(Station).count()
            if st_count < 20:
                logger.info("Seeding expanded authentic railway dataset (%d stations found)...", st_count)
                seed_expanded_data(session)
            else:
                logger.info("Database verified with %d stations.", st_count)
    except Exception as exc:
        logger.warning("Auto-seeding check skipped: %s", exc)

    # Pre-load ML model
    engine = get_engine()
    logger.info(
        "ETA prediction engine ready. Model loaded: %s",
        engine.model is not None,
    )

    yield

    await async_engine.dispose()


app = FastAPI(
    title="SIH26028 — Dynamic ETA Forecast for Coaching Trains",
    description=(
        "**PROTOTYPE — Simulation/Demo Data**\n\n"
        "A dynamic ETA prediction engine for Indian Railways coaching trains. "
        "All data labelled SIMULATED until real IRCTC/NTES telemetry is connected."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── REST routers ──────────────────────────────────────────────────────────────
app.include_router(trains_router, prefix="/api/v1")
app.include_router(telemetry_router, prefix="/api/v1")
app.include_router(sim_router, prefix="/api/v1")
app.include_router(analytics_router, prefix="/api/v1")
app.include_router(stations_router, prefix="/api/v1")
app.include_router(routes_router, prefix="/api/v1")
app.include_router(seats_router, prefix="/api/v1")
app.include_router(pantry_router, prefix="/api/v1")



# ── WebSocket endpoints ───────────────────────────────────────────────────────

@app.websocket("/ws/predictions/{run_id}")
async def ws_predictions(websocket: WebSocket, run_id: int):
    """
    Passenger app / SIH demo mode connects here.
    Receives a PREDICTION_UPDATE message whenever new telemetry arrives.
    """
    await manager.connect_run(websocket, run_id)
    try:
        while True:
            # Keep connection alive — client sends pings if needed
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_run(websocket, run_id)


@app.websocket("/ws/dashboard")
async def ws_dashboard(websocket: WebSocket):
    """
    Operations dashboard connects here.
    Receives DELAY_UPDATE messages for all active runs.
    """
    await manager.connect_dashboard(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_dashboard(websocket)


@app.get("/", tags=["health"])
async def root():
    return {
        "service": "SIH26028 Dynamic ETA Forecast",
        "status": "running",
        "data_notice": "SIMULATION/DEMO DATA — Not real Indian Railways data",
        "docs": "/api/docs",
    }


@app.get("/health", tags=["health"])
async def health():
    engine = get_engine()
    return {
        "status": "ok",
        "ml_model_loaded": engine.model is not None,
        "data_source": "SIMULATED",
    }
