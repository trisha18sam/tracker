"""
SQLAlchemy ORM models for the SIH26028 Dynamic ETA Forecast system.

All entities are labelled with data_source='SIMULATED' in prototype mode.
The architecture allows real IRCTC/NTES feeds to replace synthetic data
without changing the prediction engine.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, time
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    Interval,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import relationship
from app.models_base import Base, BigIntPK


# ──────────────────────────────────────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────────────────────────────────────

class TrainType(str, enum.Enum):
    EXPRESS = "EXPRESS"
    MAIL = "MAIL"
    SUPERFAST = "SUPERFAST"
    RAJDHANI = "RAJDHANI"
    SHATABDI = "SHATABDI"
    PASSENGER = "PASSENGER"
    INTERCITY = "INTERCITY"


class TrackType(str, enum.Enum):
    DOUBLE_ELECTRIFIED = "DOUBLE_ELECTRIFIED"
    SINGLE_ELECTRIFIED = "SINGLE_ELECTRIFIED"
    DOUBLE_NON_ELECTRIFIED = "DOUBLE_NON_ELECTRIFIED"
    SINGLE_NON_ELECTRIFIED = "SINGLE_NON_ELECTRIFIED"


class DataSource(str, enum.Enum):
    SIMULATED = "SIMULATED"   # Synthetic/demo data — clearly labelled
    LIVE = "LIVE"             # Real IRCTC/NTES feed (future integration)
    ESTIMATED = "ESTIMATED"   # Interpolated between two live fixes


class RunStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    RUNNING = "RUNNING"
    ARRIVED = "ARRIVED"
    CANCELLED = "CANCELLED"
    DIVERTED = "DIVERTED"


class EventType(str, enum.Enum):
    SPEED_RESTRICTION = "SPEED_RESTRICTION"
    UNSCHEDULED_STOPPAGE = "UNSCHEDULED_STOPPAGE"
    INCREASED_DWELL = "INCREASED_DWELL"
    SIGNAL_FAILURE = "SIGNAL_FAILURE"
    CONGESTION = "CONGESTION"
    MAINTENANCE_BLOCK = "MAINTENANCE_BLOCK"
    CREW_CHANGE = "CREW_CHANGE"
    WEATHER = "WEATHER"
    PRECEDING_TRAIN_DELAY = "PRECEDING_TRAIN_DELAY"




# ──────────────────────────────────────────────────────────────────────────────
# Core network entities
# ──────────────────────────────────────────────────────────────────────────────

class Station(Base):
    """A railway station on the network."""
    __tablename__ = "stations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), unique=True, nullable=False, index=True)  # e.g. "NDLS"
    name = Column(String(100), nullable=False)
    city = Column(String(100))
    state = Column(String(100))
    zone = Column(String(20))        # e.g. "NR", "WR"
    division = Column(String(30))
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    elevation_m = Column(Float)
    num_platforms = Column(Integer, default=1)
    is_junction = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    stops_as_departure = relationship("ScheduledStop", foreign_keys="ScheduledStop.station_id", back_populates="station")
    sections_from = relationship("RouteSection", foreign_keys="RouteSection.from_station_id", back_populates="from_station")
    sections_to = relationship("RouteSection", foreign_keys="RouteSection.to_station_id", back_populates="to_station")


class Route(Base):
    """A named train route from origin to destination."""
    __tablename__ = "routes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)  # e.g. "Delhi-Jaipur-Mumbai Express Route"
    origin_station_id = Column(Integer, ForeignKey("stations.id"), nullable=False)
    destination_station_id = Column(Integer, ForeignKey("stations.id"), nullable=False)
    total_distance_km = Column(Float)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    origin_station = relationship("Station", foreign_keys=[origin_station_id])
    destination_station = relationship("Station", foreign_keys=[destination_station_id])
    sections = relationship("RouteSection", back_populates="route", order_by="RouteSection.sequence_number")
    trains = relationship("Train", back_populates="route")
    scheduled_stops = relationship("ScheduledStop", back_populates="route")


class RouteSection(Base):
    """
    A section of a route between two consecutive stations.

    Contains both static schedule data and historical performance statistics
    used by the ETA prediction engine.
    """
    __tablename__ = "route_sections"
    __table_args__ = (
        UniqueConstraint("route_id", "sequence_number", name="uq_route_section_seq"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    route_id = Column(Integer, ForeignKey("routes.id"), nullable=False, index=True)
    from_station_id = Column(Integer, ForeignKey("stations.id"), nullable=False)
    to_station_id = Column(Integer, ForeignKey("stations.id"), nullable=False)
    sequence_number = Column(Integer, nullable=False)  # 1-based ordering on route

    # Static geometry / track
    distance_km = Column(Float, nullable=False)
    track_type = Column(Enum(TrackType), default=TrackType.DOUBLE_ELECTRIFIED)
    max_speed_kmh = Column(Float, nullable=False, default=110.0)

    # Scheduled performance
    scheduled_travel_time_min = Column(Float, nullable=False)

    # Historical performance statistics (populated from HistoricalJourney records)
    hist_avg_travel_time_min = Column(Float)
    hist_std_dev_min = Column(Float)
    hist_p10_travel_time_min = Column(Float)   # Optimistic bound
    hist_p90_travel_time_min = Column(Float)   # Pessimistic bound
    hist_sample_count = Column(Integer, default=0)

    # Speed characteristics
    typical_entry_speed_kmh = Column(Float)
    typical_exit_speed_kmh = Column(Float)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    route = relationship("Route", back_populates="sections")
    from_station = relationship("Station", foreign_keys=[from_station_id], back_populates="sections_from")
    to_station = relationship("Station", foreign_keys=[to_station_id], back_populates="sections_to")
    historical_journeys = relationship("HistoricalJourney", back_populates="section")


# ──────────────────────────────────────────────────────────────────────────────
# Train entities
# ──────────────────────────────────────────────────────────────────────────────

class Train(Base):
    """A named train with a fixed schedule on a route."""
    __tablename__ = "trains"

    id = Column(Integer, primary_key=True, autoincrement=True)
    number = Column(String(10), unique=True, nullable=False, index=True)  # e.g. "12952"
    name = Column(String(200), nullable=False)   # e.g. "Mumbai Rajdhani"
    train_type = Column(Enum(TrainType), nullable=False, default=TrainType.EXPRESS)
    route_id = Column(Integer, ForeignKey("routes.id"), nullable=False)
    rake_type = Column(String(50))               # e.g. "LHB", "ICF"
    max_speed_kmh = Column(Float, default=110.0)
    runs_on_days = Column(String(20), default="1234567")  # bitmask Mon=1 … Sun=7
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    route = relationship("Route", back_populates="trains")
    scheduled_stops = relationship("ScheduledStop", back_populates="train", order_by="ScheduledStop.stop_number")
    runs = relationship("TrainRun", back_populates="train")
    coaches = relationship("Coach", back_populates="train", cascade="all, delete-orphan")


class ScheduledStop(Base):
    """
    The official timetable entry for a train at a station.

    Scheduled arrival/departure are stored as offsets from journey-start
    so a single schedule covers all run dates.
    """
    __tablename__ = "scheduled_stops"
    __table_args__ = (
        UniqueConstraint("train_id", "station_id", name="uq_train_station"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    train_id = Column(Integer, ForeignKey("trains.id"), nullable=False, index=True)
    route_id = Column(Integer, ForeignKey("routes.id"), nullable=False)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=False, index=True)
    stop_number = Column(Integer, nullable=False)  # 1 = origin

    # Offset in minutes from journey-start at origin station
    scheduled_arrival_offset_min = Column(Float)   # Null for origin
    scheduled_departure_offset_min = Column(Float)  # Null for terminus
    scheduled_dwell_min = Column(Float, default=2.0)

    # Absolute times for display (HH:MM)
    arrival_time_str = Column(String(5))    # e.g. "18:30"
    departure_time_str = Column(String(5))
    day_offset = Column(Integer, default=0) # 0=same day, 1=next day etc.

    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    train = relationship("Train", back_populates="scheduled_stops")
    route = relationship("Route", back_populates="scheduled_stops")
    station = relationship("Station", back_populates="stops_as_departure")


# ──────────────────────────────────────────────────────────────────────────────
# Runtime entities
# ──────────────────────────────────────────────────────────────────────────────

class TrainRun(Base):
    """
    A single running instance of a train on a specific date.

    One Train has many TrainRuns (one per operating day).
    """
    __tablename__ = "train_runs"
    __table_args__ = (
        UniqueConstraint("train_id", "run_date", name="uq_train_run_date"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    train_id = Column(Integer, ForeignKey("trains.id"), nullable=False, index=True)
    run_date = Column(Date, nullable=False, index=True)
    status = Column(Enum(RunStatus), default=RunStatus.SCHEDULED)
    data_source = Column(Enum(DataSource), default=DataSource.SIMULATED)

    # Delay at origin (minutes, negative = early)
    origin_delay_min = Column(Float, default=0.0)
    # Overall delay at last known position
    current_delay_min = Column(Float, default=0.0)
    current_section_id = Column(Integer, ForeignKey("route_sections.id"), nullable=True)

    journey_start_time = Column(DateTime)  # Actual departure from origin
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    train = relationship("Train", back_populates="runs")
    telemetry = relationship("TrainTelemetry", back_populates="run", order_by="TrainTelemetry.timestamp")
    historical_journeys = relationship("HistoricalJourney", back_populates="run")
    operational_events = relationship("OperationalEvent", back_populates="run")
    eta_predictions = relationship("ETAPrediction", back_populates="run")
    current_section = relationship("RouteSection", foreign_keys=[current_section_id])
    seat_occupancies = relationship("SeatOccupancy", back_populates="train_run", cascade="all, delete-orphan")


class TrainTelemetry(Base):
    """
    A single telemetry fix for a running train.

    In prototype: posted by the simulation engine (data_source=SIMULATED).
    In production: posted by IRCTC/NTES API adapter (data_source=LIVE).
    """
    __tablename__ = "train_telemetry"

    id = Column(BigIntPK, primary_key=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("train_runs.id"), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)

    # Position
    latitude = Column(Float)
    longitude = Column(Float)
    current_station_id = Column(Integer, ForeignKey("stations.id"), nullable=True)
    current_section_id = Column(Integer, ForeignKey("route_sections.id"), nullable=True)

    # Motion
    speed_kmh = Column(Float, default=0.0)
    direction_deg = Column(Float)           # Compass bearing
    distance_covered_km = Column(Float)     # From route origin

    # Schedule adherence
    cumulative_delay_min = Column(Float, default=0.0)  # +ve = late, -ve = early

    # Source label — never removed even if data later connected to LIVE feed
    data_source = Column(Enum(DataSource), default=DataSource.SIMULATED)
    raw_payload = Column(JSON)  # Original API response (if LIVE), or sim params

    # Relationships
    run = relationship("TrainRun", back_populates="telemetry")
    current_station = relationship("Station", foreign_keys=[current_station_id])
    current_section = relationship("RouteSection", foreign_keys=[current_section_id])


# ──────────────────────────────────────────────────────────────────────────────
# Historical data entities
# ──────────────────────────────────────────────────────────────────────────────

class HistoricalJourney(Base):
    """
    Per-section performance record from a completed TrainRun.

    This is the primary training data for the ML model.
    Each row = one train passing through one route section on one date.
    """
    __tablename__ = "historical_journeys"

    id = Column(BigIntPK, primary_key=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("train_runs.id"), nullable=False, index=True)
    section_id = Column(Integer, ForeignKey("route_sections.id"), nullable=False, index=True)

    # Section timing
    section_entry_time = Column(DateTime)
    section_exit_time = Column(DateTime)
    actual_travel_time_min = Column(Float, nullable=False)
    scheduled_travel_time_min = Column(Float, nullable=False)

    # Delay state
    entry_delay_min = Column(Float, default=0.0)   # Delay when entering section
    exit_delay_min = Column(Float, default=0.0)    # Delay when exiting section

    # Station dwell at from_station
    actual_dwell_time_min = Column(Float)
    scheduled_dwell_time_min = Column(Float)

    # Running context (features for ML)
    entry_speed_kmh = Column(Float)
    avg_speed_kmh = Column(Float)
    hour_of_entry = Column(Integer)     # 0-23
    day_of_week = Column(Integer)       # 0=Mon, 6=Sun
    had_speed_restriction = Column(Boolean, default=False)
    had_unscheduled_stop = Column(Boolean, default=False)
    preceding_train_delay_min = Column(Float, default=0.0)
    weather_condition = Column(String(20), default="CLEAR")  # CLEAR, RAIN, FOG, STORM

    data_source = Column(Enum(DataSource), default=DataSource.SIMULATED)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    run = relationship("TrainRun", back_populates="historical_journeys")
    section = relationship("RouteSection", back_populates="historical_journeys")


# ──────────────────────────────────────────────────────────────────────────────
# Operational events
# ──────────────────────────────────────────────────────────────────────────────

class OperationalEvent(Base):
    """
    An event that affects a train's running.

    Injected manually in demo mode, or detected from telemetry in production.
    """
    __tablename__ = "operational_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("train_runs.id"), nullable=False, index=True)
    event_type = Column(Enum(EventType), nullable=False)
    section_id = Column(Integer, ForeignKey("route_sections.id"), nullable=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=True)

    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime)           # Null if still active
    duration_min = Column(Float)          # Expected duration

    speed_restriction_kmh = Column(Float)  # New max speed if SPEED_RESTRICTION
    severity = Column(String(20), default="MODERATE")  # LOW, MODERATE, HIGH, CRITICAL
    description = Column(Text)

    injected_by = Column(String(50), default="DEMO_MODE")  # or "AUTO_DETECTED"
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    run = relationship("TrainRun", back_populates="operational_events")
    section = relationship("RouteSection", foreign_keys=[section_id])
    station = relationship("Station", foreign_keys=[station_id])


# ──────────────────────────────────────────────────────────────────────────────
# Prediction output
# ──────────────────────────────────────────────────────────────────────────────

class ETAPrediction(Base):
    """
    Our independently computed ETA for an upcoming station.

    This is the core output of the prediction engine.
    It is deliberately separate from any externally provided ETA.
    """
    __tablename__ = "eta_predictions"

    id = Column(BigIntPK, primary_key=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("train_runs.id"), nullable=False, index=True)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=False, index=True)

    # When this prediction was computed
    predicted_at = Column(DateTime, nullable=False, index=True)

    # ── Scheduled baseline ───────────────────────────────────────────────────
    scheduled_eta = Column(DateTime)

    # ── Our prediction ───────────────────────────────────────────────────────
    predicted_eta = Column(DateTime, nullable=False)
    predicted_delay_min = Column(Float, nullable=False)

    # Prediction interval (from historical error distribution)
    lower_bound_eta = Column(DateTime)
    upper_bound_eta = Column(DateTime)

    # Confidence score [0.0–1.0]
    # Derived from inverse of historical RMSE for this section/delay combination
    confidence_score = Column(Float)

    # ── Baselines for comparison ─────────────────────────────────────────────
    baseline1_eta = Column(DateTime)   # Scheduled ETA (no adjustment)
    baseline2_eta = Column(DateTime)   # Current delay simply propagated forward
    baseline3_eta = Column(DateTime)   # Historical section-time baseline

    # ── Explainability ───────────────────────────────────────────────────────
    # SHAP-derived factor contributions in minutes
    # { "speed_restriction": 4.2, "section_slower_than_hist": 2.1, ... }
    prediction_factors = Column(JSON)

    # Human-readable explanation string
    explanation = Column(Text)

    # Model version used
    model_version = Column(String(50), default="xgb_v1")

    # Which telemetry record triggered this prediction
    triggered_by_telemetry_id = Column(BigIntPK, ForeignKey("train_telemetry.id"), nullable=True)

    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    run = relationship("TrainRun", back_populates="eta_predictions")
    station = relationship("Station", foreign_keys=[station_id])


# ──────────────────────────────────────────────────────────────────────────────
# Re-export Seat Finder Models & Pantry Models
# ──────────────────────────────────────────────────────────────────────────────
from app.models_seats import (
    Coach, Seat, SeatOccupancy, SeatWatch, SeatAvailabilityEvent,
    CoachClass, BerthType, OccupancyStatus, SeatEventType,
)
from app.models_pantry import (
    PantryVendor, PantryMenuItem, PantryOrder,
    PantryCategory, PantryDiet, PantryItemAvailability, PantryPriceSource,
)


