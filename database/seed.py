"""
Database seed script — Phase 1 + Phase 2.

Creates the demo railway network:
  - Route: Delhi → Jaipur → Ajmer → Kota → Mumbai (12 stations)
  - 2 trains on this route
  - 2000 simulated historical journeys for ML training

Run with:
  python seed.py

All data is labelled SIMULATED. This script is idempotent.
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

# Use sync engine for seed script
DATABASE_SYNC_URL = os.getenv(
    "DATABASE_SYNC_URL",
    "postgresql://sih:sih_password@localhost:5432/eta_forecast",
)

from app.database import sync_engine
from app.models import (
    Base, Station, Route, RouteSection, Train, ScheduledStop,
    TrainRun, HistoricalJourney, TrainType, TrackType, DataSource, RunStatus,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
logger = logging.getLogger(__name__)

random.seed(42)


# ── Demo network definition ───────────────────────────────────────────────────

STATIONS = [
    # (code, name, city, state, zone, lat, lon, is_junction)
    ("NDLS", "New Delhi",         "New Delhi",    "Delhi",       "NR",  28.6431, 77.2201, True),
    ("MTJ",  "Mathura Junction",  "Mathura",      "Uttar Pradesh","NCR", 27.4924, 77.6737, True),
    ("AGC",  "Agra Cantt",        "Agra",         "Uttar Pradesh","NCR", 27.1500, 77.9500, False),
    ("BXN",  "Bayana Junction",   "Bayana",       "Rajasthan",   "NWR", 26.9100, 77.2900, True),
    ("JP",   "Jaipur Junction",   "Jaipur",       "Rajasthan",   "NWR", 26.9157, 75.7878, True),
    ("AII",  "Ajmer Junction",    "Ajmer",        "Rajasthan",   "NWR", 26.4499, 74.6399, True),
    ("ABR",  "Abu Road",          "Sirohi",       "Rajasthan",   "NWR", 24.4800, 72.7800, False),
    ("PNU",  "Palanpur Junction", "Palanpur",     "Gujarat",     "WR",  24.1700, 72.4300, True),
    ("ADI",  "Ahmedabad Junction","Ahmedabad",    "Gujarat",     "WR",  23.0300, 72.5980, True),
    ("BRC",  "Vadodara Junction", "Vadodara",     "Gujarat",     "WR",  22.3200, 73.1800, True),
    ("ST",   "Surat",             "Surat",        "Gujarat",     "WR",  21.1900, 72.8300, False),
    ("BCT",  "Mumbai Central",    "Mumbai",       "Maharashtra", "WR",  18.9710, 72.8190, True),
]

# Sections: (from_code, to_code, distance_km, sched_min, hist_avg_min, hist_std_min, max_speed_kmh, track_type)
SECTIONS = [
    ("NDLS", "MTJ",  141.0, 95,  98,  8,  130, TrackType.DOUBLE_ELECTRIFIED),
    ("MTJ",  "AGC",   58.0, 35,  36,  4,  110, TrackType.DOUBLE_ELECTRIFIED),
    ("AGC",  "BXN",  155.0, 105, 110, 12, 100, TrackType.DOUBLE_ELECTRIFIED),
    ("BXN",  "JP",    95.0, 65,  68,  7,  110, TrackType.DOUBLE_ELECTRIFIED),
    ("JP",   "AII",  133.0, 90,  95,  10, 110, TrackType.DOUBLE_ELECTRIFIED),
    ("AII",  "ABR",  175.0, 120, 125, 15, 100, TrackType.SINGLE_ELECTRIFIED),
    ("ABR",  "PNU",   52.0, 38,  40,  5,  100, TrackType.SINGLE_ELECTRIFIED),
    ("PNU",  "ADI",  148.0, 105, 108, 11, 110, TrackType.DOUBLE_ELECTRIFIED),
    ("ADI",  "BRC",  100.0, 70,  72,  7,  110, TrackType.DOUBLE_ELECTRIFIED),
    ("BRC",  "ST",    90.0, 62,  64,  6,  110, TrackType.DOUBLE_ELECTRIFIED),
    ("ST",   "BCT",  263.0, 180, 188, 18, 110, TrackType.DOUBLE_ELECTRIFIED),
]

# Train schedules: (number, name, type, departure_NDLS_HH_MM, dwell_min per station)
TRAINS = [
    {
        "number": "12957",
        "name": "Ahmedabad Rajdhani Express",
        "type": TrainType.RAJDHANI,
        "origin_departure": "19:55",   # NDLS departure
        "max_speed_kmh": 130.0,
        "rake_type": "LHB",
        "stops": [
            # (station_code, scheduled_arrival_offset_min, dwell_min)
            ("NDLS", None,  None),   # origin — no arrival
            ("MTJ",  100,   3),
            ("AGC",  138,   2),
            ("BXN",  248,   2),
            ("JP",   318,   5),
            ("AII",  412,   5),
            ("ABR",  537,   2),
            ("PNU",  578,   2),
            ("ADI",  688,   8),
            ("BRC",  762,   3),
            ("ST",   828,   2),
            ("BCT",  1012,  None),   # terminus — no departure
        ],
    },
    {
        "number": "19020",
        "name": "Dehradun Mumbai Express",
        "type": TrainType.EXPRESS,
        "origin_departure": "14:30",
        "max_speed_kmh": 110.0,
        "rake_type": "ICF",
        "stops": [
            ("NDLS", None,  None),
            ("MTJ",  110,   5),
            ("AGC",  155,   3),
            ("BXN",  270,   3),
            ("JP",   345,   10),
            ("AII",  445,   8),
            ("ABR",  580,   3),
            ("PNU",  625,   3),
            ("ADI",  745,   12),
            ("BRC",  825,   5),
            ("ST",   898,   3),
            ("BCT",  1095,  None),
        ],
    },
]


def _parse_hhmm(s: str) -> tuple[int, int]:
    h, m = s.split(":")
    return int(h), int(m)


def seed_network(db: Session) -> tuple[dict, dict, dict]:
    """Seed stations, routes, sections. Returns lookup dicts."""
    logger.info("Seeding network…")
    station_map: dict[str, Station] = {}

    for code, name, city, state, zone, lat, lon, is_jn in STATIONS:
        existing = db.execute(sa.select(Station).where(Station.code == code)).scalar_one_or_none()
        if not existing:
            s = Station(
                code=code, name=name, city=city, state=state, zone=zone,
                latitude=lat, longitude=lon, is_junction=is_jn, num_platforms=4 if is_jn else 2,
            )
            db.add(s)
            db.flush()
            station_map[code] = s
        else:
            station_map[code] = existing

    db.flush()
    logger.info("  %d stations", len(station_map))

    # Route
    existing_route = db.execute(
        sa.select(Route).where(Route.name == "Delhi–Mumbai via Rajasthan–Gujarat")
    ).scalar_one_or_none()

    if not existing_route:
        route = Route(
            name="Delhi–Mumbai via Rajasthan–Gujarat",
            origin_station_id=station_map["NDLS"].id,
            destination_station_id=station_map["BCT"].id,
            total_distance_km=sum(d for _, _, d, *_ in SECTIONS),
        )
        db.add(route)
        db.flush()
    else:
        route = existing_route

    section_map: dict[tuple, RouteSection] = {}
    for seq, (f, t, dist, sched, hist_avg, hist_std, max_spd, track) in enumerate(SECTIONS, 1):
        existing_sec = db.execute(
            sa.select(RouteSection).where(
                RouteSection.route_id == route.id,
                RouteSection.sequence_number == seq,
            )
        ).scalar_one_or_none()
        if not existing_sec:
            sec = RouteSection(
                route_id=route.id,
                from_station_id=station_map[f].id,
                to_station_id=station_map[t].id,
                sequence_number=seq,
                distance_km=dist,
                scheduled_travel_time_min=float(sched),
                hist_avg_travel_time_min=float(hist_avg),
                hist_std_dev_min=float(hist_std),
                hist_p10_travel_time_min=float(hist_avg) * 0.9,
                hist_p90_travel_time_min=float(hist_avg) * 1.2,
                max_speed_kmh=float(max_spd),
                track_type=track,
                hist_sample_count=0,
            )
            db.add(sec)
            db.flush()
            section_map[(f, t)] = sec
        else:
            section_map[(f, t)] = existing_sec

    db.commit()
    logger.info("  Route seeded with %d sections", len(section_map))
    return station_map, route, section_map


def seed_trains(db: Session, station_map: dict, route: Route, section_map: dict) -> list[Train]:
    """Seed train definitions and schedules."""
    logger.info("Seeding trains…")
    trains = []
    for td in TRAINS:
        existing = db.execute(sa.select(Train).where(Train.number == td["number"])).scalar_one_or_none()
        if existing:
            trains.append(existing)
            continue

        train = Train(
            number=td["number"],
            name=td["name"],
            train_type=td["type"],
            route_id=route.id,
            rake_type=td["rake_type"],
            max_speed_kmh=td["max_speed_kmh"],
            is_active=True,
        )
        db.add(train)
        db.flush()

        # Scheduled stops
        h0, m0 = _parse_hhmm(td["origin_departure"])
        origin_offset_min = h0 * 60 + m0   # minutes from midnight

        for stop_num, (code, arr_offset, dwell) in enumerate(td["stops"], 1):
            station = station_map[code]
            dep_offset = arr_offset + dwell if arr_offset is not None and dwell else None

            # Compute arrival time string
            if arr_offset is not None:
                abs_min = origin_offset_min + arr_offset
                arr_str = f"{(abs_min // 60) % 24:02d}:{abs_min % 60:02d}"
                day_off = abs_min // (24 * 60)
            else:
                arr_str = None
                day_off = 0

            if dep_offset is not None:
                abs_dep = origin_offset_min + dep_offset
                dep_str = f"{(abs_dep // 60) % 24:02d}:{abs_dep % 60:02d}"
            else:
                # Origin: departure = origin departure time
                abs_dep = origin_offset_min
                dep_str = td["origin_departure"]
                day_off = 0

            stop = ScheduledStop(
                train_id=train.id,
                route_id=route.id,
                station_id=station.id,
                stop_number=stop_num,
                scheduled_arrival_offset_min=float(arr_offset) if arr_offset is not None else None,
                scheduled_departure_offset_min=float(dep_offset) if dep_offset is not None else float(0),
                scheduled_dwell_min=float(dwell) if dwell else 0.0,
                arrival_time_str=arr_str,
                departure_time_str=dep_str,
                day_offset=day_off,
            )
            db.add(stop)

        db.flush()
        trains.append(train)
        logger.info("  Train %s – %s seeded", train.number, train.name)

    db.commit()
    return trains


def seed_historical_journeys(
    db: Session,
    trains: list[Train],
    station_map: dict,
    section_map: dict,
    n_journeys: int = 2000,
) -> None:
    """
    Phase 2: Generate n_journeys realistic historical runs per train.

    *** ALL DATA IS SYNTHETIC / SIMULATED ***

    Distribution:
      ~10% early           (-1 to -8 min origin delay)
      ~30% on-time         (-1 to +5 min origin delay)
      ~40% moderate delay  (+5 to +25 min origin delay)
      ~20% severe delay    (+25 to +70 min origin delay)
    """
    logger.info("Generating %d historical journeys per train…", n_journeys)

    # Check if already seeded
    existing_count = db.execute(sa.select(sa.func.count(HistoricalJourney.id))).scalar()
    if existing_count > 1000:
        logger.info("  Historical data already exists (%d rows) — skipping", existing_count)
        return

    sections_ordered = [
        section_map[(SECTIONS[i][0], SECTIONS[i][1])]
        for i in range(len(SECTIONS))
    ]

    start_date = date(2025, 1, 1)
    end_date   = date(2025, 12, 31)

    total_days = (end_date - start_date).days
    days_per_journey = max(1, total_days // n_journeys)

    for train in trains:
        runs_created = 0
        current_date = start_date

        # Pre-extract section data to avoid ORM expired attribute reloads during batch commit
        sec_info = [
            (
                sec.id,
                sec.distance_km,
                sec.scheduled_travel_time_min,
                sec.hist_avg_travel_time_min or sec.scheduled_travel_time_min,
                sec.hist_std_dev_min or 3.0,
                sec.max_speed_kmh,
            )
            for sec in sections_ordered
        ]

        while runs_created < n_journeys and current_date <= end_date:
            # Skip some days randomly for realism
            if random.random() < 0.1:
                current_date += timedelta(days=1)
                continue

            # ── Origin delay category ──────────────────────────────────────
            category = random.choices(
                ["early", "ontime", "moderate", "severe"],
                weights=[10, 30, 40, 20],
            )[0]

            if category == "early":
                origin_delay = random.uniform(-8, -1)
            elif category == "ontime":
                origin_delay = random.uniform(-1, 5)
            elif category == "moderate":
                origin_delay = random.uniform(5, 25)
            else:
                origin_delay = random.uniform(25, 70)

            # Hour/day context
            h0 = 19 if train.number == "12957" else 14
            journey_start = datetime(
                current_date.year, current_date.month, current_date.day, h0, 0, 0
            ) + timedelta(minutes=origin_delay)

            run = TrainRun(
                train_id=train.id,
                run_date=current_date,
                status=RunStatus.ARRIVED,
                data_source=DataSource.SIMULATED,
                origin_delay_min=origin_delay,
                current_delay_min=origin_delay,
                journey_start_time=journey_start,
            )
            db.add(run)
            db.flush()

            cumulative_time = journey_start
            cumulative_delay = origin_delay
            cumulative_dwell_excess = 0.0

            # Weather for this journey
            weather_roll = random.random()
            weather = (
                "FOG" if (weather_roll < 0.05 and current_date.month in [12, 1, 2]) else
                "RAIN" if weather_roll < 0.15 else
                "CLEAR"
            )

            # Preceding train delay
            preceding_delay = random.gauss(0, 5) if random.random() < 0.2 else 0.0
            preceding_delay = max(0.0, preceding_delay)

            for sec_id, sec_dist_km, sched_tt, hist_avg, hist_std, max_speed_kmh in sec_info:
                # Per-section random events
                has_restriction = random.random() < 0.04
                restriction_kmh = random.uniform(40, 75) if has_restriction else None
                has_unscheduled_stop = random.random() < 0.02
                unscheduled_stop_dur = random.uniform(3, 15) if has_unscheduled_stop else 0.0

                # Actual travel time — Gaussian around hist_avg, modified by events
                base_travel = random.gauss(hist_avg, hist_std)
                base_travel = max(hist_avg * 0.8, base_travel)

                if has_restriction and restriction_kmh:
                    speed_loss = (1 - restriction_kmh / max_speed_kmh)
                    base_travel *= (1 + speed_loss * 0.7)

                if weather == "FOG":
                    base_travel *= random.uniform(1.05, 1.20)
                elif weather == "RAIN":
                    base_travel *= random.uniform(1.02, 1.10)

                # Delay recovery effect (trains try to recover when moderate delay)
                if 5 < cumulative_delay < 20:
                    base_travel *= random.uniform(0.95, 1.0)

                actual_travel = max(hist_avg * 0.7, base_travel) + unscheduled_stop_dur

                # Dwell
                sched_dwell = 2.0
                actual_dwell = sched_dwell + random.gauss(0, 1.0)
                actual_dwell = max(0.5, actual_dwell)
                if category == "severe":
                    actual_dwell += random.uniform(0, 3)
                dwell_excess = actual_dwell - sched_dwell
                cumulative_dwell_excess += max(0, dwell_excess)

                entry_delay = cumulative_delay
                section_entry = cumulative_time
                section_exit = cumulative_time + timedelta(minutes=actual_travel)

                # Exit delay
                exit_delay = entry_delay + (actual_travel - sched_tt)

                avg_speed = (sec_dist_km / max(actual_travel, 0.1)) * 60.0

                hj = HistoricalJourney(
                    run_id=run.id,
                    section_id=sec_id,
                    section_entry_time=section_entry,
                    section_exit_time=section_exit,
                    actual_travel_time_min=round(actual_travel, 2),
                    scheduled_travel_time_min=sched_tt,
                    entry_delay_min=round(entry_delay, 2),
                    exit_delay_min=round(exit_delay, 2),
                    actual_dwell_time_min=round(actual_dwell, 2),
                    scheduled_dwell_time_min=sched_dwell,
                    entry_speed_kmh=round(avg_speed * random.uniform(0.9, 1.1), 1),
                    avg_speed_kmh=round(avg_speed, 1),
                    hour_of_entry=section_entry.hour,
                    day_of_week=section_entry.weekday(),
                    had_speed_restriction=has_restriction,
                    had_unscheduled_stop=has_unscheduled_stop,
                    preceding_train_delay_min=round(preceding_delay, 1),
                    weather_condition=weather,
                    data_source=DataSource.SIMULATED,
                )
                db.add(hj)

                cumulative_time = section_exit + timedelta(minutes=actual_dwell)
                cumulative_delay = exit_delay

            # Update section stats from this run (simplified — full stats done by ML pipeline)
            runs_created += 1
            current_date += timedelta(days=days_per_journey)

            if runs_created % 100 == 0:
                db.commit()
                logger.info("  %d/%d journeys created for train %s", runs_created, n_journeys, train.number)

        db.commit()
        logger.info("  Finished %d journeys for train %s", runs_created, train.number)

    logger.info("Historical seeding complete.")


def update_section_stats(db: Session, section_map: dict) -> None:
    """Recompute hist_avg, hist_std, p10, p90 from generated data."""
    logger.info("Updating section statistics…")
    import numpy as np

    for sec in section_map.values():
        rows = db.execute(
            sa.select(HistoricalJourney.actual_travel_time_min)
            .where(HistoricalJourney.section_id == sec.id)
        ).scalars().all()

        if not rows:
            continue

        arr = np.array(rows, dtype=float)
        sec.hist_avg_travel_time_min = float(np.mean(arr))
        sec.hist_std_dev_min = float(np.std(arr))
        sec.hist_p10_travel_time_min = float(np.percentile(arr, 10))
        sec.hist_p90_travel_time_min = float(np.percentile(arr, 90))
        sec.hist_sample_count = len(arr)

    db.commit()
    logger.info("Section stats updated.")


if __name__ == "__main__":
    logger.info("Creating database tables…")
    Base.metadata.create_all(sync_engine)

    with Session(sync_engine) as db:
        station_map, route, section_map = seed_network(db)
        trains = seed_trains(db, station_map, route, section_map)
        seed_historical_journeys(db, trains, station_map, section_map, n_journeys=1000)
        update_section_stats(db, section_map)

    logger.info("✓ Seed complete. Database is ready.")
