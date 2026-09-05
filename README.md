# SIH26028 — Dynamic ETA Forecast for Coaching Trains

> **Smart India Hackathon 2026 Prototype**
> ⚠️ All data is **SIMULATION/DEMO DATA** — not real Indian Railways data.

---

## What This Is

A production-quality prototype that **independently predicts train arrival times** at upcoming stations using machine learning — rather than simply relaying an ETA from an external API.

The core innovation is the **ETA Prediction Engine**: a backend system that receives live (or simulated) telemetry and computes its own predicted arrival time for every upcoming station, with:
- Confidence intervals derived from historical prediction error
- Human-readable explanation of what changed and why
- Comparison against 3 baselines (scheduled, delay-propagation, historical average)
- Real model evaluation numbers (no fabricated metrics)

---

## Architecture

```
Simulation Engine (Python)
         │ POST /telemetry every 2 seconds
         ▼
FastAPI Backend
         │
         ├─ Train State Engine
         ├─ Baseline algorithms (3 baselines)
         ├─ XGBoost ETA Prediction Engine  ← Core innovation
         │    ├─ 23 features (speed, delay, history, time, events…)
         │    ├─ Predicts section travel time residuals
         │    └─ SHAP-style factor attribution
         │
         ├─ WebSocket broadcast → all clients
         └─ REST API
              │
              ├─ Passenger App (React)
              └─ Operations Dashboard (React)
```

---

## Quick Start (Local)

### Prerequisites
- Python 3.11+
- Node.js 20+
- PostgreSQL 15
- (Optional) Docker + Docker Compose

### 1. Database

```bash
# Start PostgreSQL (or use Docker)
docker run -d --name eta-db -e POSTGRES_USER=sih -e POSTGRES_PASSWORD=sih_password \
  -e POSTGRES_DB=eta_forecast -p 5432:5432 postgres:15-alpine
```

### 2. Copy and configure `.env`

```bash
cp .env.example .env
# Edit DATABASE_URL and DATABASE_SYNC_URL if needed
```

### 3. Backend + seed

```bash
cd backend
pip install -r requirements.txt

cd ../database
python seed.py          # Creates tables, seeds stations/trains/schedules + 2000 synthetic journeys
```

### 4. Train ML model

```bash
cd ml
pip install -r requirements.txt
python training/train_model.py        # Trains XGBoost, saves artifacts
python training/evaluate_model.py     # Computes real MAE/RMSE vs baselines
```

### 5. Start backend

