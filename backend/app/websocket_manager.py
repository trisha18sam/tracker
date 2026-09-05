"""
WebSocket connection manager.

Manages two channels:
  - /ws/predictions/{run_id}  — clients watching a specific train run
  - /ws/dashboard             — operations dashboard (all active runs)
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Dict, List, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        # run_id -> set of WebSocket connections
        self._run_connections: Dict[int, Set[WebSocket]] = defaultdict(set)
        # All dashboard connections
        self._dashboard_connections: Set[WebSocket] = set()

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def connect_run(self, websocket: WebSocket, run_id: int) -> None:
        await websocket.accept()
        self._run_connections[run_id].add(websocket)
        logger.info("WS connected: run_id=%s total=%d", run_id, len(self._run_connections[run_id]))

    async def connect_dashboard(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._dashboard_connections.add(websocket)
        logger.info("Dashboard WS connected: total=%d", len(self._dashboard_connections))

    def disconnect_run(self, websocket: WebSocket, run_id: int) -> None:
        self._run_connections[run_id].discard(websocket)
        logger.info("WS disconnected: run_id=%s", run_id)

    def disconnect_dashboard(self, websocket: WebSocket) -> None:
        self._dashboard_connections.discard(websocket)
        logger.info("Dashboard WS disconnected")

    # ── Broadcast ─────────────────────────────────────────────────────────────

    async def broadcast_run(self, run_id: int, message: str) -> None:
        dead: Set[WebSocket] = set()
        for ws in list(self._run_connections.get(run_id, set())):
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._run_connections[run_id].discard(ws)

    async def broadcast_dashboard(self, message: str) -> None:
        dead: Set[WebSocket] = set()
        for ws in list(self._dashboard_connections):
            try:
                await ws.send_text(message)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._dashboard_connections.discard(ws)

    def active_run_ids(self) -> List[int]:
        return [rid for rid, conns in self._run_connections.items() if conns]


# Singleton used across the application
manager = ConnectionManager()
