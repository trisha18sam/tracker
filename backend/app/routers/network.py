"""Stations and Routes routers."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import List

from app.database import get_async_db
from app.models import Station, Route, RouteSection
from app.schemas import StationOut, RouteOut

stations_router = APIRouter(prefix="/stations", tags=["stations"])
routes_router = APIRouter(prefix="/routes", tags=["routes"])


@stations_router.get("", response_model=List[StationOut])
async def list_stations(db: AsyncSession = Depends(get_async_db)):
    result = await db.execute(select(Station))
    return result.scalars().all()


@stations_router.get("/{station_id}", response_model=StationOut)
async def get_station(station_id: int, db: AsyncSession = Depends(get_async_db)):
    q = await db.execute(select(Station).where(Station.id == station_id))
    station = q.scalar_one_or_none()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    return station


@routes_router.get("", response_model=List[RouteOut])
async def list_routes(db: AsyncSession = Depends(get_async_db)):
    q = await db.execute(
        select(Route).options(
            selectinload(Route.sections).selectinload(RouteSection.from_station),
            selectinload(Route.sections).selectinload(RouteSection.to_station),
            selectinload(Route.origin_station),
            selectinload(Route.destination_station),
        )
    )
    return q.scalars().all()


@routes_router.get("/{route_id}", response_model=RouteOut)
async def get_route(route_id: int, db: AsyncSession = Depends(get_async_db)):
    q = await db.execute(
        select(Route)
        .where(Route.id == route_id)
        .options(
            selectinload(Route.sections).selectinload(RouteSection.from_station),
            selectinload(Route.sections).selectinload(RouteSection.to_station),
            selectinload(Route.origin_station),
            selectinload(Route.destination_station),
        )
    )
    route = q.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=404, detail="Route not found")
    return route
