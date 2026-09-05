/* API types matching backend schemas */

export interface Station {
  id: number;
  code: string;
  name: string;
  city?: string;
  state?: string;
  zone?: string;
  latitude: number;
  longitude: number;
  is_junction: boolean;
}

export interface RouteSection {
  id: number;
  sequence_number: number;
  from_station: Station;
  to_station: Station;
  distance_km: number;
  scheduled_travel_time_min: number;
  hist_avg_travel_time_min?: number;
  hist_std_dev_min?: number;
  max_speed_kmh: number;
}

export interface Route {
  id: number;
  name: string;
  total_distance_km?: number;
  origin_station: Station;
  destination_station: Station;
  sections: RouteSection[];
}

export interface Train {
  id: number;
  number: string;
  name: string;
  train_type: string;
  rake_type?: string;
  max_speed_kmh: number;
  route_id: number;
}

export interface ScheduledStop {
  id: number;
  stop_number: number;
  station: Station;
  arrival_time_str?: string;
  departure_time_str?: string;
  scheduled_dwell_min: number;
  day_offset: number;
}

export interface TrainDetail extends Train {
  route: Route;
  scheduled_stops: ScheduledStop[];
}

export interface TrainRun {
  id: number;
  train_id: number;
  run_date: string;
  status: string;
  data_source: string;
  current_delay_min: number;
  journey_start_time?: string;
  updated_at?: string;
}

export interface Telemetry {
  id: number;
  run_id: number;
  timestamp: string;
  latitude?: number;
  longitude?: number;
  speed_kmh: number;
  distance_covered_km?: number;
  cumulative_delay_min: number;
  current_section_id?: number;
  current_station_id?: number;
  data_source: string;
}

export interface OperationalEvent {
  id: number;
  run_id: number;
  event_type: string;
  section_id?: number;
  station_id?: number;
  start_time: string;
  end_time?: string;
  duration_min?: number;
  speed_restriction_kmh?: number;
  severity: string;
  description?: string;
}

export interface PredictionFactor {
  factor: string;
  delta_min: number;
  description: string;
}

export interface ETAPrediction {
  id: number;
  run_id: number;
  station_id: number;
  station: Station;
  predicted_at: string;
  scheduled_eta?: string;
  predicted_eta: string;
  predicted_delay_min: number;
  lower_bound_eta?: string;
  upper_bound_eta?: string;
  confidence_score?: number;
  baseline1_eta?: string;
  baseline2_eta?: string;
  baseline3_eta?: string;
  prediction_factors?: PredictionFactor[];
  explanation?: string;
  model_version: string;
}

export interface TrainPredictions {
  run_id: number;
  train_number: string;
  train_name: string;
  data_source: string;
  predictions: ETAPrediction[];
  last_updated?: string;
}

export interface TrainLive {
  run: TrainRun;
  train: Train;
  latest_telemetry?: Telemetry;
  active_events: OperationalEvent[];
}

export interface ActiveRunSummary {
  run_id: number;
  train_id: number;
  train_number: string;
  train_name: string;
  train_type: string;
  run_date: string;
  status: string;
  data_source: string;
  current_delay_min: number;
  latest_speed_kmh?: number;
  latest_lat?: number;
  latest_lon?: number;
  last_update?: string;
  active_events: { event_type: string; severity: string; description: string }[];
  at_risk: boolean;
}

export interface BaselineComparison {
  name: string;
  mae_min: number;
  rmse_min: number;
  mean_delay_error_min: number;
}

export interface ModelPerformance {
  model_name: string;
  model_version: string;
  training_journeys: number;
  test_journeys: number;
  train_cutoff_date: string;
  data_source: string;
  evaluation_note: string;
  baselines: BaselineComparison[];
  our_model: BaselineComparison;
  improvement_vs_baseline1_pct: number;
  improvement_vs_baseline2_pct: number;
  improvement_vs_baseline3_pct: number;
  feature_importance?: Record<string, number>;
  generated_at: string;
}

export interface SectionBottleneck {
  section_id: number;
  from_station_code: string;
  from_station_name: string;
  to_station_code: string;
  to_station_name: string;
  distance_km: number;
  max_speed_kmh: number;
  scheduled_travel_time_min: number;
  hist_avg_travel_time_min: number;
  hist_std_dev_min: number;
  hist_p10_min: number;
  hist_p90_min: number;
  avg_speed_kmh: number;
  delay_risk_score: number;
  sample_count: number;
}

