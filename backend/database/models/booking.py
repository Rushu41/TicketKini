from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, JSON, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.database.database import Base
import enum

class BookingStatusEnum(enum.Enum):
    CART = "CART"           # Items in cart, not blocking seats
    PENDING = "PENDING"     # Payment initiated, seats temporarily blocked
    CONFIRMED = "CONFIRMED" # Payment successful, seats booked
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"     # Auto-expired bookings
    COMPLETED = "COMPLETED"

class SeatClassEnum(enum.Enum):
    ECONOMY = "economy"
    BUSINESS = "business"
    FIRST_CLASS = "first_class"
    AC = "ac"
    NON_AC = "non_ac"
    SLEEPER = "sleeper"
    SHOVON = "shovon"  # Added for train compatibility

class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    transport_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    schedule_id = Column(Integer, ForeignKey("schedules.id"), nullable=True)  # Made nullable since init script doesn't use it
    
    # Seat information stored as JSON array [1, 2, 15, 23]
    seats = Column(JSON, nullable=False)
    seat_class = Column(String(50), nullable=False, default="economy")  # Changed to String to match init script
    
    # Passenger details stored as JSON array of objects
    passenger_details = Column(JSON, nullable=True)
    
    total_price = Column(Numeric(10, 2), nullable=False)
    status = Column(String(20), nullable=False, default="PENDING")  # Changed to String to match init script
    
    # PNR (Passenger Name Record) - generated after payment confirmation
    pnr = Column(String(10), unique=True, nullable=True)
    
    # Booking and travel dates - Added these fields
    booking_date = Column(DateTime, nullable=True)
    travel_date = Column(DateTime, nullable=True)
    
    # Booking expiry (15 minutes from creation for PENDING bookings)
    expires_at = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="bookings")
    vehicle = relationship("Vehicle", back_populates="bookings")
    schedule = relationship("Schedule", back_populates="bookings")
    payment = relationship("Payment", back_populates="booking", uselist=False)

    @property
    def seat_count(self):
        """Return number of seats booked"""
        return len(self.seats) if self.seats else 0

    @property
    def is_expired(self):
        """Check if booking has expired"""
        if self.status != "PENDING" or not self.expires_at:
            return False
        from datetime import datetime
        return datetime.utcnow() > self.expires_at

    def __repr__(self):
        return f"<Booking(id={self.id}, pnr='{self.pnr}', status='{self.status}')>"