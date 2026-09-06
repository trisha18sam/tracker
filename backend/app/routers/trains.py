"""Trains router — GET /trains, /trains/{id}, /trains/{id}/live, /trains/{id}/predictions"""
from __future__ import annotations

import json
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_async_db
from app.models import (
    Train, TrainRun, TrainTelemetry, ETAPrediction, OperationalEvent, RunStatus,
    Route, RouteSection, ScheduledStop, Station,
)
from app.schemas import (
    TrainOut, TrainDetailOut, TrainLiveOut, TrainRunOut,
    TelemetryOut, OperationalEventOut, ETAPredictionOut,
    TrainPredictionsOut,
)

from app.providers.database_provider import DatabaseRailwayProvider

router = APIRouter(prefix="/trains", tags=["trains"])


@router.get("/search")
async def search_trains(
    q: str = "",
    from_station: str = None,
    to_station: str = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_async_db),
):
    """
    Search trains by number (e.g. 12951, 12301, 22436), name (e.g. Rajdhani),
    or corridor from_station/to_station codes.
    """
    provider = DatabaseRailwayProvider(db)
    return await provider.search_trains(
        query=q,
        from_station_code=from_station,
        to_station_code=to_station,
        limit=limit,
    )


@router.get("", response_model=List[TrainOut])
async def list_trains(db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(Train).where(Train.is_active == True))
    return result.scalars().all()



@router.get("/{train_id}", response_model=TrainDetailOut)
async def get_train(train_id: int, db: AsyncSession = Depends(get_async_db)):
    q = await db.execute(
        select(Train)
        .where(Train.id == train_id)
        .options(
            selectinload(Train.route).selectinload(Route.sections).selectinload(RouteSection.from_station),
            selectinload(Train.route).selectinload(Route.sections).selectinload(RouteSection.to_station),
            selectinload(Train.route).selectinload(Route.origin_station),
            selectinload(Train.route).selectinload(Route.destination_station),
            selectinload(Train.scheduled_stops).selectinload(ScheduledStop.station),
        )
    )
    train = q.scalar_one_or_none()
    if not train:
        raise HTTPException(status_code=404, detail="Train not found")
    return train


@router.get("/{train_id}/live", response_model=TrainLiveOut)
async def get_train_live(train_id: int, db: AsyncSession = Depends(get_async_db)):
    """Latest live/simulated state of the most recent run of this train."""
    # Get most recent run
    run_q = await db.execute(
        select(TrainRun)
        .where(
            TrainRun.train_id == train_id,
            TrainRun.status.in_([RunStatus.RUNNING, RunStatus.SCHEDULED, RunStatus.ARRIVED]),
        )
        .order_by(desc(TrainRun.run_date), desc(TrainRun.id))
        .limit(1)
    )
    run = run_q.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="No active run for this train")

    # Latest telemetry
    tel_q = await db.execute(
        select(TrainTelemetry)
        .where(TrainTelemetry.run_id == run.id)
        .order_by(desc(TrainTelemetry.timestamp))
        .limit(1)
    )
    latest_tel = tel_q.scalar_one_or_none()

    # Active events
    ev_q = await db.execute(
        select(OperationalEvent).where(
            OperationalEvent.run_id == run.id,
            OperationalEvent.end_time.is_(None),
        )
    )
    events = ev_q.scalars().all()

    train_q = await db.execute(select(Train).where(Train.id == train_id))
    train = train_q.scalar_one()

    return {
        "run": run,
        "train": train,
        "latest_telemetry": latest_tel,
        "active_events": events,
    }


@router.get("/{train_id}/predictions", response_model=TrainPredictionsOut)
async def get_train_predictions(train_id: int, db: AsyncSession = Depends(get_async_db)):
    """Most recent ETA predictions for all upcoming stations of a train's active run."""
    run_q = await db.execute(
        select(TrainRun)
        .where(
            TrainRun.train_id == train_id,
            TrainRun.status.in_([RunStatus.RUNNING, RunStatus.SCHEDULED, RunStatus.ARRIVED]),
        )
        .order_by(desc(TrainRun.run_date), desc(TrainRun.id))
        .limit(1)
    )
    run = run_q.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="No active run")

    train_q = await db.execute(select(Train).where(Train.id == train_id))
    train = train_q.scalar_one()

    # Get latest prediction timestamp
    latest_pred_time_q = await db.execute(
        select(ETAPrediction.predicted_at)
        .where(ETAPrediction.run_id == run.id)
        .order_by(desc(ETAPrediction.predicted_at))
        .limit(1)
    )
    latest_time = latest_pred_time_q.scalar_one_or_none()
    if not latest_time:
        return TrainPredictionsOut(
            run_id=run.id,
            train_number=train.number,
            train_name=train.name,
            data_source=run.data_source.value,
            predictions=[],
            last_updated=None,
        )

    # Get all predictions at that timestamp
    preds_q = await db.execute(
        select(ETAPrediction)
        .where(
            ETAPrediction.run_id == run.id,
            ETAPrediction.predicted_at == latest_time,
        )
        .options(selectinload(ETAPrediction.station))
    )
    predictions = preds_q.scalars().all()

    return TrainPredictionsOut(
        run_id=run.id,
        train_number=train.number,
        train_name=train.name,
        data_source=run.data_source.value,
        predictions=predictions,
        last_updated=latest_time,
    )
