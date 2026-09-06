"""
Database connection setup — async (FastAPI) + sync (seed/migration scripts).
"""
from __future__ import annotations

import os
from typing import AsyncGenerator

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from pathlib import Path

BACKEND_DIR = Path(__file__).parent.parent.resolve()
PROJECT_ROOT = BACKEND_DIR.parent.resolve()
root_env = PROJECT_ROOT / ".env"
backend_env = BACKEND_DIR / ".env"
if root_env.exists():
    load_dotenv(root_env)
if backend_env.exists():
    load_dotenv(backend_env)

# Find tracker.db: prioritize backend/tracker.db, then PROJECT_ROOT
if (BACKEND_DIR / "tracker.db").exists():
    _db_path = BACKEND_DIR / "tracker.db"
elif (PROJECT_ROOT / "tracker.db").exists():
    _db_path = PROJECT_ROOT / "tracker.db"
else:
    _db_path = BACKEND_DIR / "tracker.db"

DEFAULT_SQLITE_PATH = _db_path.as_posix()

def _normalize_sqlite_url(url: str, is_async: bool = False) -> str:
    prefix = "sqlite+aiosqlite:///" if is_async else "sqlite:///"
    if url.startswith("sqlite"):
        path_part = url.split(":///", 1)[-1] if ":///" in url else url.split("://", 1)[-1]
        p = Path(path_part)
        if not p.is_absolute():
            if (BACKEND_DIR / path_part).exists():
                p = (BACKEND_DIR / path_part).resolve()
            else:
                p = (PROJECT_ROOT / path_part).resolve()
        return f"{prefix}{p.as_posix()}"
    return url


DATABASE_URL = _normalize_sqlite_url(
    os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{DEFAULT_SQLITE_PATH}"),
    is_async=True,
)
DATABASE_SYNC_URL = _normalize_sqlite_url(
    os.getenv("DATABASE_SYNC_URL", f"sqlite:///{DEFAULT_SQLITE_PATH}"),
    is_async=False,
)

# Async engine (used by FastAPI routes)
if "sqlite" in DATABASE_URL:
    async_engine = create_async_engine(
        DATABASE_URL, echo=False, connect_args={"check_same_thread": False}
    )
else:
    async_engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine, class_=AsyncSession, expire_on_commit=False
)

# Sync engine (used by Alembic migrations + seed script)
if "sqlite" in DATABASE_SYNC_URL:
    sync_engine = create_engine(
        DATABASE_SYNC_URL, echo=False, connect_args={"check_same_thread": False}
    )
else:
    sync_engine = create_engine(DATABASE_SYNC_URL, echo=False, pool_pre_ping=True)

SyncSessionLocal = sessionmaker(bind=sync_engine, autocommit=False, autoflush=False)


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields an async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_sync_db() -> Session:
    """Return a synchronous DB session (for scripts)."""
    return SyncSessionLocal()
