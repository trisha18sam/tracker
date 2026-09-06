# API Documentation

## Base URL
- **Local:** `http://localhost:8000`
- **API Prefix:** `/api/v1`
- **Interactive Docs:** `http://localhost:8000/api/docs` (Swagger UI)
- **ReDoc:** `http://localhost:8000/api/redoc`

---

## Authentication
Currently no authentication required for local development.

---

## Common Response Formats

### Success Response
```json
{
  "data": { ... }
}
```

### Error Response
```json
{
  "detail": "Error message"
}
```

### Paginated Response
```json
{
  "items": [...],
  "total": 100,
  "page": 1,
  "page_size": 20
}
```

---

## Trains

### List All Trains
```
GET /api/v1/trains
```

**Response:** `TrainListResponse[]`

### Get Train Detail
```
GET /api/v1/trains/{train_id}
```

**Response:** `TrainDetailResponse`

### Get Live Train Status
```
GET /api/v1/trains/{train_id}/live
```

**Response:** `TrainLiveResponse`
```json
{
  "run": { "id": 650, "train_id": 1, "status": "RUNNING", "current_delay_min": 5.0, ... },
  "train": { "id": 1, "number": "12957", "name": "Ahmedabad Rajdhani Express", ... },
  "latest_telemetry": { "id": 12, "speed_kmh": 120.6, "cumulative_delay_min": 5.0, ... },
  "active_events": [{ "event_type": "WEATHER", "description": "Dense Fog...", ... }]
}
```

### Get ETA Predictions
```
GET /api/v1/trains/{train_id}/predictions
```

**Response:** `PredictionListResponse`
```json
{
  "run_id": 650,
  "train_number": "12957",
  "data_source": "SIMULATED",
  "predictions": [
    {
      "id": 67,
      "station": { "id": 2, "code": "MTJ", "name": "Mathura Junction", ... },
      "scheduled_eta": "2026-09-05T20:45:00",
      "predicted_eta": "2026-09-05T20:34:27",
      "predicted_delay_min": -10.5,
      "lower_bound_eta": "2026-09-05T20:28:03",
      "upper_bound_eta": "2026-09-05T20:40:51",
      "confidence_score": 0.99,
      "baseline1_eta": "2026-09-05T20:45:00",
      "baseline2_eta": "2026-09-05T20:50:00",
      "baseline3_eta": "2026-09-06T12:12:52",
      "prediction_factors": [
        { "factor": "section_travel_time", "delta_min": -22.8, "description": "..." },
        { "factor": "accumulated_delay", "delta_min": -10.5, "description": "..." }
      ],
      "explanation": "-22.8 min — Section running 22.8 min faster...\n-10.5 min — Train currently running ahead...",
      "model_version": "xgb_v1"
    }
  ],
  "last_updated": "2026-09-05T19:15:00"
}
```

---

## Stations & Routes

### List All Stations
```
GET /api/v1/stations
```

**Response:** `StationResponse[]`

### Get Route with Sections
```
GET /api/v1/routes/{route_id}
```

**Response:** `RouteDetailResponse`

---

## Telemetry

### Ingest Telemetry
```
POST /api/v1/telemetry
```

**Request:** `TelemetryCreate`
```json
{
  "run_id": 651,
  "timestamp": "2026-09-05T19:15:00",
  "latitude": 28.6431,
  "longitude": 77.2201,
  "speed_kmh": 80.0,
  "distance_covered_km": 0.0,
  "cumulative_delay_min": 15.0,
  "current_section_id": 1,
  "data_source": "SIMULATED"
}
```

**Response:** `TelemetryResponse` (created telemetry with predictions triggered)

---

## Simulation Control

### Start New Simulation Run
```
POST /api/v1/simulation/start
```

**Request:** `SimulationStartRequest`
```json
{
  "train_id": 2,
  "delay_minutes": 15
}
```

**Response:** `SimulationStartResponse`
```json
{
  "run_id": 651,
  "train_id": 2,
  "message": "Run created. Send telemetry to /telemetry with run_id=651"
}
```

### Inject Operational Event
```
POST /api/v1/simulation/events
```

