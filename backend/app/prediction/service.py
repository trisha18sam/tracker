"""
Prediction service — orchestrates DB queries → engine → DB writes → WS broadcast.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, date
from typing import Any, Dict, List, Optional

from sqlalchemy import select, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Train, TrainRun, TrainTelemetry, ScheduledStop, Route,
    RouteSection, OperationalEvent, ETAPrediction, Station,
    RunStatus,
)
from app.prediction.engine import get_engine
from app.prediction.baseline import (
    SectionInfo, TrainState, compute_all_baselines,
)

logger = logging.getLogger(__name__)


async def run_prediction_pipeline(
    db: AsyncSession,
    run_id: int,
    telemetry: TrainTelemetry,
) -> List[ETAPrediction]:
    """
    Main entry point called after every telemetry insert.

    Steps:
      1. Load train run + route sections + scheduled stops
      2. Compute baselines
      3. Run ML engine
      4. Persist ETAPrediction rows
      5. Return predictions (caller broadcasts via WS)
    """
    # ── 1. Load run ──────────────────────────────────────────────────────────
    run_q = await db.execute(
        select(TrainRun)
        .where(TrainRun.id == run_id)
        .options(
            selectinload(TrainRun.train).selectinload(Train.route).selectinload(
                Route.sections
            ),
            selectinload(TrainRun.train).selectinload(Train.scheduled_stops),
        )
    )
    run = run_q.scalar_one_or_none()
    if not run:
        logger.warning("TrainRun %d not found", run_id)
        return []

    train = run.train
    route = train.route

    # ── 2. Identify remaining sections ───────────────────────────────────────
    current_section_id = telemetry.current_section_id
    all_sections = sorted(route.sections, key=lambda s: s.sequence_number)

    if current_section_id:
        try:
            current_idx = next(
                i for i, s in enumerate(all_sections) if s.id == current_section_id
            )
        except StopIteration:
            current_idx = 0
    else:
        current_idx = 0

    remaining_sections = all_sections[current_idx:]
    if not remaining_sections:
        return []

    # ── 3. Build scheduled ETAs dict {station_id: datetime} ──────────────────
    stop_map: Dict[int, ScheduledStop] = {s.station_id: s for s in train.scheduled_stops}
    journey_start = run.journey_start_time or telemetry.timestamp - timedelta(
        minutes=abs(telemetry.cumulative_delay_min)
    )

    scheduled_etas: Dict[int, datetime] = {}
    for stop in train.scheduled_stops:
        if stop.scheduled_arrival_offset_min is not None:
            scheduled_etas[stop.station_id] = journey_start + timedelta(
                minutes=stop.scheduled_arrival_offset_min
            )

    # ── 4. Active operational events ─────────────────────────────────────────
    events_q = await db.execute(
        select(OperationalEvent).where(
            and_(
                OperationalEvent.run_id == run_id,
                OperationalEvent.end_time.is_(None),  # still active
            )
        )
    )
    active_events = events_q.scalars().all()
    events_list = [
        {
            "event_type": e.event_type.value,
            "section_id": e.section_id,
            "station_id": e.station_id,
            "speed_restriction_kmh": e.speed_restriction_kmh,
            "duration_min": e.duration_min,
        }
        for e in active_events
    ]

    # ── 5. Recent telemetry for trend calculation ─────────────────────────────
    recent_q = await db.execute(
        select(TrainTelemetry)
        .where(TrainTelemetry.run_id == run_id)
        .order_by(desc(TrainTelemetry.timestamp))
        .limit(5)
    )
    recent_telemetry = recent_q.scalars().all()
    speed_trend = _compute_speed_trend(recent_telemetry)
    delay_trend = _compute_delay_trend(recent_telemetry)

    # ── 6. Run baselines ──────────────────────────────────────────────────────
    state = TrainState(
        current_time=telemetry.timestamp,
        current_speed_kmh=telemetry.speed_kmh or 60.0,
        cumulative_delay_min=telemetry.cumulative_delay_min,
        distance_covered_km=telemetry.distance_covered_km or 0.0,
        current_section_id=current_section_id,
        active_speed_restriction_kmh=next(
            (e.speed_restriction_kmh for e in active_events
             if e.event_type.value == "SPEED_RESTRICTION"),
            None,
        ),
        recent_speed_trend_kmh_per_min=speed_trend,
    )

    sections_info = [
        SectionInfo(
            section_id=s.id,
            from_station_id=s.from_station_id,
            to_station_id=s.to_station_id,
            distance_km=s.distance_km,
            scheduled_travel_time_min=s.scheduled_travel_time_min,
            hist_avg_travel_time_min=s.hist_avg_travel_time_min or s.scheduled_travel_time_min,
            hist_std_dev_min=s.hist_std_dev_min or 0.0,
            hist_p10_travel_time_min=s.hist_p10_travel_time_min or s.scheduled_travel_time_min * 0.9,
            hist_p90_travel_time_min=s.hist_p90_travel_time_min or s.scheduled_travel_time_min * 1.2,
            max_speed_kmh=s.max_speed_kmh,
            scheduled_dwell_min=2.0,
        )
        for s in remaining_sections
    ]

    baseline_results = compute_all_baselines(state, sections_info, scheduled_etas)

    # ── 7. Run ML engine ──────────────────────────────────────────────────────
    engine = get_engine()
    sections_dicts = [
        {
            "id": s.id,
            "from_station_id": s.from_station_id,
            "to_station_id": s.to_station_id,
            "distance_km": s.distance_km,
            "scheduled_travel_time_min": s.scheduled_travel_time_min,
            "hist_avg_travel_time_min": s.hist_avg_travel_time_min or s.scheduled_travel_time_min,
            "hist_std_dev_min": s.hist_std_dev_min or 0.0,
            "max_speed_kmh": s.max_speed_kmh,
            "scheduled_dwell_min": 2.0,
        }
        for s in remaining_sections
    ]

    ml_results = engine.predict_all_stations(
        current_time=telemetry.timestamp,
        current_delay_min=telemetry.cumulative_delay_min,
        current_speed_kmh=telemetry.speed_kmh or 60.0,
        recent_speed_trend=speed_trend,
        delay_trend=delay_trend,
        sections=sections_dicts,
        scheduled_etas=scheduled_etas,
        train_type=train.train_type.value,
        active_events=events_list,
        preceding_train_delay_min=0.0,
        cumulative_dwell_excess_min=0.0,
        weather="CLEAR",
    )

    # ── 8. Persist predictions ────────────────────────────────────────────────
    predictions = []
    for ml in ml_results:
        station_id = ml["station_id"]
        bl = baseline_results.get(station_id)
        sched_eta = scheduled_etas.get(station_id)

        pred = ETAPrediction(
            run_id=run_id,
            station_id=station_id,
            predicted_at=telemetry.timestamp,
            scheduled_eta=sched_eta,
            predicted_eta=ml["predicted_eta"],
            predicted_delay_min=ml["predicted_delay_min"],
            lower_bound_eta=ml["lower_bound_eta"],
            upper_bound_eta=ml["upper_bound_eta"],
            confidence_score=ml["confidence_score"],
            baseline1_eta=bl.baseline1_eta if bl else None,
            baseline2_eta=bl.baseline2_eta if bl else None,
            baseline3_eta=bl.baseline3_eta if bl else None,
            prediction_factors=ml["prediction_factors"],
            explanation=ml["explanation"],
            model_version="xgb_v1",
            triggered_by_telemetry_id=telemetry.id,
        )
        db.add(pred)
        predictions.append(pred)

    # Update run delay
    run.current_delay_min = telemetry.cumulative_delay_min
    run.current_section_id = current_section_id

    await db.flush()
    return predictions


def _compute_speed_trend(telemetry_list: List[TrainTelemetry]) -> float:
    """km/h per minute slope from last N telemetry fixes."""
    if len(telemetry_list) < 2:
        return 0.0
    speeds = [(t.timestamp, t.speed_kmh or 0.0) for t in reversed(telemetry_list)]
    if len(speeds) < 2:
        return 0.0
    dt_min = (speeds[-1][0] - speeds[0][0]).total_seconds() / 60.0
    if dt_min == 0:
        return 0.0
    return (speeds[-1][1] - speeds[0][1]) / dt_min


def _compute_delay_trend(telemetry_list: List[TrainTelemetry]) -> float:
    """Change in delay (min) over last N fixes."""
    if len(telemetry_list) < 2:
        return 0.0
    ordered = list(reversed(telemetry_list))
    return ordered[-1].cumulative_delay_min - ordered[0].cumulative_delay_min
