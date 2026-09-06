"""
Data Provider Abstraction Layer for TrackIQ Railway Systems.

Provides unified interface for querying railway stations, trains, live status,
segment seat availability, and pantry services, transparently attaching
honest data source indicators (LIVE, PREDICTED, CACHED, or DEMO).
"""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class DataSourceType(str, Enum):
    LIVE_API = "LIVE_API"         # Directly connected official / partner feed
    DATABASE = "DATABASE"         # Sourced from normalized database
    PREDICTION = "PREDICTION"     # Computed by machine learning / statistical inference
    CACHE = "CACHE"               # Cached from a previous query with timestamp
    SIMULATION = "SIMULATION"     # Clearly labelled prototype / simulation data


@dataclass
class DataProvenance:
    """Metadata tracking the exact origin and freshness of displayed data."""
    source_type: DataSourceType
    is_simulated: bool
    last_updated: datetime = field(default_factory=datetime.utcnow)
    coverage_note: str = ""
    disclaimer: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_type": self.source_type.value,
            "is_simulated": self.is_simulated,
            "last_updated": self.last_updated.isoformat(),
            "coverage_note": self.coverage_note,
            "disclaimer": self.disclaimer,
        }


class RailwayDataProvider(abc.ABC):
    """Abstract interface decoupling API & UI consumers from data origins."""

    @abc.abstractmethod
    async def search_stations(self, query: str, limit: int = 20) -> Dict[str, Any]:
        """Search stations by code, name, city, or state."""
        pass

    @abc.abstractmethod
    async def search_trains(
        self,
        query: str,
        from_station_code: Optional[str] = None,
        to_station_code: Optional[str] = None,
        limit: int = 20,
    ) -> Dict[str, Any]:
        """Search trains by number, name, or corridor."""
        pass

    @abc.abstractmethod
    async def get_train_detail(self, train_id_or_number: str | int) -> Optional[Dict[str, Any]]:
        """Fetch complete train timetable and route stations."""
        pass

    @abc.abstractmethod
    async def get_pantry_menu(
        self,
        train_number: Optional[str] = None,
        station_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Fetch pantry and catering options with clear tariff sources."""
        pass