**Request:** `EventCreate`
```json
{
  "run_id": 651,
  "event_type": "SPEED_RESTRICTION",
  "section_id": 3,
  "start_time": "2026-09-05T10:00:00",
  "duration_min": 30.0,
  "speed_restriction_kmh": 60.0,
  "severity": "HIGH",
  "description": "Track maintenance"
}
```

**Response:** `EventResponse`

### Clear Event
```
DELETE /api/v1/simulation/events/{event_id}
```

---

## Analytics

### Model Performance
```
GET /api/v1/analytics/model-performance
```

**Response:** `ModelPerformanceResponse`
```json
{
  "model_name": "XGBoost Residual Predictor",
  "model_version": "xgb_v1",
  "training_journeys": 519,
  "test_journeys": 129,
  "train_cutoff_date": "2025-10-18",
  "baselines": [
    { "name": "Baseline 1 — Scheduled ETA", "mae_min": 9.48, "rmse_min": 13.77, "mean_delay_error_min": 42.81 },
    { "name": "Baseline 2 — Delay Propagation", "mae_min": 40.36, "rmse_min": 53.36, "mean_delay_error_min": 40.36 },
    { "name": "Baseline 3 — Historical Adjusted", "mae_min": 8.53, "rmse_min": 12.18, "mean_delay_error_min": 8.53 }
  ],
  "model_metrics": { "mae_min": 8.53, "rmse_min": 12.18, "mean_delay_error_min": 8.53 }
}
```

### Active Runs (Dashboard)
```
GET /api/v1/analytics/active-runs
```

**Response:** `ActiveRunsResponse[]`

### Network Impact
```
GET /api/v1/analytics/network-impact/{run_id}
```

---

## WebSocket Endpoints

### Dashboard Updates
```
WS /ws/dashboard
```

**Messages:** Real-time delay updates for all active runs

### Predictions Updates
```
WS /ws/predictions/{run_id}
```

**Messages:** Real-time prediction updates for specific run

---

## Data Models

### Train
```typescript
interface Train {
  id: number;
  number: string;
  name: string;
  train_type: "PASSENGER" | "EXPRESS" | "SUPERFAST" | "RAJDHANI" | "SHATABDI" | "DURONTO" | "VANDE_BHARAT";
  rake_type: "ICF" | "LHB";
  max_speed_kmh: number;
  route_id: number;
}
```

### Station
```typescript
interface Station {
  id: number;
  code: string;
  name: string;
  city: string;
  state: string;
  zone: string;
  latitude: number;
  longitude: number;
  is_junction: boolean;
}
```

### ETA Prediction
```typescript
interface ETAPrediction {
  id: number;
  run_id: number;
  station: Station;
  predicted_at: string;
  scheduled_eta: string;
  predicted_eta: string;
  predicted_delay_min: number;
  lower_bound_eta: string;
  upper_bound_eta: string;
  confidence_score: number;
  baseline1_eta: string;
  baseline2_eta: string;
  baseline3_eta: string;
  prediction_factors: PredictionFactor[];
  explanation: string;
  model_version: string;
}

interface PredictionFactor {
  factor: string;
  delta_min: number;
  description: string;
}
```

### Telemetry
```typescript
interface Telemetry {
  id: number;
  run_id: number;
  timestamp: string;
  latitude: number;
  longitude: number;
  speed_kmh: number;
  distance_covered_km: number;
  cumulative_delay_min: number;
  current_section_id: number;
  current_station_id: number | null;
  data_source: "SIMULATED" | "LIVE";
}
```

### Operational Event
```typescript
interface OperationalEvent {
  id: number;
  run_id: number;
  event_type: "SPEED_RESTRICTION" | "UNSCHEDULED_STOPPAGE" | "INCREASED_DWELL" | "SIGNAL_FAILURE" | "MAINTENANCE_BLOCK" | "CONGESTION" | "WEATHER";
  section_id: number | null;
  station_id: number | null;
  start_time: string;
  end_time: string | null;
  duration_min: number | null;
  speed_restriction_kmh: number | null;
  severity: "LOW" | "MEDIUM" | "HIGH";
  description: string;
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input |
| 404 | Not Found - Resource doesn't exist |
| 422 | Validation Error - Pydantic validation failed |
| 500 | Internal Server Error |
| 503 | Service Unavailable - Model not loaded |

---

## Rate Limits
No rate limiting in development. Production should implement appropriate limits.