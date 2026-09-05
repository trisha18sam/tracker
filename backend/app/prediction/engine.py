"""
Phase 4 — ML ETA Prediction Engine

This module loads the trained XGBoost model and uses it to predict
the travel time for each remaining section, then converts those into
absolute ETAs for upcoming stations.

Architecture:
  1. build_feature_vector()  — converts current state → feature array
  2. predict_section_time()  — XGBoost inference for one section
  3. predict_all_stations()  — chain predictions for all upcoming stations
  4. compute_confidence()    — derives confidence from historical RMSE

The engine is deliberately decoupled from the database — it operates on
plain Python dataclasses so it can be unit-tested without a DB connection.
"""
from __future__ import annotations

import json
import logging
import math
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# ─── Feature definitions ─────────────────────────────────────────────────────
# MUST match the feature list used during training (ml/training/train_model.py)

FEATURE_NAMES = [
    "current_delay_min",
    "current_speed_kmh",
    "speed_ratio",                    # current_speed / section_max_speed
    "section_hist_avg_travel_time_min",
    "section_hist_std_dev_min",
    "sections_remaining",
    "distance_remaining_km",
    "entry_delay_min",
    "recent_speed_trend",             # kmh/min over last 3 telemetry fixes
    "hour_sin",                       # sin(2π * hour / 24)
    "hour_cos",
    "dow_sin",                        # sin(2π * dow / 7)
    "dow_cos",
    "train_type_encoded",             # ordinal: PASSENGER=0 … RAJDHANI=5
    "active_speed_restriction",       # 1 if restriction applies in next section
    "speed_restriction_ratio",        # restricted_kmh / section_max_kmh
    "unscheduled_stoppage_ahead",     # 1 if stoppage event active
    "preceding_train_delay_min",
    "cumulative_dwell_excess_min",    # sum of extra dwell so far this journey
    "weather_encoded",                # CLEAR=0, RAIN=1, FOG=2, STORM=3
    "section_distance_km",
    "scheduled_travel_time_min",
    "delay_trend",                    # change in delay over last 3 fixes
]

TRAIN_TYPE_MAP = {
    "PASSENGER": 0,
    "MAIL": 1,
    "EXPRESS": 2,
    "INTERCITY": 3,
    "SUPERFAST": 4,
    "SHATABDI": 5,
    "RAJDHANI": 6,
}

WEATHER_MAP = {
    "CLEAR": 0,
    "RAIN": 1,
    "FOG": 2,
    "STORM": 3,
}


def _cyclical(value: float, period: float) -> Tuple[float, float]:
    """Encode a cyclical variable as (sin, cos)."""
    angle = 2 * math.pi * value / period
    return math.sin(angle), math.cos(angle)


def build_feature_vector(
    *,
    current_delay_min: float,
    current_speed_kmh: float,
    section_hist_avg_travel_time_min: float,
    section_hist_std_dev_min: float,
    section_max_speed_kmh: float,
    section_distance_km: float,
    scheduled_travel_time_min: float,
    sections_remaining: int,
    distance_remaining_km: float,
    entry_delay_min: float,
    recent_speed_trend: float,
    hour_of_day: int,
    day_of_week: int,
    train_type: str,
    active_speed_restriction: bool,
    speed_restriction_kmh: Optional[float],
    unscheduled_stoppage_ahead: bool,
    preceding_train_delay_min: float,
    cumulative_dwell_excess_min: float,
    weather: str,
    delay_trend: float,
) -> np.ndarray:
    """Build the feature vector for one section prediction."""

    speed_ratio = current_speed_kmh / max(section_max_speed_kmh, 1.0)
    speed_restriction_ratio = (
        speed_restriction_kmh / max(section_max_speed_kmh, 1.0)
        if active_speed_restriction and speed_restriction_kmh
        else 1.0
    )

    h_sin, h_cos = _cyclical(hour_of_day, 24)
    d_sin, d_cos = _cyclical(day_of_week, 7)

    vec = [
        current_delay_min,
        current_speed_kmh,
        speed_ratio,
        section_hist_avg_travel_time_min,
        section_hist_std_dev_min,
        float(sections_remaining),
        distance_remaining_km,
        entry_delay_min,
        recent_speed_trend,
        h_sin,
        h_cos,
        d_sin,
        d_cos,
        float(TRAIN_TYPE_MAP.get(train_type, 2)),
        1.0 if active_speed_restriction else 0.0,
        speed_restriction_ratio,
        1.0 if unscheduled_stoppage_ahead else 0.0,
        preceding_train_delay_min,
        cumulative_dwell_excess_min,
        float(WEATHER_MAP.get(weather, 0)),
        section_distance_km,
        scheduled_travel_time_min,
        delay_trend,
    ]
    return np.array(vec, dtype=np.float32).reshape(1, -1)


