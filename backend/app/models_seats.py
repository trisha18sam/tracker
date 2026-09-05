"""
SQLAlchemy ORM models for the Last-Minute Seat Finder system.

Supports segment-aware seat occupancy, coach layouts, berth types,
predicted deboarding vacancies, and passenger watch alerts.
"""
from __future__ import annotations

import enum
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.models_base import Base, BigIntPK


class CoachClass(str, enum.Enum):
    FIRST_AC = "1A"
    SECOND_AC = "2A"
    THIRD_AC = "3A"
    THIRD_AC_ECONOMY = "3E"
    CHAIR_CAR = "CC"
    EXECUTIVE_CC = "EC"
    SLEEPER = "SL"
    SECOND_SITTING = "2S"


class BerthType(str, enum.Enum):
    LOWER = "LOWER"
    MIDDLE = "MIDDLE"
    UPPER = "UPPER"
    SIDE_LOWER = "SIDE_LOWER"
    SIDE_UPPER = "SIDE_UPPER"
    WINDOW = "WINDOW"
    AISLE = "AISLE"
    CABIN = "CABIN"


class OccupancyStatus(str, enum.Enum):
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"
    NO_SHOW = "NO_SHOW"
    DEBOARDED = "DEBOARDED"
    VACATING_SOON = "VACATING_SOON"


class SeatEventType(str, enum.Enum):
    CANCELLATION = "CANCELLATION"
    NO_SHOW = "NO_SHOW"
    DEBOARDED = "DEBOARDED"
    TATKAL_RELEASE = "TATKAL_RELEASE"
    CHART_PREPARATION = "CHART_PREPARATION"


class Coach(Base):
    """A physical coach in a train composition (e.g. B1, B2, A1, S1)."""
    __tablename__ = "coaches"
    __table_args__ = (
        UniqueConstraint("train_id", "coach_code", name="uq_train_coach_code"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    train_id = Column(Integer, ForeignKey("trains.id"), nullable=False, index=True)
    coach_code = Column(String(10), nullable=False)   # e.g. "B1", "B2", "A1", "S1"
    coach_class = Column(Enum(CoachClass), nullable=False, default=CoachClass.THIRD_AC)
    sequence_in_rake = Column(Integer, default=1)     # Position in train rake
    total_seats = Column(Integer, nullable=False, default=64)
    layout_type = Column(String(30), default="STANDARD_LHB_8BAY")  # layout descriptor
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    train = relationship("Train", back_populates="coaches")
    seats = relationship("Seat", back_populates="coach", order_by="Seat.seat_number", cascade="all, delete-orphan")


class Seat(Base):
    """An individual seat/berth inside a coach."""
    __tablename__ = "seats"
    __table_args__ = (
        UniqueConstraint("coach_id", "seat_number", name="uq_coach_seat_number"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    coach_id = Column(Integer, ForeignKey("coaches.id"), nullable=False, index=True)
    seat_number = Column(Integer, nullable=False)     # 1 .. 64 / 72
    berth_type = Column(Enum(BerthType), nullable=False, default=BerthType.LOWER)
    bay_number = Column(Integer, default=1)           # Coupe / Bay number 1..9
    is_window = Column(Boolean, default=False)
    is_emergency_quota = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    coach = relationship("Coach", back_populates="seats")
    occupancies = relationship("SeatOccupancy", back_populates="seat", cascade="all, delete-orphan")


class SeatOccupancy(Base):
    """
    Segment-specific occupancy record for a seat during a specific train run.

    Crucial: A seat may have multiple occupancies during a single run if different
    passengers travel on non-overlapping segments (e.g. Passenger 1: NDLS->JP, Passenger 2: JP->ADI).
    """
    __tablename__ = "seat_occupancies"

    id = Column(BigIntPK, primary_key=True, autoincrement=True)
    seat_id = Column(Integer, ForeignKey("seats.id"), nullable=False, index=True)
    train_run_id = Column(Integer, ForeignKey("train_runs.id"), nullable=False, index=True)

    # Journey segment bounds for this booking
    from_station_id = Column(Integer, ForeignKey("stations.id"), nullable=False)
    to_station_id = Column(Integer, ForeignKey("stations.id"), nullable=False)

    status = Column(Enum(OccupancyStatus), nullable=False, default=OccupancyStatus.CONFIRMED)
    passenger_masked_pnr = Column(String(20), default="PNR-DEMO")
    
    # Deboarding milestone tracking
    scheduled_deboard_station_id = Column(Integer, ForeignKey("stations.id"), nullable=True)
    actual_deboard_station_id = Column(Integer, ForeignKey("stations.id"), nullable=True)

    # Cancellation audit tracking
    cancelled_at = Column(DateTime, nullable=True)
    cancellation_reason = Column(String(100), nullable=True)
    is_no_show = Column(Boolean, default=False)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    seat = relationship("Seat", back_populates="occupancies")
    train_run = relationship("TrainRun", back_populates="seat_occupancies")
    from_station = relationship("Station", foreign_keys=[from_station_id])
    to_station = relationship("Station", foreign_keys=[to_station_id])
    scheduled_deboard_station = relationship("Station", foreign_keys=[scheduled_deboard_station_id])


class SeatWatch(Base):
    """Passenger subscription to receive alerts when a seat becomes available on a segment."""
    __tablename__ = "seat_watches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_token = Column(String(64), nullable=False, index=True)
    train_id = Column(Integer, ForeignKey("trains.id"), nullable=False)
    from_station_id = Column(Integer, ForeignKey("stations.id"), nullable=False)
    to_station_id = Column(Integer, ForeignKey("stations.id"), nullable=False)
    travel_date = Column(Date, nullable=False)
    
    preferred_class = Column(String(10), nullable=True)
    preferred_berth = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    last_notified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    train = relationship("Train")
    from_station = relationship("Station", foreign_keys=[from_station_id])
    to_station = relationship("Station", foreign_keys=[to_station_id])


class SeatAvailabilityEvent(Base):
    """Real-time log of dynamic inventory changes (cancellations, no-shows, deboardings)."""
    __tablename__ = "seat_availability_events"

    id = Column(BigIntPK, primary_key=True, autoincrement=True)
    train_run_id = Column(Integer, ForeignKey("train_runs.id"), nullable=False, index=True)
    seat_id = Column(Integer, ForeignKey("seats.id"), nullable=False)
    event_type = Column(Enum(SeatEventType), nullable=False)
    station_id = Column(Integer, ForeignKey("stations.id"), nullable=True)
    details = Column(String(255), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    train_run = relationship("TrainRun")
    seat = relationship("Seat")
    station = relationship("Station")
