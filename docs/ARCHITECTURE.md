# Architecture Documentation

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SIH26028 - Dynamic ETA Forecast                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     Telemetry      ┌──────────────┐     Predictions      │
│  │  Simulation  │ ─────────────────▶ │   Backend    │ ─────────────────▶   │
│  │   Engine     │   (HTTP POST)      │  (FastAPI)   │   (WebSocket)        │
│  │  (Python)    │                    │              │                      │
│  └──────────────┘                    └──────┬───────┘                      │
│                                             │                              │
│                    ┌────────────────────────┼────────────────────────┐      │
│                    ▼                        ▼                        ▼      │
│           ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│           │  Train State    │    │  Baseline Algo  │    │  XGBoost ML     │ │
│           │  Engine         │    │  (3 baselines)  │    │  Engine         │ │
│           └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│                    │                        │                        │       │
│                    └────────────────────────┼────────────────────────┘       │
│                                             ▼                              │
│                                  ┌─────────────────┐                        │
│                                  │  Database       │                        │
│                                  │  (SQLite/Postgres)                     │
│                                  └─────────────────┘                        │
│                                             │                              │
│                    ┌────────────────────────┼────────────────────────┐      │
│                    ▼                        ▼                        ▼      │
│           ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│           │  Passenger App  │    │  Dashboard      │    │  Analytics API  │ │
│           │  (React)        │    │  (React)        │    │  (REST)         │ │
│           └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Simulation Engine (`simulation/engine.py`)

**Purpose:** Generates realistic train telemetry for testing

**Flow:**
1. `POST /api/v1/simulation/start` → Creates `TrainRun` in DB
2. Calculates physics-based movement through sections
3. Posts `TrainTelemetry` every `SIM_TELEMETRY_INTERVAL_SEC` (default 2s)
4. Handles operational events (speed restrictions, stoppages, weather)
5. `SIM_SPEED_FACTOR=60` → 1 real second = 1 simulated minute

**Key Classes:**
- `SimulationEngine` — Main orchestrator
- `SectionPhysics` — Speed/distance/time calculations
- `EventManager` — Active event polling

---

### 2. Backend - FastAPI (`backend/app/`)

#### Entry Point: `main.py`
- FastAPI app creation
- CORS middleware
- Router registration
- Startup/shutdown events (model loading)

#### Database Layer: `database.py`
```python
# Async engine for request handling
async_engine = create_async_engine(DATABASE_URL)

# Sync engine for seeding/scripts
sync_engine = create_engine(DATABASE_SYNC_URL)

# Session factories
async_session = async_sessionmaker(async_engine, class_=AsyncSession)
sync_session = sessionmaker(sync_engine, class_=Session)
```

#### Models: `models.py` (10 SQLAlchemy Models)

| Model | Key Fields |
|-------|------------|
| `Station` | code, name, lat/lon, zone, is_junction |
| `Route` | name, total_distance_km, origin/destination |
| `RouteSection` | sequence_number, from/to station, distance, max_speed, hist_avg_time, hist_std_dev |
| `Train` | number, name, train_type, rake_type, max_speed, route_id |
| `ScheduledStop` | train_id, station_id, sequence, scheduled_arrival/departure, dwell_min |
| `TrainRun` | train_id, run_date, status, current_delay, data_source |
| `TrainTelemetry` | run_id, timestamp, lat/lon, speed, distance, delay, section_id |
| `HistoricalJourney` | run_id, section_id, actual_travel_time, actual_dwell, avg_speed, entry_delay |
| `OperationalEvent` | run_id, event_type, section/station, timing, severity, speed_restriction |
| `ETAPrediction` | run_id, station_id, predicted_at, scheduled/predicted ETA, delay, confidence, baselines, factors |

#### Schemas: `schemas.py` (Pydantic v2)
- Request/Response models for all endpoints
- Nested relationships (Train + Route + Sections)
- WebSocket message types

#### WebSocket Manager: `websocket_manager.py`
```python
class WebSocketManager:
    def __init__(self):
        self.dashboard_connections: Set[WebSocket] = set()
        self.prediction_connections: Dict[int, Set[WebSocket]] = defaultdict(set)

    async def broadcast_dashboard(self, message: dict): ...
    async def broadcast_predictions(self, run_id: int, message: dict): ...
```

#### Prediction Pipeline: `prediction/`

**`baseline.py` — 3 Baselines:**
```python
class Baseline1Scheduled:      # Returns timetable ETA
class Baseline2DelayPropagation:  # Current delay + scheduled
class Baseline3HistoricalAdjusted:  # Historical section times × speed ratio
```

**`engine.py` — ML Engine:**
```python
class ETAEngine:
    def __init__(self):
        self.model = joblib.load(MODEL_PATH)
        self.scaler = joblib.load(SCALER_PATH)
        self.feature_list = json.load(FEATURE_LIST_PATH)

    def predict(self, features: pd.DataFrame) -> np.ndarray: ...

    def explain(self, features: pd.DataFrame) -> List[PredictionFactor]: ...
```

**`service.py` — Orchestration:**
```python
async def process_telemetry_and_predict(telemetry: TrainTelemetry, db: AsyncSession):
    # 1. Update train run state
    # 2. Build features for each upcoming station
    # 3. Run 3 baselines + ML model
    # 4. Save predictions to DB
    # 5. Broadcast via WebSocket
```

