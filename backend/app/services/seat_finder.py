"""
Segment-Aware Seat Finder & Dynamic Availability Engine.

Calculates seat availability per journey sub-segment (from_station -> to_station),
evaluating intermediate passenger deboardings, cancellations, and live ETA connections.
"""
from __future__ import annotations

import logging
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import select, and_, or_, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Train, TrainRun, Station, Route, RouteSection, ScheduledStop,
    TrainTelemetry, ETAPrediction, RunStatus, DataSource,
    Coach, Seat, SeatOccupancy, SeatWatch, SeatAvailabilityEvent,
    CoachClass, BerthType, OccupancyStatus, SeatEventType,
)

logger = logging.getLogger(__name__)


async def search_segment_seats(
    db: AsyncSession,
    from_station_id: int,
    to_station_id: int,
    travel_date: Optional[date] = None,
    preferred_class: Optional[str] = None,
    preferred_berth: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Search for trains running between from_station and to_station on a given date,
    calculating segment-specific confirmed availability, predicted deboarding vacancies,
    and integrating real-time train location and dynamic predicted ETAs.
    """
    search_date = travel_date or date.today()

    # 1. Fetch from and to stations
    st_from_q = await db.execute(select(Station).where(Station.id == from_station_id))
    st_from = st_from_q.scalar_one_or_none()
    st_to_q = await db.execute(select(Station).where(Station.id == to_station_id))
    st_to = st_to_q.scalar_one_or_none()

    if not st_from or not st_to:
        return []

    # 2. Find all trains that stop at both stations in correct sequence
    trains_q = await db.execute(
        select(Train)
        .options(
            selectinload(Train.scheduled_stops).selectinload(ScheduledStop.station),
            selectinload(Train.route).selectinload(Route.sections).selectinload(RouteSection.from_station),
            selectinload(Train.route).selectinload(Route.sections).selectinload(RouteSection.to_station),
            selectinload(Train.coaches).selectinload(Coach.seats),
        )
    )
    all_trains = trains_q.scalars().all()

    results = []

    for train in all_trains:
        # Build ordered stop map: station_id -> stop_number
        stops_by_station = {s.station_id: s for s in train.scheduled_stops}

        if from_station_id not in stops_by_station or to_station_id not in stops_by_station:
            continue

        stop_from = stops_by_station[from_station_id]
        stop_to = stops_by_station[to_station_id]

        if stop_from.stop_number >= stop_to.stop_number:
            # Train goes in opposite direction or destination comes before boarding
            continue

        # Get sequence of station IDs for this train's route
        ordered_stops = sorted(train.scheduled_stops, key=lambda s: s.stop_number)
        station_seq_map = {s.station_id: idx for idx, s in enumerate(ordered_stops)}
        from_idx = station_seq_map[from_station_id]
        to_idx = station_seq_map[to_station_id]

        # 3. Find or create TrainRun for this date
        run_q = await db.execute(
            select(TrainRun)
            .where(
                TrainRun.train_id == train.id,
                TrainRun.status.in_([RunStatus.RUNNING, RunStatus.SCHEDULED, RunStatus.ARRIVED]),
            )
            .order_by(desc(TrainRun.run_date), desc(TrainRun.id))
            .limit(1)
        )
        run = run_q.scalar_one_or_none()

        run_id = run.id if run else 1
        current_delay = run.current_delay_min if run else 0.0

        # 4. Fetch latest telemetry and dynamic ETA predictions for boarding and destination
        latest_tel_q = await db.execute(
            select(TrainTelemetry)
            .where(TrainTelemetry.run_id == run_id)
            .order_by(desc(TrainTelemetry.timestamp))
            .limit(1)
        )
        latest_tel = latest_tel_q.scalar_one_or_none()

        # Dynamic ETAs from prediction engine
        eta_from_q = await db.execute(
            select(ETAPrediction)
            .where(ETAPrediction.run_id == run_id, ETAPrediction.station_id == from_station_id)
            .order_by(desc(ETAPrediction.predicted_at))
            .limit(1)
        )
        eta_from_pred = eta_from_q.scalar_one_or_none()

        eta_to_q = await db.execute(
            select(ETAPrediction)
            .where(ETAPrediction.run_id == run_id, ETAPrediction.station_id == to_station_id)
            .order_by(desc(ETAPrediction.predicted_at))
            .limit(1)
        )
        eta_to_pred = eta_to_q.scalar_one_or_none()

        # Approximate distance to boarding station
        dist_to_boarding_km = 0.0
        if latest_tel and latest_tel.latitude and latest_tel.longitude:
            from math import radians, sin, cos, sqrt, atan2
            R = 6371.0
            lat1, lon1 = radians(latest_tel.latitude), radians(latest_tel.longitude)
            lat2, lon2 = radians(st_from.latitude), radians(st_from.longitude)
            dlat, dlon = lat2 - lat1, lon2 - lon1
            a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
            dist_to_boarding_km = round(R * 2 * atan2(sqrt(a), sqrt(1 - a)), 1)
        else:
            dist_to_boarding_km = 75.0

        # 5. Fetch all seat occupancies for this run
        occupancies_q = await db.execute(
            select(SeatOccupancy)
            .where(
                SeatOccupancy.train_run_id == run_id,
                SeatOccupancy.status == OccupancyStatus.CONFIRMED,
            )
        )
        all_occupancies = occupancies_q.scalars().all()

        # Map seat_id -> list of occupied segments (start_idx, end_idx)
        seat_occupied_segments: Dict[int, List[Tuple[int, int, SeatOccupancy]]] = {}
        for occ in all_occupancies:
            if occ.from_station_id in station_seq_map and occ.to_station_id in station_seq_map:
                u = station_seq_map[occ.from_station_id]
                v = station_seq_map[occ.to_station_id]
                seat_occupied_segments.setdefault(occ.seat_id, []).append((u, v, occ))

        # 6. Evaluate Segment Availability across all coaches
        class_summaries: Dict[str, Dict[str, Any]] = {}
        total_confirmed_avail = 0
        total_predicted_deboard = 0
        total_cancellation_avail = 0

        # Recent cancellations for this train run
        recent_events_q = await db.execute(
            select(SeatAvailabilityEvent)
            .where(
                SeatAvailabilityEvent.train_run_id == run_id,
                SeatAvailabilityEvent.event_type.in_([SeatEventType.CANCELLATION, SeatEventType.NO_SHOW]),
            )
            .order_by(desc(SeatAvailabilityEvent.created_at))
            .limit(10)
        )
        recent_events = recent_events_q.scalars().all()
        cancelled_seat_ids = {ev.seat_id for ev in recent_events}

        for coach in train.coaches:
            c_class = coach.coach_class.value
            if preferred_class and preferred_class.upper() != c_class:
                continue

            if c_class not in class_summaries:
                class_summaries[c_class] = {
                    "coach_class": c_class,
                    "confirmed_available": 0,
                    "predicted_available": 0,
                    "cancellation_available": 0,
                    "total_berths": 0,
                    "berth_breakdown": {"LOWER": 0, "MIDDLE": 0, "UPPER": 0, "SIDE_LOWER": 0, "SIDE_UPPER": 0},
                    "deboarding_stations": {},
                }

            for seat in coach.seats:
                if preferred_berth and preferred_berth.upper() != seat.berth_type.value:
                    continue

                class_summaries[c_class]["total_berths"] += 1
                b_type = seat.berth_type.value
                
                # Check segment overlap for this seat
                intervals = seat_occupied_segments.get(seat.id, [])
                has_overlap = False
                deboard_at_boarding = False

                for u, v, occ in intervals:
                    # Overlap formula: max(u, from_idx) < min(v, to_idx)
                    if max(u, from_idx) < min(v, to_idx):
                        has_overlap = True
                    # Deboarding right at or before boarding station
                    if v <= from_idx:
                        deboard_at_boarding = True

                if not has_overlap:
                    if deboard_at_boarding:
                        # Current passenger gets down at or before boarding station -> Vacating for our segment!
                        class_summaries[c_class]["predicted_available"] += 1
                        total_predicted_deboard += 1
                        class_summaries[c_class]["deboarding_stations"][st_from.code] = (
                            class_summaries[c_class]["deboarding_stations"].get(st_from.code, 0) + 1
                        )
                        if b_type in class_summaries[c_class]["berth_breakdown"]:
                            class_summaries[c_class]["berth_breakdown"][b_type] += 1
                    else:
                        # Seat is 100% vacant across the entire corridor!
                        class_summaries[c_class]["confirmed_available"] += 1
                        total_confirmed_avail += 1
                        if b_type in class_summaries[c_class]["berth_breakdown"]:
                            class_summaries[c_class]["berth_breakdown"][b_type] += 1
                elif seat.id in cancelled_seat_ids:
                    class_summaries[c_class]["cancellation_available"] += 1
                    total_cancellation_avail += 1

        # 7. Format arrival/departure and dynamic forecast timestamps
        sched_dep_str = stop_from.departure_time_str or "20:10"
        sched_arr_str = stop_to.arrival_time_str or "05:42"

        # Predicted boarding and arrival ISO strings
        base_time = datetime.combine(search_date, datetime.min.time())
        predicted_boarding_iso = (
            eta_from_pred.predicted_eta.isoformat()
            if eta_from_pred and eta_from_pred.predicted_eta
            else (base_time + timedelta(hours=20, minutes=15)).isoformat()
        )
        predicted_dest_iso = (
            eta_to_pred.predicted_eta.isoformat()
            if eta_to_pred and eta_to_pred.predicted_eta
            else (base_time + timedelta(days=1, hours=5, minutes=47)).isoformat()
        )

        # 8. Compute Availability Confidence
        if total_confirmed_avail >= 3:
            confidence_level = "HIGH"
            confidence_score = 0.94
            confidence_reason = f"{total_confirmed_avail} confirmed vacant berths across this segment"
        elif total_predicted_deboard >= 2:
            confidence_level = "HIGH"
            confidence_score = 0.86
            confidence_reason = f"{total_predicted_deboard} passengers scheduled to deboard at {st_from.name}"
        elif total_cancellation_avail > 0:
            confidence_level = "MODERATE"
            confidence_score = 0.72
            confidence_reason = "Recent cancellation detected in active rake"
        elif total_confirmed_avail > 0 or total_predicted_deboard > 0:
            confidence_level = "MODERATE"
            confidence_score = 0.68
            confidence_reason = "Limited inventory with upcoming station turnover"
        else:
            confidence_level = "LOW"
            confidence_score = 0.35
            confidence_reason = "High segment saturation; waitlist turnover unlikely"

        # Check last-minute departure window (hours from now)
        is_last_minute = True  # Prototype default for demo

        results.append({
            "train_id": train.id,
            "train_number": train.number,
            "train_name": train.name,
            "train_type": train.train_type.value,
            "run_id": run_id,
            "data_source": "SIMULATED",
            "from_station": {
                "id": st_from.id,
                "code": st_from.code,
                "name": st_from.name,
                "city": st_from.city,
            },
            "to_station": {
                "id": st_to.id,
                "code": st_to.code,
                "name": st_to.name,
                "city": st_to.city,
            },
            "scheduled_departure_time": sched_dep_str,
            "scheduled_arrival_time": sched_arr_str,
            "predicted_boarding_time": predicted_boarding_iso,
            "predicted_arrival_time": predicted_dest_iso,
            "current_delay_min": current_delay,
            "distance_to_boarding_km": dist_to_boarding_km,
            "current_train_location": f"{dist_to_boarding_km} km from {st_from.name}",
            "confirmed_available_seats": total_confirmed_avail,
            "predicted_deboard_seats": total_predicted_deboard,
            "cancellation_seats": total_cancellation_avail,
            "total_potential_seats": total_confirmed_avail + total_predicted_deboard + total_cancellation_avail,
            "confidence_level": confidence_level,
            "confidence_score": confidence_score,
            "confidence_reason": confidence_reason,
            "classes": list(class_summaries.values()),
            "is_last_minute": is_last_minute,
            "recent_cancellations": [
                {
                    "details": ev.details,
                    "minutes_ago": max(1, int((datetime.utcnow() - ev.created_at).total_seconds() / 60))
                }
                for ev in recent_events[:3]
            ]
        })

    # Sort results by compatibility, confidence, and departure
    results.sort(
        key=lambda r: (
            -(r["confirmed_available_seats"] + r["predicted_deboard_seats"]),
            -r["confidence_score"],
            r["current_delay_min"]
        )
    )

    return results


async def get_coach_seat_grid(
    db: AsyncSession,
    train_id: int,
    coach_id: int,
    from_station_id: int,
    to_station_id: int,
) -> Dict[str, Any]:
    """
    Generate visual coach seat map with segment-specific availability status:
      - AVAILABLE: Free across requested segment
      - PREDICTED_DEBOARD: Occupied earlier, but passenger deboards at or before boarding station
      - OCCUPIED: Actively occupied during requested segment
      - BLOCKED_QUOTA: Emergency / operational quota
    """
    coach_q = await db.execute(
        select(Coach)
        .where(Coach.id == coach_id, Coach.train_id == train_id)
        .options(
            selectinload(Coach.train).selectinload(Train.scheduled_stops).selectinload(ScheduledStop.station),
            selectinload(Coach.seats),
        )
    )
    coach = coach_q.scalar_one_or_none()
    if not coach:
        return {}

    train = coach.train
    ordered_stops = sorted(train.scheduled_stops, key=lambda s: s.stop_number)
    station_seq_map = {s.station_id: idx for idx, s in enumerate(ordered_stops)}
    stations_by_id = {s.station_id: s.station for s in train.scheduled_stops if s.station}

    from_idx = station_seq_map.get(from_station_id, 0)
    to_idx = station_seq_map.get(to_station_id, len(ordered_stops) - 1)

    # Latest run
    run_q = await db.execute(
        select(TrainRun)
        .where(TrainRun.train_id == train_id)
        .order_by(desc(TrainRun.run_date), desc(TrainRun.id))
        .limit(1)
    )
    run = run_q.scalar_one_or_none()
    run_id = run.id if run else 1

    # Seat occupancies in this coach
    seat_ids = [s.id for s in coach.seats]
    occ_q = await db.execute(
        select(SeatOccupancy)
        .where(
            SeatOccupancy.train_run_id == run_id,
            SeatOccupancy.seat_id.in_(seat_ids),
            SeatOccupancy.status == OccupancyStatus.CONFIRMED,
        )
    )
    occupancies = occ_q.scalars().all()

    seat_occ_map: Dict[int, List[SeatOccupancy]] = {}
    for occ in occupancies:
        seat_occ_map.setdefault(occ.seat_id, []).append(occ)

    seat_grid = []
    confirmed_cnt = 0
    predicted_cnt = 0
    occupied_cnt = 0

    for seat in sorted(coach.seats, key=lambda s: s.seat_number):
        seat_occs = seat_occ_map.get(seat.id, [])
        has_overlap = False
        deboarding_reason = None
        current_pnr = None
        segment_history = []

        for occ in seat_occs:
            u = station_seq_map.get(occ.from_station_id, 0)
            v = station_seq_map.get(occ.to_station_id, len(ordered_stops) - 1)
            
            from_st_name = stations_by_id.get(occ.from_station_id, None)
            to_st_name = stations_by_id.get(occ.to_station_id, None)
            from_code = from_st_name.code if from_st_name else "NDLS"
            to_code = to_st_name.code if to_st_name else "JP"

            segment_history.append(f"{from_code} → {to_code}")

            if max(u, from_idx) < min(v, to_idx):
                has_overlap = True
                current_pnr = occ.passenger_masked_pnr
            elif v <= from_idx:
                deboarding_reason = f"Passenger ({occ.passenger_masked_pnr}) deboards at {to_code}"

        if not has_overlap:
            if deboarding_reason:
                status = "PREDICTED_AVAILABLE"
                status_label = "Deboarding at " + (stations_by_id.get(from_station_id).code if stations_by_id.get(from_station_id) else "Boarding")
                confidence = 0.88
                predicted_cnt += 1
            else:
                status = "AVAILABLE"
                status_label = "Confirmed Vacant"
                confidence = 0.95
                confirmed_cnt += 1
        elif seat.is_emergency_quota:
            status = "BLOCKED_QUOTA"
            status_label = "Emergency Quota"
            confidence = 0.50
            occupied_cnt += 1
        else:
            status = "OCCUPIED"
            status_label = "Occupied (" + (current_pnr or "Booked") + ")"
            confidence = 0.10
            occupied_cnt += 1

        seat_grid.append({
            "seat_id": seat.id,
            "seat_number": seat.seat_number,
            "coach_code": coach.coach_code,
            "coach_class": coach.coach_class.value,
            "berth_type": seat.berth_type.value,
            "bay_number": seat.bay_number,
            "is_window": seat.is_window,
            "is_emergency_quota": seat.is_emergency_quota,
            "segment_status": status,
            "status_label": status_label,
            "confidence": confidence,
            "deboard_explanation": deboarding_reason,
            "masked_pnr": current_pnr,
            "segment_history": segment_history,
        })

    return {
        "coach_id": coach.id,
        "coach_code": coach.coach_code,
        "coach_class": coach.coach_class.value,
        "total_seats": coach.total_seats,
        "layout_type": coach.layout_type,
        "summary": {
            "confirmed_available": confirmed_cnt,
            "predicted_available": predicted_cnt,
            "occupied": occupied_cnt,
        },
        "seats": seat_grid,
    }


async def simulate_cancellation_event(
    db: AsyncSession,
    train_run_id: int,
    coach_code: Optional[str] = "B2",
    seat_number: Optional[int] = 18,
) -> Dict[str, Any]:
    """
    Simulate a last-minute seat cancellation or no-show in real time,
    vacating the seat and logging an event for live demonstration.
    """
    # Find train run
    run_q = await db.execute(select(TrainRun).where(TrainRun.id == train_run_id))
    run = run_q.scalars().first()
    train_id = run.train_id if run else 1

    # Find matching seat in coach for this train
    seat_q = await db.execute(
        select(Seat)
        .join(Coach)
        .where(
            Coach.train_id == train_id,
            Coach.coach_code == coach_code,
            Seat.seat_number == seat_number,
        )
    )
    seat = seat_q.scalars().first()
    if not seat:
        # Fallback to any seat in this coach or train
        any_seat_q = await db.execute(select(Seat).join(Coach).where(Coach.train_id == train_id).limit(1))
        seat = any_seat_q.scalars().first()

    if not seat:
        return {"status": "ERROR", "message": "No matching coach or seat found to cancel."}

    # Create event
    event = SeatAvailabilityEvent(
        train_run_id=train_run_id,
        seat_id=seat.id,
        event_type=SeatEventType.CANCELLATION,
        details=f"Seat {seat.seat_number} in Coach {coach_code} cancelled by passenger (Vacated for downstream segment)",
    )
    db.add(event)

    # Update any confirmed occupancy for this seat in this run
    occ_q = await db.execute(
        select(SeatOccupancy)
        .where(
            SeatOccupancy.seat_id == seat.id,
            SeatOccupancy.train_run_id == train_run_id,
            SeatOccupancy.status == OccupancyStatus.CONFIRMED,
        )
    )
    occs = occ_q.scalars().all()
    for occ in occs:
        occ.status = OccupancyStatus.CANCELLED
        occ.cancelled_at = datetime.utcnow()
        occ.cancellation_reason = "PASSENGER_CANCELLED"

    await db.commit()

    return {
        "status": "SUCCESS",
        "message": f"Cancellation processed for Coach {coach_code} Seat {seat.seat_number}.",
        "seat_id": seat.id,
        "coach_code": coach_code,
        "seat_number": seat.seat_number,
        "event_id": event.id,
        "timestamp": datetime.utcnow().isoformat(),
    }

