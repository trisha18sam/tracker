"""Simulation control router — POST /simulation/start, POST /simulation/events"""
from __future__ import annotations

import logging
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.models import (
    Train, TrainRun, OperationalEvent, RunStatus, DataSource, EventType,
)
from app.schemas import SimStartIn, SimStartOut, EventIn, OperationalEventOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/simulation", tags=["simulation"])


@router.post("/start", response_model=SimStartOut)
async def start_simulation(payload: SimStartIn, db: AsyncSession = Depends(get_async_db)):
    """
    Create a new TrainRun for demo mode.

    The simulation engine then posts telemetry to /telemetry every few seconds.
    """
    train_q = await db.execute(select(Train).where(Train.id == payload.train_id))
    train = train_q.scalar_one_or_none()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")

    run_date = payload.run_date or date.today()

    # Check if run already exists
    existing_q = await db.execute(
        select(TrainRun).where(
            TrainRun.train_id == payload.train_id,
            TrainRun.run_date == run_date,
        )
    )
    existing = existing_q.scalar_one_or_none()
    if existing:
        # Reset the existing run
        existing.status = RunStatus.SCHEDULED
        existing.current_delay_min = payload.origin_delay_min
        existing.origin_delay_min = payload.origin_delay_min
        existing.journey_start_time = None
        await db.flush()
        return SimStartOut(
            run_id=existing.id,
            train_id=train.id,
            message=f"Existing run reset. Send telemetry to /telemetry with run_id={existing.id}",
        )

    run = TrainRun(
        train_id=payload.train_id,
        run_date=run_date,
        status=RunStatus.SCHEDULED,
        data_source=DataSource.SIMULATED,
        origin_delay_min=payload.origin_delay_min,
        current_delay_min=payload.origin_delay_min,
    )
    db.add(run)
    await db.flush()

    return SimStartOut(
        run_id=run.id,
        train_id=train.id,
        message=f"Run created. Send telemetry to /telemetry with run_id={run.id}",
    )


@router.post("/events", response_model=OperationalEventOut)
async def inject_event(payload: EventIn, db: AsyncSession = Depends(get_async_db)):
    """
    Inject an operational event into an active run.

    This is the key SIH demo interaction:
      1. Operator selects event type + parameters
      2. Event is persisted
      3. Next telemetry ingestion triggers prediction recalculation
      4. Updated ETAs are broadcast via WebSocket
    """
    run_q = await db.execute(select(TrainRun).where(TrainRun.id == payload.run_id))
    run = run_q.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    # Normalize event type synonyms
    raw_ev = payload.event_type.upper().strip()
    ev_alias_map = {
        "WEATHER_FOG": EventType.WEATHER,
        "FOG": EventType.WEATHER,
        "RAIN": EventType.WEATHER,
        "STORM": EventType.WEATHER,
        "TRACK_MAINTENANCE": EventType.MAINTENANCE_BLOCK,
        "TRACK_PACKING": EventType.MAINTENANCE_BLOCK,
        "CAUTION_ORDER": EventType.SPEED_RESTRICTION,
        "LOOP_HOLD": EventType.CONGESTION,
        "FREIGHT_HOLD": EventType.CONGESTION,
        "OTHER": EventType.SPEED_RESTRICTION,
        "RECOVERY": EventType.SPEED_RESTRICTION,
    }
    if raw_ev in ev_alias_map:
        event_type = ev_alias_map[raw_ev]
    else:
        try:
            event_type = EventType(raw_ev)
        except ValueError:
            event_type = EventType.SPEED_RESTRICTION

    sev_map = {1: "LOW", 2: "MODERATE", 3: "HIGH", 4: "CRITICAL"}
    if isinstance(payload.severity, int):
        sev_str = sev_map.get(payload.severity, "MODERATE")
    elif str(payload.severity).isdigit():
        sev_str = sev_map.get(int(payload.severity), "MODERATE")
    else:
        sev_str = str(payload.severity).upper()

    event = OperationalEvent(
        run_id=payload.run_id,
        event_type=event_type,
        section_id=payload.section_id,
        station_id=payload.station_id,
        start_time=datetime.utcnow(),
        duration_min=payload.duration_min,
        speed_restriction_kmh=payload.speed_restriction_kmh,
        severity=sev_str,
        description=payload.description,
        injected_by="DEMO_MODE",
    )
    db.add(event)
    await db.flush()
    await db.refresh(event)
    return event


@router.delete("/events/{event_id}")
async def clear_event(event_id: int, db: AsyncSession = Depends(get_async_db)):
    """Mark an operational event as ended (clear restriction)."""
    ev_q = await db.execute(select(OperationalEvent).where(OperationalEvent.id == event_id))
    ev = ev_q.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    ev.end_time = datetime.utcnow()
    await db.flush()
    return {"message": "Event cleared", "event_id": event_id}