```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 6. Start frontend

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

### 7. Start simulation engine

```bash
cd simulation
pip install -r requirements.txt
python engine.py --train-id 1 --delay 0      # On-time run
# or
python engine.py --train-id 1 --delay 15     # 15-minute late start
```

### 8. Docker (all services)

```bash
cd docker
docker-compose up --build
```

---

## Data Model

| Entity | Purpose |
|--------|---------|
| `Station` | A railway station (code, name, lat/lon, zone) |
| `Route` | A named route from origin to destination |
| `RouteSection` | Section between two consecutive stations with historical stats |
| `Train` | A named train with schedule and type |
| `ScheduledStop` | Official timetable entry for a train at a station |
| `TrainRun` | A single operating instance of a train on a date |
| `TrainTelemetry` | A single position/speed fix (SIMULATED or LIVE) |
| `HistoricalJourney` | Per-section performance from a completed run (ML training data) |
| `OperationalEvent` | Events affecting running (speed restriction, stoppage, etc.) |
| `ETAPrediction` | Our independently computed ETA for one upcoming station |

---

## Prediction Methodology

### Baseline 1 — Scheduled ETA
Return the published timetable time. Zero intelligence.

### Baseline 2 — Delay Propagation
Add the current observed delay to scheduled ETA. Assumes delay stays constant.

### Baseline 3 — Historical Section-Time Adjusted
For each remaining section:
```
predicted_time = hist_avg_travel_time / speed_ratio
speed_ratio = current_speed / hist_typical_speed  (clamped ±50%)
```
Sum across all remaining sections + dwell times.

### Our Model — XGBoost Residual Predictor

**Target**: `actual_section_travel_time - historical_average` (residual in minutes)

**Training**: 80% of historical journeys (by date, no leakage). Tested on newest 20%.

**Features** (23 total):

| Feature | Description |
|---------|-------------|
| `current_delay_min` | Delay at last known position |
| `current_speed_kmh` | Observed speed |
| `speed_ratio` | current speed / section max speed |
| `section_hist_avg_travel_time_min` | Historical average for this section |
| `section_hist_std_dev_min` | Historical variance |
| `sections_remaining` | Number of stations still to be reached |
| `distance_remaining_km` | Distance to terminus |
| `entry_delay_min` | Delay on entering this section |
| `recent_speed_trend` | Slope of last 3 speed readings |
| `hour_sin / hour_cos` | Cyclical hour encoding |
| `dow_sin / dow_cos` | Cyclical day-of-week encoding |
| `train_type_encoded` | Ordinal: PASSENGER=0 … RAJDHANI=6 |
| `active_speed_restriction` | Binary flag |
| `speed_restriction_ratio` | restricted_kmh / section_max_kmh |
| `unscheduled_stoppage_ahead` | Binary flag |
| `preceding_train_delay_min` | Upstream train delay |
| `cumulative_dwell_excess_min` | Extra dwell accumulated this journey |
| `weather_encoded` | CLEAR=0, RAIN=1, FOG=2, STORM=3 |
| `section_distance_km` | Length of this section |
| `scheduled_travel_time_min` | Timetable time for this section |
| `delay_trend` | Change in delay over last 3 fixes |

**Confidence Score** (prototype estimate):
```
confidence = exp(-section_RMSE / (1 + abs(predicted_delay))) - delay_penalty
```
Clipped to [0.30, 0.99]. Labelled "prototype estimate" in UI.

---

## Simulation Methodology

The simulation engine (`simulation/engine.py`) is a standalone async Python process:

1. Calls `POST /simulation/start` to create a `TrainRun`
2. Advances the train through sections at effective speed = `section_max_speed × [0.82–0.95]`
3. Posts `TrainTelemetry` to `POST /telemetry` every `SIM_TELEMETRY_INTERVAL_SEC` real seconds
4. `SIM_SPEED_FACTOR=60` means 1 real second = 1 simulated minute (configurable)
5. Polls active operational events and modifies speed/dwell accordingly

**Event effects on simulation:**
- `SPEED_RESTRICTION` — clamps effective speed in that section
- `UNSCHEDULED_STOPPAGE` — adds extra minutes before leaving section
- `INCREASED_DWELL` — adds minutes at station
- `SIGNAL_FAILURE` — clamps to 30 km/h
- `MAINTENANCE_BLOCK` — clamps to 30 km/h
- `CONGESTION` — reduces speed across multiple sections

---

## Evaluation Methodology

- Train/test split: **chronological by journey date** (not random) — no data leakage
- Training set: earliest 80% of simulated journeys
- Test set: newest 20% of simulated journeys
- Metrics: MAE, RMSE, Mean Absolute Delay Error
- Results saved to `ml/artifacts/evaluation_results.json`
- Served at `GET /api/v1/analytics/model-performance`

---

## API Documentation

Full interactive docs: **`http://localhost:8000/api/docs`**

