from sqlalchemy import Column, Integer, String, DateTime, Time, ForeignKey, Text, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.database.database import Base  # Correctly import the shared Base
from datetime import datetime, time


class Schedule(Base):
    __tablename__ = "schedules"
    
    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    source_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    destination_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    departure_time = Column(Time, nullable=False)
    arrival_time = Column(Time, nullable=False)
    duration = Column(String(10), nullable=False)  # Format: "2h 30m"
    base_price = Column(Numeric(10, 2), nullable=False, default=500.00)  # Base ticket price
    frequency = Column(String(50), default="daily")  # daily, weekly, etc.
    is_active = Column(Integer, default=1)  # 1 for active, 0 for inactive
    created_at = Column(DateTime, server_default=func.now())  # Changed to server_default
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())  # Changed to server_default
    
    # Relationships
    vehicle = relationship("Vehicle", back_populates="schedules")
    source = relationship("Location", foreign_keys=[source_id], back_populates="departure_schedules")
    destination = relationship("Location", foreign_keys=[destination_id], back_populates="arrival_schedules")
    bookings = relationship("Booking", back_populates="schedule") # 
    
    def __repr__(self):
        return f"<Schedule(id={self.id}, vehicle_id={self.vehicle_id}, {self.source.name} → {self.destination.name})>"
    
    @property
    def route_name(self):
        """Return formatted route name"""
        return f"{self.source.name} to {self.destination.name}"
    
    def calculate_duration(self):
        """Calculate duration between departure and arrival times"""
        from datetime import datetime, timedelta
        
        # Convert times to datetime for calculation
        today = datetime.today().date()
        dep_datetime = datetime.combine(today, self.departure_time)
        arr_datetime = datetime.combine(today, self.arrival_time)
        
        # Handle overnight journeys
        if arr_datetime < dep_datetime:
            arr_datetime += timedelta(days=1)
        
        duration = arr_datetime - dep_datetime
        hours, remainder = divmod(duration.total_seconds(), 3600)
        minutes, _ = divmod(remainder, 60)
        
        return f"{int(hours)}h {int(minutes)}m"