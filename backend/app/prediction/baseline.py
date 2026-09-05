"""
Phase 3 — Baseline ETA algorithms.

Three baselines are implemented for comparison against our ML model:

  Baseline 1 — Scheduled ETA (no adjustment whatsoever)
  Baseline 2 — Current delay propagated forward to every station
  Baseline 3 — Historical section-time adjusted for current speed ratio

These run in O(n_remaining_sections) and require no ML model.
They are also used as fallback when the model artifact is unavailable.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from dataclasses import dataclass


@dataclass
class SectionInfo:
    """Lightweight data container for one route section."""
    section_id: int
    from_station_id: int
    to_station_id: int
    distance_km: float
    scheduled_travel_time_min: float
    hist_avg_travel_time_min: float       # fallback to scheduled if None
    hist_std_dev_min: float               # fallback to 0 if None
    hist_p10_travel_time_min: float       # optimistic bound
    hist_p90_travel_time_min: float       # pessimistic bound
    max_speed_kmh: float
    scheduled_dwell_min: float = 2.0     # dwell at from_station


@dataclass
class TrainState:
    """Current observed state of a running train."""
    current_time: datetime
    current_speed_kmh: float
    cumulative_delay_min: float          # +ve = late, -ve = early
    distance_covered_km: float
    current_section_id: Optional[int]
    active_speed_restriction_kmh: Optional[float] = None
    recent_speed_trend_kmh_per_min: float = 0.0   # slope of last 3 speed readings


@dataclass
class BaselineETA:
    """Output of a single baseline computation."""
    station_id: int
    baseline1_eta: datetime   # Scheduled
    baseline2_eta: datetime   # Delay propagation
    baseline3_eta: datetime   # Historical section-time adjusted


def baseline1_scheduled(
    scheduled_eta: datetime,
) -> datetime:
    """
    Baseline 1: Simply return the published scheduled ETA.
    Zero intelligence — the original timetable, unchanged.
    """
    return scheduled_eta


def baseline2_delay_propagation(
    scheduled_eta: datetime,
    current_delay_min: float,
) -> datetime:
    """
    Baseline 2: Add the current known delay to scheduled ETA.
    Assumes delay stays constant — no recovery, no worsening.
    """
    return scheduled_eta + timedelta(minutes=current_delay_min)


def baseline3_historical_adjusted(
    current_time: datetime,
    current_delay_min: float,
    current_speed_kmh: float,
    remaining_sections: List[SectionInfo],
    current_section_fraction_remaining: float = 1.0,
    active_speed_restriction_kmh: Optional[float] = None,
) -> datetime:
    """
    Baseline 3: Historical section-time adjusted for current speed ratio.

    For each remaining section:
      speed_factor = effective_speed / hist_typical_speed
      predicted_section_time = hist_avg_travel_time / speed_factor
      (clamped to ± 50% of historical average)

    Then sum predicted section times + dwell times.
    """
    if not remaining_sections:
        return current_time

    # Estimate effective speed for current and upcoming sections
    effective_speed = current_speed_kmh
    if active_speed_restriction_kmh and active_speed_restriction_kmh < effective_speed:
        effective_speed = active_speed_restriction_kmh
    if effective_speed < 10.0:
        effective_speed = 30.0  # minimum sensible speed when barely moving

    accumulated_min = 0.0

    for i, sec in enumerate(remaining_sections):
        hist_avg = sec.hist_avg_travel_time_min or sec.scheduled_travel_time_min
        hist_std = sec.hist_std_dev_min or 0.0

        # Historical typical speed for this section
        if hist_avg > 0:
            hist_typical_speed = (sec.distance_km / hist_avg) * 60.0  # km/h
        else:
            hist_typical_speed = sec.max_speed_kmh * 0.7

        if hist_typical_speed <= 0:
            hist_typical_speed = 60.0

        # Apply speed ratio only to the first section (current position)
        if i == 0:
            speed_ratio = effective_speed / hist_typical_speed
        else:
            # Future sections: assume train recovers toward normal speed
            speed_ratio = 1.0

        speed_ratio = max(0.5, min(1.5, speed_ratio))  # clamp to ±50%

        predicted_section_time = hist_avg / speed_ratio

        if i == 0:
            # Only the remaining fraction of the current section
            predicted_section_time *= current_section_fraction_remaining

        accumulated_min += predicted_section_time
        accumulated_min += sec.scheduled_dwell_min  # dwell at destination station

    return current_time + timedelta(minutes=accumulated_min)


def compute_all_baselines(
    state: TrainState,
    sections: List[SectionInfo],
    scheduled_etas: Dict[int, datetime],    # station_id -> scheduled datetime
    current_section_fraction: float = 1.0,
) -> Dict[int, BaselineETA]:
    """
    Compute all three baselines for every upcoming station.

    Returns a dict keyed by station_id.
    """
    results: Dict[int, BaselineETA] = {}

    for i, section in enumerate(sections):
        target_station = section.to_station_id
        sched_eta = scheduled_etas.get(target_station)
        if sched_eta is None:
            continue

        b1 = baseline1_scheduled(sched_eta)
        b2 = baseline2_delay_propagation(sched_eta, state.cumulative_delay_min)
        b3 = baseline3_historical_adjusted(
            current_time=state.current_time,
            current_delay_min=state.cumulative_delay_min,
            current_speed_kmh=state.current_speed_kmh,
            remaining_sections=sections[i:],
            current_section_fraction_remaining=current_section_fraction if i == 0 else 1.0,
            active_speed_restriction_kmh=state.active_speed_restriction_kmh,
        )

        results[target_station] = BaselineETA(
            station_id=target_station,
            baseline1_eta=b1,
            baseline2_eta=b2,
            baseline3_eta=b3,
        )

    return results
