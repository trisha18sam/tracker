"""
Pydantic v2 schemas for API request/response validation.
"""
from __future__ import annotations

from datetime import datetime, date
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field


# ─── Shared ──────────────────────────────────────────────────────────────────

class OrmBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ─── Station ─────────────────────────────────────────────────────────────────

class StationOut(OrmBase):
    id: int
    code: str
    name: str
    city: Optional[str]
    state: Optional[str]
    zone: Optional[str]
    latitude: float
    longitude: float
    is_junction: bool


# ─── Route ───────────────────────────────────────────────────────────────────

class RouteSectionOut(OrmBase):
    id: int
    sequence_number: int
    from_station: StationOut
    to_station: StationOut
    distance_km: float
    scheduled_travel_time_min: float
    hist_avg_travel_time_min: Optional[float]
    hist_std_dev_min: Optional[float]
    max_speed_kmh: float


class RouteOut(OrmBase):
    id: int
    name: str
    total_distance_km: Optional[float]
    origin_station: StationOut
    destination_station: StationOut
    sections: List[RouteSectionOut] = []


# ─── Train ───────────────────────────────────────────────────────────────────

class TrainOut(OrmBase):
    id: int
    number: str
    name: str
    train_type: str
    rake_type: Optional[str]
    max_speed_kmh: float
    route_id: int


class ScheduledStopOut(OrmBase):
    id: int
    stop_number: int
    station: StationOut
    arrival_time_str: Optional[str]
    departure_time_str: Optional[str]
    scheduled_dwell_min: float
    day_offset: int


class TrainDetailOut(OrmBase):
    id: int
    number: str
    name: str
    train_type: str
    rake_type: Optional[str]
    max_speed_kmh: float
    route: RouteOut
    scheduled_stops: List[ScheduledStopOut] = []


# ─── TrainRun ────────────────────────────────────────────────────────────────

class TrainRunOut(OrmBase):
    id: int
    train_id: int
    run_date: date
    status: str
    data_source: str
    current_delay_min: float
    journey_start_time: Optional[datetime]
    updated_at: Optional[datetime]


class TrainLiveOut(OrmBase):
    run: TrainRunOut
    train: TrainOut
    latest_telemetry: Optional["TelemetryOut"]
    active_events: List["OperationalEventOut"] = []


# ─── Telemetry ───────────────────────────────────────────────────────────────

class TelemetryIn(BaseModel):
    run_id: int
    timestamp: datetime
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    speed_kmh: float = 0.0
    distance_covered_km: Optional[float] = None
    cumulative_delay_min: float = 0.0
    current_section_id: Optional[int] = None
    current_station_id: Optional[int] = None
    data_source: str = "SIMULATED"
    raw_payload: Optional[Dict[str, Any]] = None


class TelemetryOut(OrmBase):
    id: int
    run_id: int
    timestamp: datetime
    latitude: Optional[float]
    longitude: Optional[float]
    speed_kmh: float
    distance_covered_km: Optional[float]
    cumulative_delay_min: float
    current_section_id: Optional[int]
    current_station_id: Optional[int]
    data_source: str


# ─── Operational Events ──────────────────────────────────────────────────────

class EventIn(BaseModel):
    run_id: int
    event_type: str
    section_id: Optional[int] = None
    station_id: Optional[int] = None
    duration_min: Optional[float] = None
    speed_restriction_kmh: Optional[float] = None
    severity: Union[str, int] = "MODERATE"
    description: Optional[str] = None


class OperationalEventOut(OrmBase):
    id: int
    run_id: int
    event_type: str
    section_id: Optional[int]
    station_id: Optional[int]
    start_time: datetime
    end_time: Optional[datetime]
    duration_min: Optional[float]
    speed_restriction_kmh: Optional[float]
    severity: str
    description: Optional[str]


# ─── ETA Predictions ─────────────────────────────────────────────────────────

class PredictionFactor(BaseModel):
    factor: str
    delta_min: float
    description: str


class ETAPredictionOut(OrmBase):
    id: int
    run_id: int
    station_id: int
    station: StationOut
    predicted_at: datetime

    scheduled_eta: Optional[datetime]
    predicted_eta: datetime
    predicted_delay_min: float

    lower_bound_eta: Optional[datetime]
    upper_bound_eta: Optional[datetime]
    confidence_score: Optional[float]

    baseline1_eta: Optional[datetime]
    baseline2_eta: Optional[datetime]
    baseline3_eta: Optional[datetime]

    prediction_factors: Optional[List[Dict[str, Any]]]
    explanation: Optional[str]
    model_version: str


class TrainPredictionsOut(BaseModel):
    run_id: int
    train_number: str
    train_name: str
    data_source: str    # Always "SIMULATED" in prototype
    predictions: List[ETAPredictionOut]
    last_updated: Optional[datetime]


# ─── Analytics ───────────────────────────────────────────────────────────────

class BaselineComparison(BaseModel):
    name: str
    mae_min: float
    rmse_min: float
    mean_delay_error_min: float


