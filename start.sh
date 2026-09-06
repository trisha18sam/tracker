#!/bin/bash
# SIH26028 - Dynamic ETA Forecast for Coaching Trains
# Startup script to run all services with a single command

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$PROJECT_DIR/venv"
LOG_DIR="$PROJECT_DIR/logs"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create logs directory
mkdir -p "$LOG_DIR"

# Check if virtual environment exists
if [ ! -d "$VENV_DIR" ]; then
    print_status "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

# Activate virtual environment
source "$VENV_DIR/bin/activate"

# Check if dependencies are already installed
if ! "$VENV_DIR/bin/pip" show fastapi >/dev/null 2>&1; then
    print_status "Installing Python dependencies (this may take 1-2 minutes on first run)..."
    "$VENV_DIR/bin/pip" install -r "$PROJECT_DIR/backend/requirements.txt"
    "$VENV_DIR/bin/pip" install -r "$PROJECT_DIR/simulation/requirements.txt"
    "$VENV_DIR/bin/pip" install aiosqlite
else
    print_status "Python dependencies already installed, skipping..."
fi

# Seed database if not already seeded
if [ ! -f "$PROJECT_DIR/tracker.db" ]; then
    print_status "Seeding database..."
    cd "$PROJECT_DIR/database"
    python seed.py
fi

# Install frontend dependencies if needed
if [ ! -d "$PROJECT_DIR/frontend/node_modules" ]; then
    print_status "Installing frontend dependencies..."
    cd "$PROJECT_DIR/frontend"
    npm install
fi

# Build frontend for production (optional, comment out for dev)
# print_status "Building frontend..."
# cd "$PROJECT_DIR/frontend"
# npm run build

print_success "Setup complete! Starting services..."
echo ""
echo "=========================================="
echo "  SIH26028 - Dynamic ETA Forecast"
echo "=========================================="
echo ""
echo "Services will be available at:"
echo "  Frontend:     http://localhost:5173"
echo "  Backend API:  http://localhost:8000"
echo "  API Docs:     http://localhost:8000/api/docs"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Function to cleanup background processes on exit
cleanup() {
    print_warning "Shutting down services..."
    kill $(jobs -p) 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start backend
print_status "Starting backend on port 8000..."
cd "$PROJECT_DIR/backend"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
sleep 3

# Start frontend
print_status "Starting frontend on port 5173..."
cd "$PROJECT_DIR/frontend"
npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
sleep 2

print_success "All services started!"
echo ""
echo "Logs:"
echo "  Backend:  tail -f $LOG_DIR/backend.log"
echo "  Frontend: tail -f $LOG_DIR/frontend.log"
echo ""

# Wait for background processes
wait $BACKEND_PID $FRONTEND_PID