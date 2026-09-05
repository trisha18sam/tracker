"""
Seat and Coach seed script for Last-Minute Seat Finder.

Populates:
  1. Coach compositions (1A, 2A, 3A, SL) for trains 12952 and 12957
  2. Individual Seat layouts with realistic berth types (Lower, Middle, Upper, Side Lower, Side Upper)
  3. Realistic Segment-based Seat Occupancies demonstrating intermediate deboarding vacancies
  4. Seat Availability Events (Cancellations, No-shows)

Run:
  python database/seed_seats.py
"""
from __future__ import annotations

import os
import sys
import random
import logging
from datetime import datetime, date, timedelta
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

import sqlalchemy as sa
from sqlalchemy.orm import Session
from app.database import sync_engine
from app.models import (
    Base, Train, Station, TrainRun,
    Coach, Seat, SeatOccupancy, SeatAvailabilityEvent,
    CoachClass, BerthType, OccupancyStatus, SeatEventType,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

random.seed(42)

def seed_seats():
    Base.metadata.create_all(bind=sync_engine)

    with Session(sync_engine) as session:
        trains = session.query(Train).all()
        stations = {s.code: s for s in session.query(Station).all()}
        runs = session.query(TrainRun).all()

        if not trains or not stations:
            logger.error("Trains or Stations not found. Run seed.py first.")
            return

        logger.info("Seeding coaches and seat inventory for %d trains...", len(trains))

        # Clear previous seat data if any for clean idempotency
        session.query(SeatAvailabilityEvent).delete()
        session.query(SeatOccupancy).delete()
        session.query(Seat).delete()
        session.query(Coach).delete()
        session.commit()

        # Coach templates: (coach_code, coach_class, total_seats, seq)
        coach_templates = [
            ("A1", CoachClass.SECOND_AC, 48, 1),
            ("A2", CoachClass.SECOND_AC, 48, 2),
            ("B1", CoachClass.THIRD_AC, 64, 3),
            ("B2", CoachClass.THIRD_AC, 64, 4),
            ("B3", CoachClass.THIRD_AC, 64, 5),
            ("S1", CoachClass.SLEEPER, 72, 6),
            ("S2", CoachClass.SLEEPER, 72, 7),
        ]

        station_codes_order = ["NDLS", "MTJ", "AGC", "BXN", "JP", "AII", "ABR", "PNU", "ADI", "BRC", "ST", "BCT"]

        for train in trains:
            for code, c_class, total, seq in coach_templates:
                coach = Coach(
                    train_id=train.id,
                    coach_code=code,
                    coach_class=c_class,
                    sequence_in_rake=seq,
                    total_seats=total,
                    layout_type="STANDARD_LHB_8BAY" if total == 64 else "STANDARD_LHB_6BAY" if total == 48 else "STANDARD_LHB_9BAY"
                )
                session.add(coach)
                session.flush()

                # Generate seats for this coach
                if c_class == CoachClass.THIRD_AC or c_class == CoachClass.SLEEPER:
                    # 8 berths per bay: 1:L, 2:M, 3:U, 4:L, 5:M, 6:U, 7:SL, 8:SU
                    berth_pattern = [
                        BerthType.LOWER, BerthType.MIDDLE, BerthType.UPPER,
                        BerthType.LOWER, BerthType.MIDDLE, BerthType.UPPER,
                        BerthType.SIDE_LOWER, BerthType.SIDE_UPPER
                    ]
                    for s_num in range(1, total + 1):
                        mod = (s_num - 1) % 8
                        bay = ((s_num - 1) // 8) + 1
                        b_type = berth_pattern[mod]
                        is_win = b_type in (BerthType.LOWER, BerthType.SIDE_LOWER)
                        seat = Seat(
                            coach_id=coach.id,
                            seat_number=s_num,
                            berth_type=b_type,
                            bay_number=bay,
                            is_window=is_win,
                            is_emergency_quota=(s_num in (1, 2, 7))
                        )
                        session.add(seat)
                else:
                    # 2A: 6 berths per bay: 1:L, 2:U, 3:L, 4:U, 5:SL, 6:SU
                    berth_pattern_2a = [
                        BerthType.LOWER, BerthType.UPPER,
                        BerthType.LOWER, BerthType.UPPER,
                        BerthType.SIDE_LOWER, BerthType.SIDE_UPPER
                    ]
                    for s_num in range(1, total + 1):
                        mod = (s_num - 1) % 6
                        bay = ((s_num - 1) // 6) + 1
                        b_type = berth_pattern_2a[mod]
                        is_win = b_type in (BerthType.LOWER, BerthType.SIDE_LOWER)
                        seat = Seat(
                            coach_id=coach.id,
                            seat_number=s_num,
                            berth_type=b_type,
                            bay_number=bay,
                            is_window=is_win,
                            is_emergency_quota=(s_num in (1, 5))
                        )
                        session.add(seat)

        session.commit()
        logger.info("Coaches and seats generated successfully.")

        # Seed realistic segment occupancies for active and recent runs
        logger.info("Populating segment occupancies across stations...")
        all_seats = session.query(Seat).join(Coach).all()

        # Find latest active runs for each train, plus latest 10 runs
        latest_runs_per_train = []
        for t in trains:
            t_runs = session.query(TrainRun).filter(TrainRun.train_id == t.id).order_by(TrainRun.run_date.desc(), TrainRun.id.desc()).limit(3).all()
            latest_runs_per_train.extend(t_runs)

        # Include first 5 runs as well for fallback
        target_runs = list({r.id: r for r in (latest_runs_per_train + runs[:5])}.values())
        logger.info("Targeting %d train runs for realistic segment occupancy seeding.", len(target_runs))

        for run in target_runs:
            train_seats = [s for s in all_seats if s.coach.train_id == run.train_id]
            for seat in train_seats:
                r_val = random.random()

                # Segment Case 1: Long haul booking NDLS -> BCT (35% of seats)
                if r_val < 0.35:
                    occ = SeatOccupancy(
                        seat_id=seat.id,
                        train_run_id=run.id,
                        from_station_id=stations["NDLS"].id,
                        to_station_id=stations["BCT"].id,
                        status=OccupancyStatus.CONFIRMED,
                        passenger_masked_pnr=f"PNR-88{seat.id % 900 + 100}",
                        scheduled_deboard_station_id=stations["BCT"].id,
                    )
                    session.add(occ)

                # Segment Case 2: Deboarding at Jaipur Junction (NDLS -> JP) (30% of seats)
                # CRITICAL: These seats become AVAILABLE from Jaipur onward!
                elif r_val < 0.65:
                    occ1 = SeatOccupancy(
                        seat_id=seat.id,
                        train_run_id=run.id,
                        from_station_id=stations["NDLS"].id,
                        to_station_id=stations["JP"].id,
                        status=OccupancyStatus.CONFIRMED,
                        passenger_masked_pnr=f"PNR-41{seat.id % 900 + 100}",
                        scheduled_deboard_station_id=stations["JP"].id,
                    )
                    session.add(occ1)

                    # 40% of these also have a subsequent booking from ADI -> BCT, leaving JP -> ADI completely vacant!
                    if random.random() < 0.40:
                        occ2 = SeatOccupancy(
                            seat_id=seat.id,
                            train_run_id=run.id,
                            from_station_id=stations["ADI"].id,
                            to_station_id=stations["BCT"].id,
                            status=OccupancyStatus.CONFIRMED,
                            passenger_masked_pnr=f"PNR-92{seat.id % 900 + 100}",
                            scheduled_deboard_station_id=stations["BCT"].id,
                        )
                        session.add(occ2)

                # Segment Case 3: Deboarding at Ahmedabad (NDLS -> ADI) (15% of seats)
                elif r_val < 0.80:
                    occ = SeatOccupancy(
                        seat_id=seat.id,
                        train_run_id=run.id,
                        from_station_id=stations["NDLS"].id,
                        to_station_id=stations["ADI"].id,
                        status=OccupancyStatus.CONFIRMED,
                        passenger_masked_pnr=f"PNR-63{seat.id % 900 + 100}",
                        scheduled_deboard_station_id=stations["ADI"].id,
                    )
                    session.add(occ)

                # Segment Case 4: Intermediate booking (JP -> AII or AII -> ADI) (10% of seats)
                elif r_val < 0.90:
                    occ = SeatOccupancy(
                        seat_id=seat.id,
                        train_run_id=run.id,
                        from_station_id=stations["JP"].id,
                        to_station_id=stations["AII"].id,
                        status=OccupancyStatus.CONFIRMED,
                        passenger_masked_pnr=f"PNR-77{seat.id % 900 + 100}",
                        scheduled_deboard_station_id=stations["AII"].id,
                    )
                    session.add(occ)

                # Segment Case 5: 10% completely vacant across entire corridor (available for all segments!)

        # Seed sample cancellation events for live demonstration
        for run in target_runs[:2]:
            cancelled_seats = [s for s in all_seats if s.coach.train_id == run.train_id][10:15]
            for cs in cancelled_seats:
                ev = SeatAvailabilityEvent(
                    train_run_id=run.id,
                    seat_id=cs.id,
                    event_type=SeatEventType.CANCELLATION,
                    station_id=stations["JP"].id,
                    details=f"Last-minute cancellation confirmed for Coach {cs.coach.coach_code} Seat {cs.seat_number}",
                    created_at=datetime.utcnow() - timedelta(minutes=random.randint(2, 25))
                )
                session.add(ev)

        session.commit()
        logger.info("Successfully seeded segment-aware seat occupancies and events.")

if __name__ == "__main__":
    seed_seats()

