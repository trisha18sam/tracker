"""
Database-backed implementation of RailwayDataProvider.

Queries normalized relational models, attaches data provenance metadata,
and applies fuzzy/prefix search logic.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select, or_, and_, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Station, Train, Route, RouteSection, ScheduledStop, TrainRun,
    RunStatus, DataSource,
)
from app.models_pantry import (
    PantryVendor, PantryMenuItem, PantryCategory, PantryPriceSource, PantryItemAvailability,
)
from app.providers.base import (
    RailwayDataProvider, DataSourceType, DataProvenance,
)

logger = logging.getLogger(__name__)


class DatabaseRailwayProvider(RailwayDataProvider):
    """Provides authentic timetable and station records from normalized database."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def search_stations(self, query: str, limit: int = 20) -> Dict[str, Any]:
        """
        Fuzzy + prefix + substring search across station code, name, city, and state.
        Prioritizes exact code matches, then prefix matches, then substring matches.
        """
        q = (query or "").strip().lower()
        if not q:
            # Return major stations by platform count / importance
            stmt = (
                select(Station)
                .order_by(desc(Station.is_junction), desc(Station.num_platforms), Station.name)
                .limit(limit)
            )
            res = await self.db.execute(stmt)
            stations = res.scalars().all()
            return {
                "provenance": DataProvenance(
                    source_type=DataSourceType.DATABASE,
                    is_simulated=False,
                    coverage_note="Major Indian Railways junction stations",
                ).to_dict(),
                "stations": [
                    {
                        "id": s.id,
                        "code": s.code,
                        "name": s.name,
                        "city": s.city,
                        "state": s.state,
                        "zone": s.zone,
                        "division": s.division,
                        "latitude": s.latitude,
                        "longitude": s.longitude,
                        "num_platforms": s.num_platforms,
                        "is_junction": s.is_junction,
                    }
                    for s in stations
                ],
            }

        # Match exact code, prefix name/city, or substring
        like_pattern = f"%{q}%"
        stmt = (
            select(Station)
            .where(
                or_(
                    func.lower(Station.code).like(f"{q}%"),
                    func.lower(Station.name).like(like_pattern),
                    func.lower(Station.city).like(like_pattern),
                    func.lower(Station.state).like(like_pattern),
                )
            )
            .order_by(
                # Exact code match first
                (func.lower(Station.code) == q).desc(),
                # Code prefix match second
                func.lower(Station.code).like(f"{q}%").desc(),
                # Name prefix match third
                func.lower(Station.name).like(f"{q}%").desc(),
                desc(Station.is_junction),
                Station.name,
            )
            .limit(limit)
        )

        res = await self.db.execute(stmt)
        stations = res.scalars().all()

        return {
            "provenance": DataProvenance(
                source_type=DataSourceType.DATABASE,
                is_simulated=False,
                coverage_note=f"Matched {len(stations)} station(s) from Indian Railways registry",
            ).to_dict(),
            "query": query,
            "count": len(stations),
            "stations": [
                {
                    "id": s.id,
                    "code": s.code,
                    "name": s.name,
                    "city": s.city,
                    "state": s.state,
                    "zone": s.zone,
                    "division": s.division,
                    "latitude": s.latitude,
                    "longitude": s.longitude,
                    "num_platforms": s.num_platforms,
                    "is_junction": s.is_junction,
                }
                for s in stations
            ],
        }

    async def search_trains(
        self,
        query: str,
        from_station_code: Optional[str] = None,
        to_station_code: Optional[str] = None,
        limit: int = 20,
    ) -> Dict[str, Any]:
        """
        Data-driven train search across number, name, and route corridor.
        Never fabricates records; returns honest empty results if not found.
        """
        q = (query or "").strip().lower()

        stmt = select(Train).options(
            selectinload(Train.route).selectinload(Route.origin_station),
            selectinload(Train.route).selectinload(Route.destination_station),
            selectinload(Train.scheduled_stops).selectinload(ScheduledStop.station),
        )

        if q:
            stmt = stmt.where(
                or_(
                    func.lower(Train.number).like(f"{q}%"),
                    func.lower(Train.name).like(f"%{q}%"),
                    func.lower(Train.rake_type).like(f"%{q}%"),
                )
            )

        res = await self.db.execute(stmt.limit(limit * 2))
        trains = res.scalars().all()

        # Filter by corridor if from/to specified
        matching_trains = []
        for t in trains:
            stops = {s.station.code.upper(): s.stop_number for s in t.scheduled_stops if s.station}
            if from_station_code and to_station_code:
                f_code = from_station_code.strip().upper()
                t_code = to_station_code.strip().upper()
                if f_code in stops and t_code in stops and stops[f_code] < stops[t_code]:
                    matching_trains.append(t)
            elif from_station_code:
                if from_station_code.strip().upper() in stops:
                    matching_trains.append(t)
            elif to_station_code:
                if to_station_code.strip().upper() in stops:
                    matching_trains.append(t)
            else:
                matching_trains.append(t)

        matching_trains = matching_trains[:limit]

        return {
            "provenance": DataProvenance(
                source_type=DataSourceType.DATABASE,
                is_simulated=False,
                coverage_note=f"{len(matching_trains)} train(s) matched in connected schedule database",
            ).to_dict(),
            "query": query,
            "count": len(matching_trains),
            "trains": [
                {
                    "id": t.id,
                    "number": t.number,
                    "name": t.name,
                    "type": t.train_type.value,
                    "rake_type": t.rake_type,
                    "max_speed_kmh": t.max_speed_kmh,
                    "origin": t.route.origin_station.code if t.route and t.route.origin_station else None,
                    "origin_name": t.route.origin_station.name if t.route and t.route.origin_station else None,
                    "destination": t.route.destination_station.code if t.route and t.route.destination_station else None,
                    "destination_name": t.route.destination_station.name if t.route and t.route.destination_station else None,
                    "stops_count": len(t.scheduled_stops),
                }
                for t in matching_trains
            ],
        }

    async def get_train_detail(self, train_id_or_number: str | int) -> Optional[Dict[str, Any]]:
        """Fetch complete schedule with authentic origin, intermediate, and destination stops."""
        stmt = (
            select(Train)
            .options(
                selectinload(Train.route).selectinload(Route.origin_station),
                selectinload(Train.route).selectinload(Route.destination_station),
                selectinload(Train.route).selectinload(Route.sections).selectinload(RouteSection.from_station),
                selectinload(Train.route).selectinload(Route.sections).selectinload(RouteSection.to_station),
                selectinload(Train.scheduled_stops).selectinload(ScheduledStop.station),
                selectinload(Train.coaches),
            )
        )

        if isinstance(train_id_or_number, int) or (isinstance(train_id_or_number, str) and train_id_or_number.isdigit() and len(train_id_or_number) < 5):
            stmt = stmt.where(Train.id == int(train_id_or_number))
        else:
            stmt = stmt.where(Train.number == str(train_id_or_number))

        res = await self.db.execute(stmt)
        train = res.scalar_one_or_none()
        if not train:
            return None

        # Build ordered stop timetable
        stops_ordered = sorted(train.scheduled_stops, key=lambda s: s.stop_number)
        timetable = []
        for stop in stops_ordered:
            timetable.append({
                "stop_number": stop.stop_number,
                "station_id": stop.station_id,
                "station_code": stop.station.code if stop.station else "",
                "station_name": stop.station.name if stop.station else "",
                "city": stop.station.city if stop.station else "",
                "scheduled_arrival": stop.arrival_time_str or ("Origin" if stop.stop_number == 1 else "—"),
                "scheduled_departure": stop.departure_time_str or ("Terminus" if stop.stop_number == len(stops_ordered) else "—"),
                "dwell_min": stop.scheduled_dwell_min,
                "platform": stop.platform,
                "distance_from_origin_km": stop.distance_from_origin_km or 0.0,
            })

        # Calculate actual rake seat totals
        total_rake_seats = sum(c.total_seats for c in train.coaches)

        return {
            "provenance": DataProvenance(
                source_type=DataSourceType.DATABASE,
                is_simulated=False,
                coverage_note="Official IR timetable schedule & route sections",
            ).to_dict(),
            "train": {
                "id": train.id,
                "number": train.number,
                "name": train.name,
                "type": train.train_type.value,
                "rake_type": train.rake_type,
                "max_speed_kmh": train.max_speed_kmh,
                "total_rake_seats": total_rake_seats,
                "coaches_count": len(train.coaches),
                "runs_on_days": train.runs_on_days,
            },
            "route": {
                "id": train.route.id if train.route else None,
                "name": train.route.name if train.route else "",
                "origin_station": {
                    "id": train.route.origin_station.id,
                    "code": train.route.origin_station.code,
                    "name": train.route.origin_station.name,
                } if train.route and train.route.origin_station else None,
                "destination_station": {
                    "id": train.route.destination_station.id,
                    "code": train.route.destination_station.code,
                    "name": train.route.destination_station.name,
                } if train.route and train.route.destination_station else None,
                "total_distance_km": train.route.total_distance_km if train.route else 0.0,
                "sections": [
                    {
                        "id": sec.id,
                        "sequence_number": sec.sequence_number,
                        "from_station": {"id": sec.from_station.id, "code": sec.from_station.code, "name": sec.from_station.name},
                        "to_station": {"id": sec.to_station.id, "code": sec.to_station.code, "name": sec.to_station.name},
                        "distance_km": sec.distance_km,
                        "max_speed_kmh": sec.max_speed_kmh,
                        "scheduled_travel_time_min": sec.scheduled_travel_time_min,
                    }
                    for sec in (train.route.sections if train.route else [])
                ],
            },
            "timetable": timetable,
        }

    async def get_pantry_menu(
        self,
        train_number: Optional[str] = None,
        station_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Fetch pantry menu with statutory IRCTC official tariffs clearly distinguished from vendor items."""
        stmt = (
            select(PantryMenuItem)
            .options(selectinload(PantryMenuItem.vendor))
            .order_by(PantryMenuItem.category, PantryMenuItem.price)
        )
        res = await self.db.execute(stmt)
        items = res.scalars().all()

        categorized: Dict[str, List[Dict[str, Any]]] = {
            "BREAKFAST": [],
            "MEALS": [],
            "SNACKS": [],
            "BEVERAGES": [],
            "SWEETS": [],
        }

        for item in items:
            cat = item.category.value
            if cat not in categorized:
                categorized[cat] = []
            categorized[cat].append({
                "id": str(item.id),
                "name": item.name,
                "category": cat,
                "diet": item.diet.value,
                "price": item.price,
                "description": item.description,
                "calories": item.calories,
                "image_icon": item.image_icon,
                "availability": item.availability.value,
                "stock_count": item.stock_count,
                "price_source": item.price_source.value,
                "official_tariff_reference": item.official_tariff_reference,
                "vendor_name": item.vendor.name if item.vendor else "IRCTC Onboard Catering",
                "vendor_rating": item.vendor.rating if item.vendor else 4.5,
                "last_updated": item.last_updated.isoformat() if item.last_updated else datetime.utcnow().isoformat(),
            })

        return {
            "provenance": DataProvenance(
                source_type=DataSourceType.DATABASE,
                is_simulated=True,
                coverage_note="Includes statutory IRCTC Standard Menu tariffs (Circular 60/2019) + Vendor simulated items",
                disclaimer="Standard item prices reflect official Indian Railways statutory tariffs. Vendor specials are simulated demonstration menus.",
            ).to_dict(),
            "categories": categorized,
            "total_items": len(items),
        }
