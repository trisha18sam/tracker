"""Telemetry ingestion router — POST /telemetry, GET /predictions/{run_id}"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_async_db
from app.models import (
    TrainRun, TrainTelemetry, ETAPrediction, Train,
    OperationalEvent, RunStatus,
)
from app.schemas import (
    TelemetryIn, TelemetryOut, ETAPredictionOut,
    TrainPredictionsOut, WsPredictionUpdate, OperationalEventOut,
)
from app.prediction.service import run_prediction_pipeline
from app.websocket_manager import manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["predictions"])


@router.post("/telemetry", response_model=TelemetryOut)
async def ingest_telemetry(
    payload: TelemetryIn,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_async_db),
):
    """
    Ingest a single telemetry fix for a running train.

    This is the main data entry point — called by the simulation engine
    every few seconds and, in production, by an IRCTC/NTES adapter.

    After persisting the telemetry, the prediction pipeline runs asynchronously
    and broadcasts updated ETAs via WebSocket.
    """
    # Verify run exists and is active
    run_q = await db.execute(
        select(TrainRun).where(TrainRun.id == payload.run_id)
    )
    run = run_q.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail=f"TrainRun {payload.run_id} not found")
    if run.status not in (RunStatus.SCHEDULED, RunStatus.RUNNING):
        raise HTTPException(status_code=400, detail="Run is not active")

    # Activate run on first telemetry
    if run.status == RunStatus.SCHEDULED:
        run.status = RunStatus.RUNNING
        if not run.journey_start_time:
            run.journey_start_time = payload.timestamp

    # Persist telemetry
    tel = TrainTelemetry(
        run_id=payload.run_id,
        timestamp=payload.timestamp,
        latitude=payload.latitude,
        longitude=payload.longitude,
        speed_kmh=payload.speed_kmh,
        distance_covered_km=payload.distance_covered_km,
        cumulative_delay_min=payload.cumulative_delay_min,
        current_section_id=payload.current_section_id,
        current_station_id=payload.current_station_id,
        data_source=payload.data_source,
        raw_payload=payload.raw_payload,
    )
    db.add(tel)
    await db.commit()  # commit telemetry so it is immediately visible to other sessions
    await db.refresh(tel)

    # Run prediction pipeline + broadcast
    await _predict_and_broadcast(run.id, tel.id, payload)

    return tel


async def _predict_and_broadcast(run_id: int, tel_id: int | None = None, payload: TelemetryIn | None = None) -> None:
    """Run in background or inline: predict → persist → WS broadcast."""
    from app.database import AsyncSessionLocal
    from app.models import Train, TrainTelemetry, TrainRun, OperationalEvent

    async with AsyncSessionLocal() as db:
        try:
            tel = None
            if tel_id is not None:
                # Re-fetch telemetry with its id
                tel_q = await db.execute(
                    select(TrainTelemetry).where(TrainTelemetry.id == tel_id)
                )
                tel = tel_q.scalar_one_or_none()

            if not tel:
                tel_q = await db.execute(
                    select(TrainTelemetry)
                    .where(TrainTelemetry.run_id == run_id)
                    .order_by(desc(TrainTelemetry.timestamp))
                )
                tel = tel_q.scalars().first()

            if not tel:
                run_q = await db.execute(select(TrainRun).where(TrainRun.id == run_id))
                run = run_q.scalar_one_or_none()
                if not run:
                    return
                tel = TrainTelemetry(
                    run_id=run_id,
                    timestamp=datetime.utcnow(),
                    latitude=28.6139,
                    longitude=77.2090,
                    speed_kmh=80.0,
                    distance_covered_km=0.0,
                    cumulative_delay_min=run.current_delay_min or 0.0,
                    data_source=run.data_source,
                )
                db.add(tel)
                await db.commit()
                await db.refresh(tel)

            predictions = await run_prediction_pipeline(db, run_id, tel)
            await db.commit()

            if not predictions:
                return

            # Build WS message
            run_q = await db.execute(
                select(TrainRun)
                .where(TrainRun.id == run_id)
                .options(selectinload(TrainRun.train))
            )
            run = run_q.scalar_one_or_none()
            if not run:
                return

            ev_q = await db.execute(
                select(OperationalEvent).where(
                    OperationalEvent.run_id == run_id,
                    OperationalEvent.end_time.is_(None),
                )
            )
            active_events = ev_q.scalars().all()

            preds_out = []
            for p in predictions:
                station_q = await db.execute(
                    select(__import__("app.models", fromlist=["Station"]).Station)
                    .where(__import__("app.models", fromlist=["Station"]).Station.id == p.station_id)
                )
                station = station_q.scalar_one_or_none()

                preds_out.append({
                    "id": p.id,
                    "run_id": p.run_id,
                    "station_id": p.station_id,
                    "station": {
                        "id": station.id,
                        "code": station.code,
                        "name": station.name,
                        "city": station.city,
                        "state": station.state,
                        "zone": station.zone,
                        "latitude": station.latitude,
                        "longitude": station.longitude,
                        "is_junction": station.is_junction,
                    } if station else {},
                    "predicted_at": p.predicted_at.isoformat(),
                    "scheduled_eta": p.scheduled_eta.isoformat() if p.scheduled_eta else None,
                    "predicted_eta": p.predicted_eta.isoformat(),
                    "predicted_delay_min": p.predicted_delay_min,
                    "lower_bound_eta": p.lower_bound_eta.isoformat() if p.lower_bound_eta else None,
                    "upper_bound_eta": p.upper_bound_eta.isoformat() if p.upper_bound_eta else None,
                    "confidence_score": p.confidence_score,
                    "baseline1_eta": p.baseline1_eta.isoformat() if p.baseline1_eta else None,
                    "baseline2_eta": p.baseline2_eta.isoformat() if p.baseline2_eta else None,
                    "baseline3_eta": p.baseline3_eta.isoformat() if p.baseline3_eta else None,
                    "prediction_factors": p.prediction_factors,
                    "explanation": p.explanation,
                    "model_version": p.model_version,
                })

            events_out = [
                {
                    "id": e.id,
                    "run_id": e.run_id,
                    "event_type": e.event_type.value,
                    "section_id": e.section_id,
                    "station_id": e.station_id,
                    "start_time": e.start_time.isoformat(),
                    "end_time": e.end_time.isoformat() if e.end_time else None,
                    "duration_min": e.duration_min,
                    "speed_restriction_kmh": e.speed_restriction_kmh,
                    "severity": e.severity,
                    "description": e.description,
                }
                for e in active_events
            ]

            msg = json.dumps({
                "type": "PREDICTION_UPDATE",
                "run_id": run_id,
                "train_number": run.train.number,
                "train_name": run.train.name,
                "current_delay_min": run.current_delay_min,
                "data_source": run.data_source.value,
                "predictions": preds_out,
                "active_events": events_out,
                "timestamp": tel.timestamp.isoformat(),
            }, default=str)

            await manager.broadcast_run(run_id, msg)
            await manager.broadcast_dashboard(json.dumps({
                "type": "DELAY_UPDATE",
                "run_id": run_id,
                "train_number": run.train.number,
                "current_delay_min": run.current_delay_min,
                "timestamp": tel.timestamp.isoformat(),
            }))

        except Exception as exc:
            logger.exception("Error in predict_and_broadcast: %s", exc)


@router.get("/predictions/{run_id}", response_model=TrainPredictionsOut)
async def get_predictions_by_run(run_id: int, db: AsyncSession = Depends(get_async_db)):
    """Latest predictions for a run ID."""
    run_q = await db.execute(
        select(TrainRun)
        .where(TrainRun.id == run_id)
        .options(selectinload(TrainRun.train))
    )
    run = run_q.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    latest_time_q = await db.execute(
        select(ETAPrediction.predicted_at)
        .where(ETAPrediction.run_id == run_id)
        .order_by(desc(ETAPrediction.predicted_at))
        .limit(1)
    )
    latest_time = latest_time_q.scalar_one_or_none()

    preds = []
    if latest_time:
        preds_q = await db.execute(
            select(ETAPrediction)
            .where(ETAPrediction.run_id == run_id, ETAPrediction.predicted_at == latest_time)
            .options(selectinload(ETAPrediction.station))
        )
        preds = preds_q.scalars().all()

    return TrainPredictionsOut(
        run_id=run.id,
        train_number=run.train.number,
        train_name=run.train.name,
        data_source=run.data_source.value,
        predictions=preds,
        last_updated=latest_time,
    )
