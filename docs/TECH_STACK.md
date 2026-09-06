# Technical Stack Documentation

## Backend (FastAPI + Python)

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| **Web Framework** | FastAPI | 0.141.1 | Async REST API + WebSocket |
| **ASGI Server** | Uvicorn | 0.52.4 | Production server with hot reload |
| **Database (Async)** | SQLAlchemy + asyncpg | 2.0.52 / 0.31.0 | Async PostgreSQL ORM |
| **Database (Sync)** | SQLAlchemy + psycopg2-binary | 2.0.52 / 2.9.12 | Sync DB for seeding/scripts |
| **SQLite (Dev)** | aiosqlite | 0.22.1 | Local dev database |
| **Migrations** | Alembic | 1.19.2 | Schema migrations |
| **Validation** | Pydantic v2 | 2.13.5 | Request/response validation |
| **Settings** | pydantic-settings | 2.15.0 | Environment config |
| **ML Inference** | XGBoost | 3.4.1 | Trained model prediction |
| **Data Processing** | pandas, numpy | 3.0.5 / 2.5.2 | Feature engineering |
| **HTTP Client** | httpx | 0.28.1 | Simulation → backend calls |
| **WebSocket** | websockets | 17.1 | Real-time updates |
| **Serialization** | joblib | 1.6.0 | Model artifact loading |

### Backend Structure: `backend/app/`

```
backend/app/
├── main.py                 # FastAPI entry, CORS, router registration
├── models.py               # 10 SQLAlchemy ORM models
├── schemas.py              # Pydantic v2 request/response schemas
├── database.py             # Async/sync engines, session management
├── websocket_manager.py    # Connection manager for WS
├── prediction/
│   ├── baseline.py         # 3 baseline algorithms
│   ├── engine.py           # ML ETA engine (XGBoost + SHAP)
│   └── service.py          # DB → engine → DB → WS pipeline
└── routers/
    ├── trains.py           # Train endpoints
    ├── telemetry.py        # Telemetry ingestion + predictions
    ├── simulation.py       # Simulation control + events
    ├── analytics.py        # Model performance + dashboard
    └── network.py          # Stations + routes
```

---

## Frontend (React + TypeScript + Vite)

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| **Framework** | React | 19.x | UI library |
| **Build Tool** | Vite | 8.2.2 | Dev server + production build |
| **Language** | TypeScript | 6.0.2 | Type safety |
| **Routing** | react-router-dom | 7.18.3 | SPA routing |
| **State** | React hooks | — | Local state (no Redux/Zustand) |
| **Charts** | Recharts | 3.10.1 | Dashboard visualizations |
| **Maps** | Leaflet + react-leaflet | 1.9.4 / 5.0.0 | Route/train map |
| **Icons** | lucide-react | 1.41.0 | Icon set |
| **Date** | date-fns | 4.4.0 | Date formatting |
| **Utils** | clsx | 2.1.1 | Conditional classNames |
| **Styling** | CSS Modules / CSS Variables | — | Design system in `index.css` |

### Frontend Structure: `frontend/src/`

```
frontend/src/
├── pages/
│   ├── PassengerApp.tsx    # Passenger view
│   ├── Dashboard.tsx       # Operations dashboard
│   └── DemoMode.tsx        # SIH demo mode
├── components/
│   ├── ETACard.tsx         # Station ETA display
│   ├── EventInjector.tsx   # Event injection panel
│   └── RouteMap.tsx        # Leaflet map
├── api.ts                  # REST + WebSocket client
├── types.ts                # TypeScript interfaces matching backend schemas
└── index.css               # Design tokens (colors, spacing, dark mode)
```

---

## ML Pipeline (Python)

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| **Model** | XGBoost | 2.0.3 | Gradient boosting regressor |
| **Alternative** | LightGBM | 4.3.0 | Backup model |
| **Explainability** | SHAP | 0.45.0 | Feature attribution |
| **Data** | pandas, numpy | 2.2.2 / 1.26.4 | Feature engineering |
| **Metrics** | scikit-learn | 1.5.0 | MAE, RMSE, evaluation |
| **Visualization** | matplotlib, seaborn | 3.9.0 / 0.13.2 | Training plots |
| **Tracking** | tqdm | 4.66.4 | Progress bars |

### ML Structure: `ml/training/`