class ETAEngine:
    """
    The core ETA prediction engine.

    Loads the trained XGBoost model on first instantiation and caches it
    in memory. Falls back to Baseline 3 if the model file is not found.
    """

    def __init__(self, model_path: Optional[str] = None, scaler_path: Optional[str] = None):
        self.model = None
        self.scaler = None
        self._load_model(model_path, scaler_path)
        self._historical_rmse: Dict[int, float] = {}  # section_id -> RMSE

    def _load_model(self, model_path: Optional[str], scaler_path: Optional[str]) -> None:
        try:
            import joblib
            mp = model_path or os.getenv("MODEL_PATH", "ml/artifacts/xgb_model.joblib")
            sp = scaler_path or os.getenv("SCALER_PATH", "ml/artifacts/scaler.joblib")

            # Check candidate locations
            candidates_m = [
                Path(mp),
                Path(__file__).parents[3] / "ml" / "artifacts" / "xgb_model.joblib",
                Path(__file__).parents[2] / "ml" / "artifacts" / "xgb_model.joblib",
            ]
            candidates_s = [
                Path(sp),
                Path(__file__).parents[3] / "ml" / "artifacts" / "scaler.joblib",
                Path(__file__).parents[2] / "ml" / "artifacts" / "scaler.joblib",
            ]

            actual_m = next((p for p in candidates_m if p.exists()), None)
            actual_s = next((p for p in candidates_s if p.exists()), None)

            if actual_m:
                self.model = joblib.load(actual_m)
                logger.info("XGBoost model loaded from %s", actual_m)
            else:
                logger.warning("Model file not found (searched %s) — using Baseline 3 fallback", [str(p) for p in candidates_m])

            if actual_s and self.model is not None:
                self.scaler = joblib.load(actual_s)
                logger.info("Scaler loaded from %s", actual_s)
        except Exception as exc:
            logger.error("Failed to load model: %s — using Baseline 3 fallback", exc)
            self.model = None
            self.scaler = None

    def load_section_rmse(self, rmse_map: Dict[int, float]) -> None:
        """Load per-section historical RMSE values for confidence calculation."""
        self._historical_rmse = rmse_map

    def predict_section_travel_time(
        self,
        feature_vec: np.ndarray,
        hist_avg: float,
    ) -> float:
        """
        Predict travel time for one section in minutes.

        The model predicts a residual (delta from historical average).
        Final prediction = hist_avg + residual.
        Falls back to hist_avg if model unavailable.
        """
        if self.model is None:
            return hist_avg

        try:
            if self.scaler is not None:
                feature_vec = self.scaler.transform(feature_vec)
            residual = float(self.model.predict(feature_vec)[0])
            return max(1.0, hist_avg + residual)
        except Exception as exc:
            logger.error("Prediction error: %s", exc)
            return hist_avg

    def compute_confidence(
        self,
        section_id: int,
        predicted_delay_min: float,
    ) -> float:
        """
        Derive a confidence score [0.0–1.0] from historical RMSE.

        Formula: confidence = exp(-RMSE / (1 + |predicted_delay|))
        Capped between 0.30 and 0.99.
        This is a prototype estimate — explicitly labelled as such.
        """
        rmse = self._historical_rmse.get(section_id, 5.0)  # default 5-min RMSE
        delay_magnitude = abs(predicted_delay_min)
        raw = math.exp(-rmse / max(1.0, delay_magnitude + 1.0))
        # Confidence degrades as delay grows (more uncertainty)
        delay_penalty = min(0.3, delay_magnitude * 0.003)
        confidence = max(0.30, min(0.99, raw - delay_penalty + 0.4))
        return round(confidence, 3)

    def compute_prediction_interval(
        self,
        predicted_eta: datetime,
        section_rmse: float,
        z: float = 1.28,  # ~80% confidence interval
    ) -> Tuple[datetime, datetime]:
        """Compute lower and upper bound ETAs from RMSE."""
        delta = timedelta(minutes=z * section_rmse)
        return predicted_eta - delta, predicted_eta + delta

    def predict_all_stations(
        self,
        *,
        current_time: datetime,
        current_delay_min: float,
        current_speed_kmh: float,
        recent_speed_trend: float,
        delay_trend: float,
        sections: List[Dict[str, Any]],    # ordered remaining sections
        scheduled_etas: Dict[int, datetime],
        train_type: str,
        active_events: List[Dict[str, Any]],
        preceding_train_delay_min: float = 0.0,
        cumulative_dwell_excess_min: float = 0.0,
        weather: str = "CLEAR",
        current_section_fraction: float = 1.0,
    ) -> List[Dict[str, Any]]:
        """
        Predict ETAs for all upcoming stations.

        Returns a list of prediction dicts ordered by station sequence.
        """
        results = []
        accumulated_time = current_time
        accumulated_delay = current_delay_min
        accumulated_dwell_excess = cumulative_dwell_excess_min
        distance_remaining = sum(s["distance_km"] for s in sections)

        # Build event lookup
        restricted_sections = {
            e["section_id"]: e.get("speed_restriction_kmh")
            for e in active_events
            if e.get("event_type") == "SPEED_RESTRICTION" and e.get("section_id")
        }
        stoppage_sections = {
            e["section_id"]: e.get("duration_min", 5.0)
            for e in active_events
            if e.get("event_type") == "UNSCHEDULED_STOPPAGE" and e.get("section_id")
        }
        increased_dwell = {
            e.get("station_id"): e.get("duration_min", 3.0)
            for e in active_events
            if e.get("event_type") == "INCREASED_DWELL" and e.get("station_id")
        }

        for i, sec in enumerate(sections):
            hist_avg = sec.get("hist_avg_travel_time_min") or sec["scheduled_travel_time_min"]
            hist_std = sec.get("hist_std_dev_min") or 0.0
            section_id = sec["id"]

            has_restriction = section_id in restricted_sections
            restriction_kmh = restricted_sections.get(section_id)
            has_stoppage = section_id in stoppage_sections
            stoppage_dur = stoppage_sections.get(section_id, 0.0)

            fvec = build_feature_vector(
                current_delay_min=accumulated_delay,
                current_speed_kmh=current_speed_kmh,
                section_hist_avg_travel_time_min=hist_avg,
                section_hist_std_dev_min=hist_std,
                section_max_speed_kmh=sec.get("max_speed_kmh", 110.0),
                section_distance_km=sec["distance_km"],
                scheduled_travel_time_min=sec["scheduled_travel_time_min"],
                sections_remaining=len(sections) - i,
                distance_remaining_km=distance_remaining,
                entry_delay_min=accumulated_delay,
                recent_speed_trend=recent_speed_trend if i == 0 else 0.0,
                hour_of_day=accumulated_time.hour,
                day_of_week=accumulated_time.weekday(),
                train_type=train_type,
                active_speed_restriction=has_restriction,
                speed_restriction_kmh=restriction_kmh,
                unscheduled_stoppage_ahead=has_stoppage,
                preceding_train_delay_min=preceding_train_delay_min if i == 0 else 0.0,
                cumulative_dwell_excess_min=accumulated_dwell_excess,
                weather=weather,
                delay_trend=delay_trend if i == 0 else 0.0,
            )

            if i == 0:
                # Only remaining fraction of current section
                fraction = max(0.05, min(1.0, current_section_fraction))
            else:
                fraction = 1.0

            predicted_section_time = self.predict_section_travel_time(fvec, hist_avg) * fraction

            # Extra time from events
            extra_time = 0.0
            if has_stoppage:
                extra_time += stoppage_dur

            # Dwell at destination station
            dwell_base = sec.get("scheduled_dwell_min", 2.0)
            extra_dwell = increased_dwell.get(sec["to_station_id"], 0.0)
            total_dwell = dwell_base + extra_dwell
            accumulated_dwell_excess += extra_dwell

            accumulated_time = accumulated_time + timedelta(
                minutes=predicted_section_time + extra_time + total_dwell
            )
            accumulated_delay = (
                accumulated_time - scheduled_etas.get(sec["to_station_id"], accumulated_time)
            ).total_seconds() / 60.0

            distance_remaining -= sec["distance_km"]

            station_id = sec["to_station_id"]
            sched_eta = scheduled_etas.get(station_id)

            # Confidence
            section_rmse = self._historical_rmse.get(section_id, 5.0)
            confidence = self.compute_confidence(section_id, accumulated_delay)
            lower, upper = self.compute_prediction_interval(accumulated_time, section_rmse)

            # Prediction factors (simplified SHAP-style explanation)
            factors = self._build_factors(
                hist_avg_min=hist_avg,
                predicted_section_min=predicted_section_time / fraction,  # per full section
                has_restriction=has_restriction,
                restriction_kmh=restriction_kmh,
                section_max_speed=sec.get("max_speed_kmh", 110.0),
                has_stoppage=has_stoppage,
                stoppage_dur=stoppage_dur,
                extra_dwell=extra_dwell,
                current_delay=accumulated_delay,
            )

            results.append({
                "station_id": station_id,
                "predicted_eta": accumulated_time,
                "predicted_delay_min": round(accumulated_delay, 1),
                "lower_bound_eta": lower,
                "upper_bound_eta": upper,
                "confidence_score": confidence,
                "prediction_factors": factors,
                "explanation": self._build_explanation(factors, sched_eta, accumulated_time),
            })

        return results

    @staticmethod
    def _build_factors(
        *,
        hist_avg_min: float,
        predicted_section_min: float,
        has_restriction: bool,
        restriction_kmh: Optional[float],
        section_max_speed: float,
        has_stoppage: bool,
        stoppage_dur: float,
        extra_dwell: float,
        current_delay: float,
    ) -> List[Dict[str, Any]]:
        """Build human-readable prediction factors with delta contributions."""
        factors = []

        section_delta = predicted_section_min - hist_avg_min
        if abs(section_delta) > 0.5:
            factors.append({
                "factor": "section_travel_time",
                "delta_min": round(section_delta, 1),
                "description": (
                    f"Section running {abs(section_delta):.1f} min "
                    f"{'slower' if section_delta > 0 else 'faster'} than historical average"
                ),
            })

        if has_restriction and restriction_kmh:
            speed_loss_pct = (1 - restriction_kmh / max(section_max_speed, 1)) * 100
            restriction_delta = hist_avg_min * (speed_loss_pct / 100) * 0.8
            factors.append({
                "factor": "speed_restriction",
                "delta_min": round(restriction_delta, 1),
                "description": f"Speed restriction: max {restriction_kmh:.0f} km/h "
                               f"({speed_loss_pct:.0f}% speed reduction)",
            })

        if has_stoppage and stoppage_dur > 0:
            factors.append({
                "factor": "unscheduled_stoppage",
                "delta_min": round(stoppage_dur, 1),
                "description": f"Unscheduled stoppage: {stoppage_dur:.0f} min",
            })

        if extra_dwell > 0:
            factors.append({
                "factor": "increased_dwell",
                "delta_min": round(extra_dwell, 1),
                "description": f"Increased station dwell: +{extra_dwell:.0f} min",
            })

        if abs(current_delay) > 2.0:
            factors.append({
                "factor": "accumulated_delay",
                "delta_min": round(current_delay, 1),
                "description": (
                    f"Train currently running "
                    f"{'late' if current_delay > 0 else 'ahead of schedule'} by "
                    f"{abs(current_delay):.1f} min"
                ),
            })

        return factors

    @staticmethod
    def _build_explanation(
        factors: List[Dict[str, Any]],
        sched_eta: Optional[datetime],
        predicted_eta: datetime,
    ) -> str:
        if not factors:
            return "Train running as per historical pattern."
        parts = []
        for f in factors:
            delta = f["delta_min"]
            sign = "+" if delta >= 0 else ""
            parts.append(f"{sign}{delta:.1f} min — {f['description']}")
        return "\n".join(parts)


# Module-level singleton — loaded once on startup
_engine_instance: Optional[ETAEngine] = None


def get_engine() -> ETAEngine:
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = ETAEngine()
    return _engine_instance
