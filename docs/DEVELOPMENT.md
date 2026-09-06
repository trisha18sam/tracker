# Development Guide

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.11+ | `apt install python3.11 python3.11-venv` |
| Node.js | 20+ | `fnm install 20` or `nvm install 20` |
| Git | any | `apt install git` |
| (Optional) PostgreSQL | 15 | `apt install postgresql-15` |

---

## Quick Start

```bash
# 1. Clone & enter
cd tracker

# 2. Run everything with one command
./start.sh
```

**Services:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/api/docs

---

## Manual Setup

### Backend

```bash
# Create venv
python3 -m venv venv
source venv/bin/activate

# Install deps
pip install -r backend/requirements.txt
pip install -r simulation/requirements.txt
pip install aiosqlite

# Seed database
cd database
python seed.py

# Start backend
cd ../backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Simulation

```bash
cd simulation
source ../venv/bin/activate
python engine.py --train-id 1 --delay 0
```

### ML Training (Optional)

```bash
cd ml
pip install -r requirements.txt
python training/train_model.py
python training/evaluate_model.py
```

---

## Project Commands

### Backend

| Command | Description |
|---------|-------------|
| `uvicorn app.main:app --reload` | Dev server with hot reload |
| `uvicorn app.main:app --host 0.0.0.0 --port 8000` | Production server |
| `pytest` | Run tests (if added) |
| `alembic revision --autogenerate -m "msg"` | Create migration |
| `alembic upgrade head` | Apply migrations |

### Frontend

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint (if configured) |

### Database

| Command | Description |
|---------|-------------|
| `cd database && python seed.py` | Seed/reseed database |
| `cd database && python seed_seats.py` | Seed seat data |

### Simulation

| Command | Description |
|---------|-------------|
| `python engine.py --train-id 1 --delay 0` | On-time simulation |
| `python engine.py --train-id 1 --delay 15` | 15 min late start |
| `python engine.py --train-id 2 --delay 30 --speed-factor 120` | Custom params |

---

## Adding New Features

### 1. New API Endpoint

```bash
# 1. Add schema in backend/app/schemas.py
class NewRequest(BaseModel):
    field: str

class NewResponse(BaseModel):
    id: int
    field: str

# 2. Add model in backend/app/models.py (if DB needed)
class NewModel(Base):
    __tablename__ = "new_table"
    id = Column(Integer, primary_key=True)
    field = Column(String)

# 3. Add router in backend/app/routers/new_router.py
router = APIRouter(prefix="/new", tags=["new"])

@router.post("", response_model=NewResponse)
async def create_new(request: NewRequest, db: AsyncSession = Depends(get_db)):
    ...

# 4. Register in backend/app/main.py
app.include_router(new_router.router)

# 5. Add TypeScript types in frontend/src/types.ts
export interface NewRequest { field: string; }
export interface NewResponse { id: number; field: string; }

# 6. Add API call in frontend/src/api.ts
export const api = {
  new: {
    create: (data: NewRequest) => fetch("/api/v1/new", { method: "POST", body: JSON.stringify(data) })
  }
}
```

### 2. New ML Feature

```bash
# 1. Add feature engineering in ml/training/train_model.py
def build_features(df: pd.DataFrame) -> pd.DataFrame:
    df["new_feature"] = df["speed"] / df["max_speed"]
    return df

# 2. Add to FEATURE_LIST in training script
FEATURES = [..., "new_feature"]

# 3. Retrain
python training/train_model.py

# 4. Update prediction service to compute new feature
# backend/app/prediction/engine.py
def _build_features(self, ...) -> pd.DataFrame:
    features["new_feature"] = ...
```

### 3. New Frontend Page

```bash
# 1. Create page component
# frontend/src/pages/NewPage.tsx
export function NewPage() { return <div>New Page</div>; }

# 2. Add route in App.tsx or main.tsx
<Route path="/new" element={<NewPage />} />

# 3. Add to navigation (if needed)
```

---

## Debugging

### Backend Logs
```bash
# View uvicorn logs
tail -f logs/backend.log

# Or run directly for console output
cd backend && uvicorn app.main:app --reload
```

### Frontend Logs
```bash
# Browser DevTools Console
# Network tab for API calls

# Vite dev server logs
tail -f logs/frontend.log
```

### Database Inspection
```bash
# SQLite CLI
sqlite3 tracker.db
.tables
SELECT * FROM train_run;
SELECT * FROM eta_prediction ORDER BY id DESC LIMIT 10;

# Or use DB Browser for SQLite (GUI)
```

### Common Issues

| Issue | Solution |
|-------|----------|
| `ModuleNotFoundError: aiosqlite` | `pip install aiosqlite` |
| `Database locked` | Kill other processes using tracker.db |
| `Model not found` | Run `python ml/training/train_model.py` |
| `CORS error` | Check `CORS_ORIGINS` in .env |
| `WebSocket connection failed` | Ensure backend running on port 8000 |
| `Frontend blank page` | Check browser console, verify API URL |

---

## Testing API Endpoints

### Using curl
```bash
# Health check
curl http://localhost:8000/api/v1/trains

# Train detail
curl http://localhost:8000/api/v1/trains/1

# Live status
curl http://localhost:8000/api/v1/trains/1/live

# Predictions
curl http://localhost:8000/api/v1/trains/1/predictions

# Start simulation
curl -X POST http://localhost:8000/api/v1/simulation/start \
  -H "Content-Type: application/json" \
  -d '{"train_id": 1, "delay_minutes": 10}'

# Inject event
curl -X POST http://localhost:8000/api/v1/simulation/events \
  -H "Content-Type: application/json" \
  -d '{"run_id": 1, "event_type": "SPEED_RESTRICTION", "section_id": 3, "speed_restriction_kmh": 60}'

# Model performance
curl http://localhost:8000/api/v1/analytics/model-performance
```

### Using Swagger UI
Open http://localhost:8000/api/docs — interactive API explorer

---

## Environment-Specific Config

### Development (`.env`)
```env
DATABASE_URL=sqlite+aiosqlite:///tracker.db
DATABASE_SYNC_URL=sqlite:///tracker.db
DEBUG=true
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Production (`.env.production`)
```env
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db
DATABASE_SYNC_URL=postgresql://user:pass@host:5432/db
DEBUG=false
SECRET_KEY=your-strong-secret-key
CORS_ORIGINS=https://yourdomain.com
```

---

## Git Workflow

```bash
# Feature branch
git checkout -b feature/new-feature

# Commit changes
git add .
git commit -m "feat: add new feature"

# Push
git push origin feature/new-feature

# Create PR
```

### Commit Convention
```
feat: new feature
fix: bug fix
docs: documentation
refactor: code restructuring
test: adding tests
chore: maintenance
```

---

## Useful Scripts

### Reset Everything
```bash
# Stop all
pkill -f uvicorn
pkill -f vite

# Reset database
rm tracker.db
cd database && python seed.py

# Restart
./start.sh
```

### View Logs
```bash
# Backend
tail -f logs/backend.log | grep -E "(ERROR|WARNING|prediction)"

# Frontend
tail -f logs/frontend.log
```

### Database Backup
```bash
cp tracker.db tracker.db.backup.$(date +%Y%m%d)
```