| Method | Endpoint | Description |
|--------|---------|-------------|
| GET | `/api/v1/trains` | List all trains |
| GET | `/api/v1/trains/{id}` | Train detail + schedule |
| GET | `/api/v1/trains/{id}/live` | Latest telemetry + active events |
| GET | `/api/v1/trains/{id}/predictions` | Latest ETA predictions |
| GET | `/api/v1/stations` | All stations |
| GET | `/api/v1/routes/{id}` | Route with sections |
| POST | `/api/v1/telemetry` | Ingest telemetry fix |
| POST | `/api/v1/simulation/start` | Create new TrainRun |
| POST | `/api/v1/simulation/events` | Inject operational event |
| DELETE | `/api/v1/simulation/events/{id}` | Clear event |
| GET | `/api/v1/predictions/{run_id}` | Predictions by run ID |
| GET | `/api/v1/analytics/model-performance` | MAE/RMSE vs baselines |
| GET | `/api/v1/analytics/active-runs` | Dashboard summary |
| GET | `/api/v1/analytics/network-impact/{run_id}` | Downstream impact |
| WS | `/ws/predictions/{run_id}` | Live prediction updates |
| WS | `/ws/dashboard` | Live delay updates |

---

## Limitations (Honest)

1. **Synthetic data** — The model is trained on simulated journeys. Real-world accuracy will depend on connecting real IRCTC/NTES telemetry.
2. **No GPS resolution** — Positions are linearly interpolated between station lat/lon. Real GPS fixes would improve location accuracy.
3. **Confidence scores** — The formula is a prototype estimate based on historical RMSE. A production system would use proper Bayesian intervals.
4. **Weather** — Weather is a dummy binary feature. A real system would call a weather API.
5. **Network propagation** — The cascade model is a simplified fraction-based estimate, not a full timetable conflict model.

---

## How to Connect Real Railway Data

The data layer is designed for this:

1. **Real-time telemetry**: Replace the simulation engine with an adapter that calls NTES/IRCTC APIs and posts to `POST /api/v1/telemetry` in the same format. The prediction pipeline runs identically.
2. **Historical data**: Replace synthetic `HistoricalJourney` records with real journey data using the same schema. The ML training pipeline runs unchanged.
3. **Schedules**: Replace seed data with official timetable data parsed from the same `ScheduledStop` model.
4. **Model retraining**: Run `python ml/training/train_model.py` on real data. The backend auto-loads the new artifact on restart.

**The architecture is correct if**: removing the passenger frontend leaves a fully functional ETA prediction system.

---

## Directory Structure

```
tracker/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── models.py            # SQLAlchemy ORM (10 entities)
│   │   ├── schemas.py           # Pydantic v2 schemas
│   │   ├── database.py          # Async + sync DB connection
│   │   ├── websocket_manager.py # WS connection manager
│   │   ├── prediction/
│   │   │   ├── baseline.py      # 3 baseline algorithms
│   │   │   ├── engine.py        # ML ETA engine (XGBoost + SHAP)
│   │   │   └── service.py       # DB → engine → DB → WS pipeline
│   │   └── routers/
│   │       ├── trains.py        # Train endpoints
│   │       ├── telemetry.py     # Telemetry ingestion + predictions
│   │       ├── simulation.py    # Simulation control + events
│   │       ├── analytics.py     # Model performance + dashboard
│   │       └── network.py       # Stations + routes
│   ├── requirements.txt
│   └── Dockerfile
├── ml/
│   ├── training/
│   │   ├── train_model.py       # XGBoost training pipeline
│   │   └── evaluate_model.py    # Baseline comparison
│   ├── artifacts/               # Saved model files (gitignored)
│   └── requirements.txt
├── simulation/
│   ├── engine.py                # Real-time simulation engine
│   ├── requirements.txt
│   └── Dockerfile
├── database/
│   └── seed.py                  # Network + 2000 historical journeys
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── PassengerApp.tsx # Passenger view
│       │   ├── Dashboard.tsx    # Operations dashboard
│       │   └── DemoMode.tsx     # SIH demo mode
│       ├── components/
│       │   ├── ETACard.tsx      # Station ETA display
│       │   ├── EventInjector.tsx# Event injection panel
│       │   └── RouteMap.tsx     # Leaflet map
│       ├── api.ts               # API client + WS helpers
│       ├── types.ts             # TypeScript types
│       └── index.css            # Design system
├── docker/
│   └── docker-compose.yml
├── .env.example
└── README.md
```

---

*SIH26028 · Built for Smart India Hackathon 2026 · All simulation data clearly labelled.*