---

### 3. ML Pipeline (`ml/training/`)

#### Training: `train_model.py`
```python
# 1. Load historical journeys from DB (chronological)
# 2. Feature engineering (23 features)
# 3. Chronological split: 80% train / 20% test (by date, no leakage)
# 4. XGBoost training with early stopping
# 5. Save artifacts: model, scaler, feature_list, evaluation_results
```

#### Features (23):
| Category | Features |
|----------|----------|
| **Current State** | current_delay_min, current_speed_kmh, speed_ratio, entry_delay_min |
| **Section History** | section_hist_avg_travel_time_min, section_hist_std_dev_min |
| **Journey Progress** | sections_remaining, distance_remaining_km |
| **Trends** | recent_speed_trend, delay_trend, cumulative_dwell_excess_min |
| **Temporal** | hour_sin, hour_cos, dow_sin, dow_cos |
| **Train** | train_type_encoded |
| **Events** | active_speed_restriction, speed_restriction_ratio, unscheduled_stoppage_ahead, preceding_train_delay_min |
| **Weather** | weather_encoded |
| **Section** | section_distance_km, scheduled_travel_time_min |

#### Evaluation: `evaluate_model.py`
- Computes MAE, RMSE, Mean Absolute Delay Error
- Compares against 3 baselines on test set
- Saves `evaluation_results.json`

---

### 4. Frontend (`frontend/src/`)

#### Pages
| Page | Route | Purpose |
|------|-------|---------|
| `PassengerApp` | `/` | Train search, live status, ETA cards |
| `Dashboard` | `/dashboard` | Network view, active runs, analytics |
| `DemoMode` | `/demo` | SIH presentation mode |

#### Components
| Component | Purpose |
|-----------|---------|
| `ETACard` | Station prediction with confidence bars |
| `EventInjector` | Operational event injection panel |
| `RouteMap` | Leaflet map with train position |

#### API Client: `api.ts`
```typescript
// REST
export const api = {
  trains: { list, detail, live, predictions },
  stations: { list },
  routes: { detail },
  telemetry: { create },
  simulation: { start, events },
  analytics: { modelPerformance, activeRuns, networkImpact }
};

// WebSocket
export const ws = {
  connectDashboard: (onMessage) => WebSocket,
  connectPredictions: (runId, onMessage) => WebSocket,
};
```

---

## Data Flow

### Telemetry Ingestion → Prediction
```
1. POST /api/v1/telemetry
       │
       ▼
2. TelemetryRouter.create_telemetry()
       │
       ▼
3. prediction.service.process_telemetry_and_predict()
       │
       ├─▶ TrainStateEngine.update_state()
       ├─▶ FeatureBuilder.build_features()
       ├─▶ Baseline1/2/3.predict()
       ├─▶ ETAEngine.predict() + explain()
       ├─▶ Save ETAPrediction[] to DB
       └─▶ WebSocketManager.broadcast_predictions()
```

### WebSocket Broadcast
```
Backend                          Frontend
   │                                │
   ├─▶ WS /ws/dashboard ──────────▶ │ Dashboard updates
   │                                │
   ├─▶ WS /ws/predictions/{run_id}▶ │ PassengerApp updates
   │                                │
```

---

## Configuration

### Environment Variables (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite+aiosqlite:///tracker.db` | Async DB connection |
| `DATABASE_SYNC_URL` | `sqlite:///tracker.db` | Sync DB connection |
| `SECRET_KEY` | (random) | JWT secret |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | CORS allowed origins |
| `DEBUG` | `true` | Debug mode |
| `MODEL_PATH` | `../ml/artifacts/xgb_model.joblib` | Trained model |
| `SCALER_PATH` | `../ml/artifacts/scaler.joblib` | Feature scaler |
| `SIM_SPEED_FACTOR` | `60` | Sim minutes per real second |
| `SIM_TELEMETRY_INTERVAL_SEC` | `2` | Telemetry post interval |
| `BACKEND_API_URL` | `http://localhost:8000` | Backend URL for simulation |

---

## Deployment

### Docker Compose (`docker/docker-compose.yml`)
```yaml
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: sih
      POSTGRES_PASSWORD: sih_password
      POSTGRES_DB: eta_forecast

  backend:
    build: ../backend
    ports: ["8000:8000"]
    depends_on: [postgres]
    environment:
      DATABASE_URL: postgresql+asyncpg://sih:sih_password@postgres:5432/eta_forecast

  frontend:
    build: ../frontend
    ports: ["5173:5173"]
    depends_on: [backend]

  simulation:
    build: ../simulation
    depends_on: [backend]
    environment:
      BACKEND_API_URL: http://backend:8000
```

### Production Checklist
- [ ] Use PostgreSQL (not SQLite)
- [ ] Set strong `SECRET_KEY`
- [ ] Configure `CORS_ORIGINS` for production domain
- [ ] Set `DEBUG=false`
- [ ] Use nginx reverse proxy for frontend
- [ ] Enable HTTPS
- [ ] Set up model artifact versioning
- [ ] Configure log aggregation
- [ ] Set up health checks