class ModelPerformanceOut(BaseModel):
    model_name: str
    model_version: str
    training_journeys: int
    test_journeys: int
    train_cutoff_date: str
    baselines: List[BaselineComparison]
    our_model: BaselineComparison
    feature_importance: Optional[Dict[str, float]] = None
    generated_at: str


class NetworkImpactOut(BaseModel):
    primary_run_id: int
    primary_train_number: str
    primary_delay_min: float
    affected_trains: List[Dict[str, Any]]


class SectionBottleneckOut(BaseModel):
    section_id: int
    from_station_code: str
    from_station_name: str
    to_station_code: str
    to_station_name: str
    distance_km: float
    max_speed_kmh: float
    scheduled_travel_time_min: float
    hist_avg_travel_time_min: float
    hist_std_dev_min: float
    hist_p10_min: float
    hist_p90_min: float
    avg_speed_kmh: float
    delay_risk_score: float   # 0-100 score
    sample_count: int


class PredictionVsRealityOut(BaseModel):
    station_code: str
    station_name: str
    scheduled_time: str
    predicted_time: str
    actual_time: str
    predicted_delay_min: float
    actual_delay_min: float
    error_min: float
    accuracy_pct: float
    confidence_level: str
    status: str


# ─── Simulation control ──────────────────────────────────────────────────────

class SimStartIn(BaseModel):
    train_id: int
    run_date: Optional[date] = None
    origin_delay_min: float = 0.0
    speed_factor: int = 60


class SimStartOut(BaseModel):
    run_id: int
    train_id: int
    message: str


# ─── WebSocket messages ──────────────────────────────────────────────────────

class WsPredictionUpdate(BaseModel):
    type: str = "PREDICTION_UPDATE"
    run_id: int
    train_number: str
    train_name: str
    current_delay_min: float
    data_source: str
    predictions: List[ETAPredictionOut]
    active_events: List[OperationalEventOut]
    timestamp: datetime


class WsDashboardUpdate(BaseModel):
    type: str = "DASHBOARD_UPDATE"
    active_runs: List[Dict[str, Any]]
    timestamp: datetime


# ─── Last-Minute Seat Finder Schemas ─────────────────────────────────────────

class SeatClassSummaryOut(BaseModel):
    coach_class: str
    confirmed_available: int
    predicted_available: int
    cancellation_available: int
    total_berths: int
    berth_breakdown: Dict[str, int]
    deboarding_stations: Dict[str, int] = {}


class RecentCancellationOut(BaseModel):
    details: str
    minutes_ago: int


class SeatSearchResultOut(BaseModel):
    train_id: int
    train_number: str
    train_name: str
    train_type: str
    run_id: int
    data_source: str = "SIMULATED"
    from_station: Dict[str, Any]
    to_station: Dict[str, Any]
    scheduled_departure_time: str
    scheduled_arrival_time: str
    predicted_boarding_time: str
    predicted_arrival_time: str
    current_delay_min: float
    distance_to_boarding_km: float
    current_train_location: str
    confirmed_available_seats: int
    predicted_deboard_seats: int
    cancellation_seats: int
    total_potential_seats: int
    confidence_level: str
    confidence_score: float
    confidence_reason: str
    classes: List[SeatClassSummaryOut]
    is_last_minute: bool = True
    recent_cancellations: List[RecentCancellationOut] = []


class SeatGridItemOut(BaseModel):
    seat_id: int
    seat_number: int
    coach_code: str
    coach_class: str
    berth_type: str
    bay_number: int
    is_window: bool
    is_emergency_quota: bool
    segment_status: str  # AVAILABLE, PREDICTED_AVAILABLE, OCCUPIED, BLOCKED_QUOTA
    status_label: str
    confidence: float
    deboard_explanation: Optional[str] = None
    masked_pnr: Optional[str] = None
    segment_history: List[str] = []


class CoachMapOut(BaseModel):
    coach_id: int
    coach_code: str
    coach_class: str
    total_seats: int
    layout_type: str
    summary: Dict[str, int]
    seats: List[SeatGridItemOut]


class CoachBriefOut(BaseModel):
    id: int
    coach_code: str
    coach_class: str
    total_seats: int
    layout_type: str


class SeatWatchIn(BaseModel):
    session_token: str
    train_id: int
    from_station_id: int
    to_station_id: int
    travel_date: Optional[date] = None
    preferred_class: Optional[str] = None
    preferred_berth: Optional[str] = None


class SeatWatchOut(BaseModel):
    id: int
    session_token: str
    train_id: int
    from_station_id: int
    to_station_id: int
    travel_date: date
    preferred_class: Optional[str]
    preferred_berth: Optional[str]
    is_active: bool
    created_at: datetime


class SeatSimulateEventIn(BaseModel):
    train_run_id: int
    coach_code: str = "B2"
    seat_number: int = 18
    event_type: str = "CANCELLATION"


class SeatOperationsAnalyticsOut(BaseModel):
    total_monitored_berths: int
    total_confirmed_vacant: int
    total_predicted_vacancies: int
    recent_cancellations_count: int
    average_segment_turnover_rate: float
    vacancies_by_class: Dict[str, int]
    high_turnover_stations: List[Dict[str, Any]]
    recent_event_stream: List[Dict[str, Any]]

