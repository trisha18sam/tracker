# Deployment Guide

## Local Development (Default)

Uses SQLite — zero configuration needed.

```bash
./start.sh
```

---

## Docker Deployment

### Prerequisites
- Docker Engine 24+
- Docker Compose v2+

### Build & Run

```bash
cd docker
docker-compose up --build -d
```

### Services

| Service | Port | Health Check |
|---------|------|--------------|
| PostgreSQL | 5432 | `pg_isready` |
| Backend | 8000 | `GET /api/v1/trains` |
| Frontend | 5173 | `GET /` |
| Simulation | — | Background process |

### Stop
```bash
docker-compose down
```

### With Data Persistence
```bash
# Add to docker-compose.yml
volumes:
  postgres_data:

services:
  postgres:
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

---

## Production Deployment (Manual)

### 1. Server Requirements

| Component | Minimum |
|-----------|---------|
| CPU | 2 vCPU |
| RAM | 4 GB |
| Disk | 20 GB |
| OS | Ubuntu 22.04+ / Debian 12+ |

### 2. Install Dependencies

```bash
# System packages
apt update && apt install -y \
  python3.11 python3.11-venv python3.11-dev \
  nodejs npm \
  postgresql-15 postgresql-client-15 \
  nginx \
  git

# Verify
python3.11 --version  # 3.11+
node --version        # 20+
psql --version        # 15+
```

### 3. PostgreSQL Setup

```bash
sudo -u postgres psql <<EOF
CREATE USER sih WITH PASSWORD 'strong_password';
CREATE DATABASE eta_forecast OWNER sih;
GRANT ALL PRIVILEGES ON DATABASE eta_forecast TO sih;
EOF

# Test connection
psql -U sih -d eta_forecast -h localhost -c "SELECT version();"
```

### 4. Backend Deployment

```bash
# Clone
git clone <repo> /opt/tracker
cd /opt/tracker

# Python venv
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt
pip install gunicorn

# Environment
cp .env.example .env
# Edit .env with production values:
# DATABASE_URL=postgresql+asyncpg://sih:strong_password@localhost:5432/eta_forecast
# DATABASE_SYNC_URL=postgresql://sih:strong_password@localhost:5432/eta_forecast
# SECRET_KEY=$(openssl rand -hex 32)
# DEBUG=false
# CORS_ORIGINS=https://yourdomain.com

# Seed database
cd database
python seed.py

# Run migrations (if using Alembic)
cd ../backend
alembic upgrade head

# Test
uvicorn app.main:app --host 0.0.0.0 --port 8000
# Verify: curl http://localhost:8000/api/v1/trains
```

### 5. Frontend Deployment

```bash
cd /opt/tracker/frontend
npm install
npm run build
# Output in dist/
```

### 6. Nginx Configuration

```nginx
# /etc/nginx/sites-available/tracker
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        root /opt/tracker/frontend/dist;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Gzip
    gzip on;
    gzip_types text/plain application/javascript application/json text/css;
}
```

```bash
# Enable site
ln -s /etc/nginx/sites-available/tracker /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 7. Systemd Services

**Backend: `/etc/systemd/system/tracker-backend.service`**
```ini
[Unit]
Description=Tracker Backend
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=exec
User=tracker
WorkingDirectory=/opt/tracker/backend
Environment=PATH=/opt/tracker/venv/bin
ExecStart=/opt/tracker/venv/bin/gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --timeout 120 \
  --keep-alive 5 \
  --max-requests 1000 \
  --max-requests-jitter 50
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

**Simulation: `/etc/systemd/system/tracker-simulation.service`**
```ini
[Unit]
Description=Tracker Simulation Engine
After=network.target tracker-backend.service
Requires=tracker-backend.service

[Service]
Type=exec
User=tracker
WorkingDirectory=/opt/tracker/simulation
Environment=PATH=/opt/tracker/venv/bin
Environment=BACKEND_API_URL=http://localhost:8000
ExecStart=/opt/tracker/venv/bin/python engine.py --train-id 1 --delay 0
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