export interface PredictionVsReality {
  station_code: string;
  station_name: string;
  scheduled_time: string;
  predicted_time: string;
  actual_time: string;
  predicted_delay_min: number;
  actual_delay_min: number;
  error_min: number;
  accuracy_pct: number;
  confidence_level: string;
  status: string;
}

export interface NetworkImpact {
  primary_run_id: number;
  primary_train_number: string;
  primary_delay_min: number;
  affected_trains: {
    run_id: number;
    train_number: string;
    train_name: string;
    shared_sections: number;
    estimated_additional_delay_min: number;
    current_delay_min: number;
  }[];
}

/* WebSocket message shapes */
export interface WsPredictionUpdate {
  type: 'PREDICTION_UPDATE';
  run_id: number;
  train_number: string;
  train_name: string;
  current_delay_min: number;
  data_source: string;
  predictions: ETAPrediction[];
  active_events: OperationalEvent[];
  timestamp: string;
}

export interface WsDashboardUpdate {
  type: 'DELAY_UPDATE';
  run_id: number;
  train_number: string;
  current_delay_min: number;
  timestamp: string;
}

/* ─── Last-Minute Seat Finder Types ───────────────────────────────────────── */

export interface SeatClassSummary {
  coach_class: string;
  confirmed_available: number;
  predicted_available: number;
  cancellation_available: number;
  total_berths: number;
  berth_breakdown: Record<string, number>;
  deboarding_stations?: Record<string, number>;
}

export interface RecentCancellation {
  details: string;
  minutes_ago: number;
}

export interface SeatSearchResult {
  train_id: number;
  train_number: string;
  train_name: string;
  train_type: string;
  run_id: number;
  data_source: string;
  from_station: {
    id: number;
    code: string;
    name: string;
    stop_number: number;
    arrival_time?: string;
    departure_time?: string;
  };
  to_station: {
    id: number;
    code: string;
    name: string;
    stop_number: number;
    arrival_time?: string;
    departure_time?: string;
  };
  scheduled_departure_time: string;
  scheduled_arrival_time: string;
  predicted_boarding_time: string;
  predicted_arrival_time: string;
  current_delay_min: number;
  distance_to_boarding_km: number;
  current_train_location: string;
  confirmed_available_seats: number;
  predicted_deboard_seats: number;
  cancellation_seats: number;
  total_potential_seats: number;
  confidence_level: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence_score: number;
  confidence_reason: string;
  classes: SeatClassSummary[];
  is_last_minute: boolean;
  recent_cancellations: RecentCancellation[];
}

export interface SeatGridItem {
  seat_id: number;
  seat_number: number;
  coach_code: string;
  coach_class: string;
  berth_type: string;
  bay_number: number;
  is_window: boolean;
  is_emergency_quota: boolean;
  segment_status: 'AVAILABLE' | 'PREDICTED_AVAILABLE' | 'OCCUPIED' | 'BLOCKED_QUOTA';
  status_label: string;
  confidence: number;
  deboard_explanation?: string;
  masked_pnr?: string;
  segment_history: string[];
}

export interface CoachMap {
  coach_id: number;
  coach_code: string;
  coach_class: string;
  total_seats: number;
  layout_type: string;
  summary: {
    total: number;
    available: number;
    predicted_available: number;
    occupied: number;
    blocked: number;
  };
  seats: SeatGridItem[];
}

export interface CoachBrief {
  id: number;
  coach_code: string;
  coach_class: string;
  total_seats: number;
  layout_type: string;
}

export interface SeatWatch {
  id: number;
  session_token: string;
  train_id: number;
  from_station_id: number;
  to_station_id: number;
  travel_date: string;
  preferred_class?: string;
  preferred_berth?: string;
  is_active: boolean;
  created_at: string;
}

export interface SeatOperationsAnalytics {
  total_monitored_berths: number;
  total_confirmed_vacant: number;
  total_predicted_vacancies: number;
  recent_cancellations_count: number;
  average_segment_turnover_rate: number;
  vacancies_by_class: Record<string, number>;
  high_turnover_stations: {
    station_id: number;
    station_code: string;
    station_name: string;
    deboarding_count: number;
  }[];
  recent_event_stream: {
    id: number;
    train_number: string;
    coach: string;
    seat: number;
    event_type: string;
    station: string;
    timestamp: string;
    message: string;
  }[];
}

