# Documentation Index

Welcome to the SIH26028 Dynamic ETA Forecast documentation.

## Quick Links

| Document | Description |
|----------|-------------|
| [README.md](../README.md) | Project overview, quick start, architecture |
| [TECH_STACK.md](TECH_STACK.md) | Complete technology stack with versions |
| [API.md](API.md) | Full API reference with endpoints, schemas, examples |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture, data flow, component details |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Development setup, workflows, debugging |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Production deployment guide |

---

## Getting Started

### For Developers
1. Read [README.md](../README.md) — Project overview
2. Read [DEVELOPMENT.md](DEVELOPMENT.md) — Local setup & workflows
3. Explore [API.md](API.md) — Endpoints you'll call

### For ML Engineers
1. Read [ARCHITECTURE.md](ARCHITECTURE.md) — Prediction pipeline
2. Check `ml/training/train_model.py` — Training code
3. Check `backend/app/prediction/engine.py` — Inference code

### For DevOps
1. Read [DEPLOYMENT.md](DEPLOYMENT.md) — Production deployment
2. Check `docker/docker-compose.yml` — Container orchestration
3. Check `backend/app/main.py` — Health endpoints

---

## Key Endpoints Quick Reference

| Need | Endpoint |
|------|----------|
| List trains | `GET /api/v1/trains` |
| Train live status | `GET /api/v1/trains/{id}/live` |
| ETA predictions | `GET /api/v1/trains/{id}/predictions` |
| Start simulation | `POST /api/v1/simulation/start` |
| Inject event | `POST /api/v1/simulation/events` |
| Model performance | `GET /api/v1/analytics/model-performance` |
| Dashboard data | `GET /api/v1/analytics/active-runs` |
| WebSocket dashboard | `WS /ws/dashboard` |
| WebSocket predictions | `WS /ws/predictions/{run_id}` |
| API Docs (Swagger) | `GET /api/docs` |

---

## Project Structure

```
tracker/
├── docs/                    # Documentation (this folder)
│   ├── TECH_STACK.md       # Technology versions & structure
│   ├── API.md              # API reference
│   ├── ARCHITECTURE.md     # System design
│   ├── DEVELOPMENT.md      # Dev guide
│   └── DEPLOYMENT.md       # Production deployment
├── backend/                # FastAPI backend
├── frontend/               # React + Vite frontend
├── ml/                     # ML training pipeline
├── simulation/             # Telemetry simulator
├── database/               # Seeding scripts
├── docker/                 # Docker Compose
├── start.sh                # Single-command startup
└── README.md               # Main documentation
```

---

## Common Tasks

| Task | Command |
|------|---------|
| Start everything | `./start.sh` |
| Backend only | `cd backend && uvicorn app.main:app --reload` |
| Frontend only | `cd frontend && npm run dev` |
| Seed database | `cd database && python seed.py` |
| Train model | `cd ml && python training/train_model.py` |
| Run simulation | `cd simulation && python engine.py --train-id 1 --delay 0` |
| Docker deploy | `cd docker && docker-compose up --build` |
| View logs | `tail -f logs/backend.log` |

---

## Support

- **API Issues:** Check [API.md](API.md) for request/response formats
- **Architecture Questions:** See [ARCHITECTURE.md](ARCHITECTURE.md)
- **Deployment Problems:** Check [DEPLOYMENT.md](DEPLOYMENT.md)
- **Development Setup:** See [DEVELOPMENT.md](DEVELOPMENT.md)