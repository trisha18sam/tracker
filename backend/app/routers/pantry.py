"""
Pantry & E-Catering Router.

Provides GET /pantry/menu (with official IRCTC statutory tariffs & dynamic availability)
and POST /pantry/order (prototype onboard delivery ordering).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_db
from app.models_pantry import PantryOrder
from app.providers.database_provider import DatabaseRailwayProvider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pantry", tags=["pantry"])


class OrderItemIn(BaseModel):
    item_id: str
    name: str
    quantity: int = Field(ge=1, le=10)
    price: float


class PantryOrderIn(BaseModel):
    session_token: str
    passenger_name: str = "Passenger"
    train_number: str
    delivery_station_code: str
    coach_code: str
    seat_number: int
    items: List[OrderItemIn]


@router.get("/menu")
async def get_pantry_menu(
    train_number: Optional[str] = None,
    station_code: Optional[str] = None,
    db: AsyncSession = Depends(get_async_db),
):
    """
    Fetch categorized menu with statutory IRCTC fixed tariffs
    (e.g., Rail Neer ₹15, Standard Meal ₹80) clearly distinguished from vendor specials.
    """
    provider = DatabaseRailwayProvider(db)
    return await provider.get_pantry_menu(train_number=train_number, station_code=station_code)


@router.post("/order")
async def create_pantry_order(
    payload: PantryOrderIn,
    db: AsyncSession = Depends(get_async_db),
):
    """
    Place prototype seat delivery order.
    Transparently labels order as simulation/prototype without fake payment claims.
    """
    if not payload.items:
        raise HTTPException(status_code=400, detail="Order must contain at least one item")

    total = sum(item.price * item.quantity for item in payload.items)

    order = PantryOrder(
        session_token=payload.session_token,
        passenger_name=payload.passenger_name,
        train_number=payload.train_number,
        delivery_station_code=payload.delivery_station_code,
        coach_code=payload.coach_code,
        seat_number=payload.seat_number,
        items_json=[item.model_dump() for item in payload.items],
        total_amount=total,
        status="PROTOTYPE_PLACED",
        is_prototype_order=True,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    return {
        "order_id": order.id,
        "status": "CONFIRMED_DEMO",
        "delivery_location": f"Coach {order.coach_code} · Berth/Seat {order.seat_number}",
        "delivery_station": order.delivery_station_code,
        "total_amount": order.total_amount,
        "items_count": len(order.items_json),
        "created_at": order.created_at.isoformat(),
        "is_simulated": True,
        "notice": "Prototype Order Placed — For demonstration purposes only. Payment gateway integration simulated.",
    }