```
ml/training/
├── train_model.py          # Chronological split, feature engineering, XGBoost training
├── evaluate_model.py       # Test set evaluation vs 3 baselines
└── artifacts/              # Saved model files (gitignored)
    ├── xgb_model.joblib
    ├── scaler.joblib
    ├── feature_list.json
    └── evaluation_results.json
```

---

## Simulation Engine (Python)

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| **HTTP Client** | httpx | 0.27.0 | Async POST to backend |
| **Data** | numpy, pandas | 1.26.4 / 2.2.2 | Physics calculations |
| **Config** | python-dotenv | 1.0.1 | Environment variables |

### Simulation: `simulation/engine.py`

Standalone async process:
1. Creates `TrainRun` via `POST /simulation/start`
2. Advances train through sections at realistic speeds
3. Posts `TrainTelemetry` every 2 seconds
4. Handles operational events (speed restrictions, stoppages)

---

## Database

| Environment | Database | Connection |
|-------------|----------|------------|
| **Local Dev** | SQLite | `sqlite+aiosqlite:///tracker.db` |
| **Production** | PostgreSQL 15 | `postgresql+asyncpg://...` |

### Schema: 10 Tables

| Table | Purpose |
|-------|---------|
| `Station` | Railway station (code, name, lat/lon, zone) |
| `Route` | Named route from origin to destination |
| `RouteSection` | Section between stations with historical stats |
| `Train` | Named train with schedule and type |
| `ScheduledStop` | Official timetable entry |
| `TrainRun` | Single operating instance on a date |
| `TrainTelemetry` | Position/speed fix (SIMULATED or LIVE) |
| `HistoricalJourney` | Per-section performance (ML training data) |
| `OperationalEvent` | Events affecting running |
| `ETAPrediction` | Independently computed ETA |

### Seed: `database/seed.py`

- 12 stations (NDLS → BCT via Mathura, Agra, Jaipur, Ajmer, Abu Road, Palanpur, Ahmedabad, Vadodara, Surat)
- 1 route with 11 sections
- 2 trains (Rajdhani + Express)
- 1000+ synthetic historical journeys per train

---

## Infrastructure

| Tool | Purpose |
|------|---------|
| **Docker** | Containerization (`docker/Dockerfile` per service) |
| **Docker Compose** | Local multi-service stack (`docker/docker-compose.yml`) |
| **nginx** | Frontend reverse proxy (production) |

---

## Project Structure

```
tracker/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── database.py
│   │   ├── prediction/
│   │   └── routers/
│   └── requirements.txt
├── frontend/                # React + Vite
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── api.ts
│   │   └── types.ts
│   ├── package.json
│   └── tsconfig.json
├── ml/                      # ML training
│   ├── training/
│   └── artifacts/
├── simulation/              # Telemetry simulator
│   └── engine.py
├── database/                # Seeding scripts
│   └── seed.py
├── docker/                  # Docker Compose
├── docs/                    # Documentation
│   └── TECH_STACK.md
├── .env.example             # Config template
├── .env                     # Local config (SQLite)
├── start.sh                 # Single-command startup
└── README.md
```

---

## API Endpoints Summary

### Trains
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/trains` | List all trains |
| GET | `/api/v1/trains/{id}` | Train detail + schedule |
| GET | `/api/v1/trains/{id}/live` | Latest telemetry + active events |
| GET | `/api/v1/trains/{id}/predictions` | Latest ETA predictions |

### Stations & Routes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/stations` | All stations |
| GET | `/api/v1/routes/{id}` | Route with sections |

### Telemetry & Simulation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/telemetry` | Ingest telemetry fix |
| POST | `/api/v1/simulation/start` | Create new TrainRun |
| POST | `/api/v1/simulation/events` | Inject operational event |
| DELETE | `/api/v1/simulation/events/{id}` | Clear event |

### Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/analytics/model-performance` | MAE/RMSE vs baselines |
| GET | `/api/v1/analytics/active-runs` | Dashboard summary |
| GET | `/api/v1/analytics/network-impact/{run_id}` | Downstream impact |

### WebSocket
| Method | Endpoint | Description |
|--------|----------|-------------|
| WS | `/ws/dashboard` | Live delay updates |
| WS | `/ws/predictions/{run_id}` | Live prediction updates |

### Documentation
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/docs` | Swagger UI |
| GET | `/api/redoc` | ReDoc |