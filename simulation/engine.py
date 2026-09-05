"""
Phase 6 — Real-time train simulation engine.

Simulates live telemetry for a train run at 60× wall-clock speed.
Posts TrainTelemetry to POST /telemetry every SIM_TELEMETRY_INTERVAL_SEC real seconds.

In demonstration mode the operator injects events via the dashboard,
which calls POST /simulation/events. The simulation engine reads active events
and modifies speed/position accordingly on the next telemetry tick.

This engine is a standalone async process.

Usage:
  python engine.py --train-id 1 --run-date 2026-09-05 --delay 0
  python engine.py --train-id 1 --delay 12   # start 12 minutes late
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import math
import os
import random
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger(__name__)

BACKEND_URL = os.getenv("BACKEND_API_URL", "http://localhost:8000")
SIM_SPEED_FACTOR = int(os.getenv("SIM_SPEED_FACTOR", "60"))         # 1 real sec = N sim secs
SIM_INTERVAL_SEC = float(os.getenv("SIM_TELEMETRY_INTERVAL_SEC", "2"))  # real seconds between ticks


# ── Geometry helpers ──────────────────────────────────────────────────────────

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km."""
    R = 6371.0
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lon2 - lon1)
    a = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def interpolate_position(
    lat1: float, lon1: float, lat2: float, lon2: float, fraction: float
) -> Tuple[float, float]:
    """Linear interpolation between two lat/lon points."""
    fraction = max(0.0, min(1.0, fraction))
    return lat1 + (lat2 - lat1) * fraction, lon1 + (lon2 - lon1) * fraction


# ── Simulation state ──────────────────────────────────────────────────────────