```bash
# Create user
useradd -r -s /bin/bash -d /opt/tracker tracker
chown -R tracker:tracker /opt/tracker

# Enable services
systemctl daemon-reload
systemctl enable tracker-backend tracker-simulation
systemctl start tracker-backend tracker-simulation

# Check status
systemctl status tracker-backend
systemctl status tracker-simulation
```

### 8. SSL (Let's Encrypt)

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com
# Auto-renewal: systemctl enable certbot.timer
```

---

## Environment Variables Reference

### Backend (`.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | Async PostgreSQL URL |
| `DATABASE_SYNC_URL` | Yes | — | Sync PostgreSQL URL |
| `SECRET_KEY` | Yes | — | JWT secret (32+ chars) |
| `CORS_ORIGINS` | Yes | — | Comma-separated origins |
| `DEBUG` | No | `false` | Debug mode |
| `API_V1_PREFIX` | No | `/api/v1` | API prefix |
| `MODEL_PATH` | No | `../ml/artifacts/xgb_model.joblib` | Model file |
| `SCALER_PATH` | No | `../ml/artifacts/scaler.joblib` | Scaler file |
| `FEATURE_LIST_PATH` | No | `../ml/artifacts/feature_list.json` | Features |
| `EVAL_RESULTS_PATH` | No | `../ml/artifacts/evaluation_results.json` | Metrics |

### Frontend (`.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | Yes | — | Backend API URL |

### Simulation (`.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BACKEND_API_URL` | Yes | `http://localhost:8000` | Backend URL |
| `SIM_SPEED_FACTOR` | No | `60` | Sim min per real sec |
| `SIM_TELEMETRY_INTERVAL_SEC` | No | `2` | Telemetry interval |

---

## Monitoring

### Health Checks

```bash
# Backend
curl -f http://localhost:8000/api/v1/trains || exit 1

# Frontend
curl -f http://localhost:5173/ || exit 1

# Database
psql -U sih -d eta_forecast -c "SELECT 1;" || exit 1
```

### Logs

```bash
# Backend
journalctl -u tracker-backend -f

# Simulation
journalctl -u tracker-simulation -f

# Nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Metrics (Optional)

Add Prometheus metrics to FastAPI:
```bash
pip install prometheus-fastapi-instrumentator
```

```python
# backend/app/main.py
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)
```

---

## Backup & Recovery

### Database Backup
```bash
# Daily cron
pg_dump -U sih -d eta_forecast | gzip > /backups/eta_forecast_$(date +%Y%m%d).sql.gz
```

### Restore
```bash
gunzip -c /backups/eta_forecast_20260101.sql.gz | psql -U sih -d eta_forecast
```

### Model Artifacts
```bash
# Backup
tar -czf /backups/ml_artifacts_$(date +%Y%m%d).tar.gz ml/artifacts/

# Restore
tar -xzf /backups/ml_artifacts_20260101.tar.gz -C /
```

---

## Scaling Considerations

| Component | Scaling Strategy |
|-----------|------------------|
| Backend | Horizontal (gunicorn workers), Redis for session/cache |
| Database | Read replicas, connection pooling (PgBouncer) |
| Frontend | CDN for static assets, nginx caching |
| Simulation | Multiple instances with different train_ids |
| ML Inference | Model server (Triton/TorchServe) or batch prediction |

---

## Troubleshooting Production

| Issue | Check |
|-------|-------|
| 502 Bad Gateway | Backend service running? `systemctl status tracker-backend` |
| CORS errors | `CORS_ORIGINS` includes frontend domain? |
| WebSocket fails | Nginx proxy_pass for `/ws/` with upgrade headers? |
| Model not loading | `MODEL_PATH` correct? Artifacts exist? |
| DB connection pool exhausted | Increase pool_size, add PgBouncer |
| High latency | Check DB indexes, enable query logging |