"""
Pantry and Catering data models.

Distinguishes official IRCTC Standard Menu statutory tariffs from vendor prices,
tracking dynamic availability and prototype ordering.
"""
from __future__ import annotations

import enum
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Enum, ForeignKey, JSON, Text, func
)
from sqlalchemy.orm import relationship
from app.models_base import Base


class PantryCategory(str, enum.Enum):
    BREAKFAST = "BREAKFAST"
    MEALS = "MEALS"
    SNACKS = "SNACKS"
    BEVERAGES = "BEVERAGES"
    SWEETS = "SWEETS"


class PantryDiet(str, enum.Enum):
    VEG = "VEG"
    NON_VEG = "NON_VEG"
    JAIN = "JAIN"
    EGG = "EGG"


class PantryItemAvailability(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    LIMITED = "LIMITED"
    UNAVAILABLE = "UNAVAILABLE"


class PantryPriceSource(str, enum.Enum):
    IRCTC_OFFICIAL_TARIFF = "IRCTC_OFFICIAL_TARIFF"  # Statutory price notified by Railway Board
    VENDOR_DEMO = "VENDOR_DEMO"                      # Simulated vendor pricing for demonstration
    LIVE_PARTNER = "LIVE_PARTNER"                    # Connected e-catering partner feed


class PantryVendor(Base):
    __tablename__ = "pantry_vendors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    vendor_type = Column(String(50), default="ONBOARD_PANTRY")  # ONBOARD_PANTRY, STATION_OUTLET, E_CATERING
    station_code = Column(String(10), nullable=True)            # e.g. "JP", "NDLS"
    train_number = Column(String(10), nullable=True)            # e.g. "12952"
    rating = Column(Float, default=4.2)
    fssai_license = Column(String(50), nullable=True)
    is_irctc_approved = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    items = relationship("PantryMenuItem", back_populates="vendor")


class PantryMenuItem(Base):
    __tablename__ = "pantry_menu_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vendor_id = Column(Integer, ForeignKey("pantry_vendors.id"), nullable=True)
    name = Column(String(120), nullable=False)
    category = Column(Enum(PantryCategory), nullable=False)
    diet = Column(Enum(PantryDiet), nullable=False, default=PantryDiet.VEG)
    price = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    calories = Column(String(50), nullable=True)
    image_icon = Column(String(50), default="🍱")
    availability = Column(Enum(PantryItemAvailability), default=PantryItemAvailability.AVAILABLE)
    stock_count = Column(Integer, default=50)
    price_source = Column(Enum(PantryPriceSource), default=PantryPriceSource.IRCTC_OFFICIAL_TARIFF)
    official_tariff_reference = Column(String(120), nullable=True)  # e.g. "Railway Board Commercial Circular 60/2019"
    last_updated = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("PantryVendor", back_populates="items")


class PantryOrder(Base):
    __tablename__ = "pantry_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_token = Column(String(100), nullable=False)
    passenger_name = Column(String(100), default="Passenger")
    train_number = Column(String(20), nullable=False)
    delivery_station_code = Column(String(20), nullable=False)
    coach_code = Column(String(10), nullable=False)
    seat_number = Column(Integer, nullable=False)
    items_json = Column(JSON, nullable=False)  # list of {item_id, name, qty, price, price_source}
    total_amount = Column(Float, nullable=False)
    status = Column(String(30), default="CONFIRMED_PROTOTYPE")
    is_prototype_order = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