class TrainSimulator:
    """
    Drives a single train run from origin to destination.

    State machine:
      - Moves through sections at a speed determined by:
          1. Section max speed
          2. Any active SPEED_RESTRICTION event
          3. Random normal variation
      - At each station: dwells for scheduled_dwell_min + any INCREASED_DWELL event
    """

    def __init__(
        self,
        run_id: int,
        train_id: int,
        schedule: List[Dict],     # ordered list of stops: {station_id, lat, lon, arr_offset, dep_offset, dwell_min}
        sections: List[Dict],     # ordered route sections: {id, from_station_id, to_station_id, distance_km, sched_min, max_speed_kmh, from_lat, from_lon, to_lat, to_lon}
        origin_delay_min: float,
        journey_start: datetime,
        http_client: httpx.AsyncClient,
    ) -> None:
        self.run_id = run_id
        self.train_id = train_id
        self.schedule = schedule
        self.sections = sections
        self.origin_delay_min = origin_delay_min
        self.journey_start = journey_start
        self.client = http_client

        self.sim_time = journey_start  # current simulated time
        self.current_section_idx = 0
        self.section_fraction = 0.0   # 0.0 = just entered, 1.0 = at destination
        self.current_delay_min = origin_delay_min
        self.distance_covered_km = 0.0
        self.active_events: List[Dict] = []
        self.finished = False

    @property
    def current_section(self) -> Optional[Dict]:
        if self.current_section_idx < len(self.sections):
            return self.sections[self.current_section_idx]
        return None

    def _effective_speed(self, section: Dict) -> float:
        """Current speed considering active restrictions."""
        base = section["max_speed_kmh"] * random.uniform(0.82, 0.95)

        # Check for active speed restriction on this section
        for ev in self.active_events:
            if (
                ev.get("event_type") == "SPEED_RESTRICTION"
                and ev.get("section_id") == section["id"]
                and ev.get("speed_restriction_kmh")
            ):
                base = min(base, ev["speed_restriction_kmh"] * random.uniform(0.9, 1.0))

        # Maintenance block / signal failure
        for ev in self.active_events:
            if ev.get("event_type") in ("MAINTENANCE_BLOCK", "SIGNAL_FAILURE"):
                if ev.get("section_id") == section["id"]:
                    base = min(base, 30.0)

        return max(10.0, base)

    def _dwell_for_station(self, station_id: int, base_dwell: float) -> float:
        """Dwell time including any INCREASED_DWELL event."""
        extra = 0.0
        for ev in self.active_events:
            if ev.get("event_type") == "INCREASED_DWELL" and ev.get("station_id") == station_id:
                extra += ev.get("duration_min", 3.0)
        return base_dwell + extra

    def _stoppage_for_section(self, section_id: int) -> float:
        """Extra minutes from UNSCHEDULED_STOPPAGE event in this section."""
        for ev in self.active_events:
            if ev.get("event_type") == "UNSCHEDULED_STOPPAGE" and ev.get("section_id") == section_id:
                return ev.get("duration_min", 5.0)
        return 0.0

    async def fetch_active_events(self) -> None:
        """Poll backend for currently active events for this run."""
        try:
            resp = await self.client.get(
                f"{BACKEND_URL}/api/v1/trains/{self.train_id}/live",
                timeout=5.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                self.active_events = data.get("active_events", [])
        except Exception as exc:
            logger.warning("Could not fetch events: %s", exc)

    async def post_telemetry(self, speed_kmh: float, lat: float, lon: float) -> None:
        """POST a telemetry fix to the backend."""
        payload = {
            "run_id": self.run_id,
            "timestamp": self.sim_time.isoformat(),
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "speed_kmh": round(speed_kmh, 1),
            "distance_covered_km": round(self.distance_covered_km, 2),
            "cumulative_delay_min": round(self.current_delay_min, 2),
            "current_section_id": self.current_section["id"] if self.current_section else None,
            "data_source": "SIMULATED",
            "raw_payload": {
                "sim_section_idx": self.current_section_idx,
                "sim_fraction": round(self.section_fraction, 3),
                "active_events": len(self.active_events),
            },
        }
        try:
            resp = await self.client.post(
                f"{BACKEND_URL}/api/v1/telemetry",
                json=payload,
                timeout=10.0,
            )
            if resp.status_code not in (200, 201):
                logger.warning("Telemetry rejected: %s %s", resp.status_code, resp.text[:200])
            else:
                logger.info(
                    "✓ SIM t=%s  delay=%.1f min  speed=%.0f km/h  section=%d/%d",
                    self.sim_time.strftime("%H:%M:%S"),
                    self.current_delay_min,
                    speed_kmh,
                    self.current_section_idx + 1,
                    len(self.sections),
                )
        except Exception as exc:
            logger.error("POST /telemetry failed: %s", exc)

    async def run(self) -> None:
        """Main simulation loop."""
        sim_seconds_per_tick = SIM_INTERVAL_SEC * SIM_SPEED_FACTOR  # sim seconds per real tick
        sim_min_per_tick = sim_seconds_per_tick / 60.0

        logger.info(
            "Simulation started: run_id=%d  origin_delay=%.1f min  speed_factor=%dx",
            self.run_id, self.origin_delay_min, SIM_SPEED_FACTOR,
        )

        while not self.finished:
            await self.fetch_active_events()

            sec = self.current_section
            if sec is None:
                logger.info("Train arrived at terminus. Simulation complete.")
                self.finished = True
                break

            effective_speed = self._effective_speed(sec)
            lat, lon = interpolate_position(
                sec["from_lat"], sec["from_lon"],
                sec["to_lat"],   sec["to_lon"],
                self.section_fraction,
            )

            await self.post_telemetry(effective_speed, lat, lon)

            # Advance position
            km_per_tick = (effective_speed / 60.0) * sim_min_per_tick
            section_km_remaining = sec["distance_km"] * (1.0 - self.section_fraction)
            self.distance_covered_km += min(km_per_tick, section_km_remaining)

            section_fraction_advance = km_per_tick / max(sec["distance_km"], 0.1)
            self.section_fraction += section_fraction_advance

            # Check for UNSCHEDULED_STOPPAGE
            stop_extra = self._stoppage_for_section(sec["id"])
            if stop_extra > 0:
                logger.info("  Unscheduled stoppage: %.0f min", stop_extra)
                self.sim_time += timedelta(minutes=stop_extra)
                self.current_delay_min += stop_extra

            # Advance simulated time
            self.sim_time += timedelta(minutes=sim_min_per_tick)

            # Reached end of section?
            if self.section_fraction >= 1.0:
                self.section_fraction = 0.0
                # Dwell at destination station
                to_station_id = sec["to_station_id"]
                stop = next(
                    (s for s in self.schedule if s["station_id"] == to_station_id), None
                )
                base_dwell = stop["dwell_min"] if stop else 2.0
                total_dwell = self._dwell_for_station(to_station_id, base_dwell)

                # Update delay
                if stop and stop.get("arr_offset") is not None:
                    sched_arr = self.journey_start + timedelta(minutes=stop["arr_offset"])
                    self.current_delay_min = (self.sim_time - sched_arr).total_seconds() / 60.0

                logger.info(
                    "  → Arrived %s. Dwell %.1f min. Delay %.1f min.",
                    stop["station_name"] if stop else str(to_station_id),
                    total_dwell,
                    self.current_delay_min,
                )
                self.sim_time += timedelta(minutes=total_dwell)
                self.current_section_idx += 1

                if self.current_section_idx >= len(self.sections):
                    logger.info("Train reached terminus!")
                    self.finished = True
                    break

            # Wait for next real-time tick
            await asyncio.sleep(SIM_INTERVAL_SEC)


# ── Bootstrap ─────────────────────────────────────────────────────────────────

async def bootstrap(train_id: int, run_date: date, origin_delay: float) -> None:
    """Fetch route/schedule from backend, create run, start simulation."""
    async with httpx.AsyncClient() as client:
        # 1. Fetch train detail
        resp = await client.get(f"{BACKEND_URL}/api/v1/trains/{train_id}", timeout=10)
        resp.raise_for_status()
        train_data = resp.json()

        # 2. Start simulation run
        start_resp = await client.post(
            f"{BACKEND_URL}/api/v1/simulation/start",
            json={
                "train_id": train_id,
                "run_date": run_date.isoformat(),
                "origin_delay_min": origin_delay,
            },
            timeout=10,
        )
        start_resp.raise_for_status()
        run_data = start_resp.json()
        run_id = run_data["run_id"]
        logger.info("Run created: run_id=%d", run_id)

        # 3. Build schedule list
        stops = train_data["scheduled_stops"]
        schedule = [
            {
                "station_id": s["station"]["id"],
                "station_name": s["station"]["name"],
                "lat": s["station"]["latitude"],
                "lon": s["station"]["longitude"],
                "arr_offset": s.get("scheduled_arrival_offset_min"),
                "dwell_min": s.get("scheduled_dwell_min", 2.0),
            }
            for s in stops
        ]

        # 4. Build sections list
        route_sections = train_data["route"]["sections"]
        sections = [
            {
                "id": sec["id"],
                "from_station_id": sec["from_station"]["id"],
                "to_station_id": sec["to_station"]["id"],
                "distance_km": sec["distance_km"],
                "sched_min": sec["scheduled_travel_time_min"],
                "max_speed_kmh": sec["max_speed_kmh"],
                "from_lat": sec["from_station"]["latitude"],
                "from_lon": sec["from_station"]["longitude"],
                "to_lat": sec["to_station"]["latitude"],
                "to_lon": sec["to_station"]["longitude"],
            }
            for sec in route_sections
        ]

        # 5. Determine journey start
        h0 = 19 if train_id == 1 else 14  # simplified: get from timetable
        journey_start = datetime(
            run_date.year, run_date.month, run_date.day, h0, 0, 0
        ) + timedelta(minutes=origin_delay)

        # 6. Run simulation
        sim = TrainSimulator(
            run_id=run_id,
            train_id=train_id,
            schedule=schedule,
            sections=sections,
            origin_delay_min=origin_delay,
            journey_start=journey_start,
            http_client=client,
        )
        await sim.run()


def main():
    parser = argparse.ArgumentParser(description="SIH26028 Train Simulation Engine")
    parser.add_argument("--train-id", type=int, default=1, help="Train ID to simulate")
    parser.add_argument("--run-date", type=str, default=None, help="Run date YYYY-MM-DD")
    parser.add_argument("--delay", type=float, default=0.0, help="Origin delay in minutes")
    args = parser.parse_args()

    run_date = date.fromisoformat(args.run_date) if args.run_date else date.today()

    asyncio.run(bootstrap(args.train_id, run_date, args.delay))


if __name__ == "__main__":
    main()
