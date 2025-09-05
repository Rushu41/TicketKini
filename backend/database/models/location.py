from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float, Text, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.database.database import Base

class Location(Base):
    __tablename__ = "locations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    code = Column(String(10), unique=True, nullable=False, index=True)  # DHK, CTG, SYL etc.
    city = Column(String(50), nullable=False, index=True)
    state = Column(String(50), nullable=True)
    country = Column(String(50), default="Bangladesh")
    
    # Geographical coordinates for map features
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    
    # Location type categorization
    location_type = Column(String(20), nullable=False, default="city")  # city, airport, station, terminal
    
    # Additional metadata for autocomplete
    aliases = Column(Text, nullable=True)  # Alternative names, comma-separated
    popular_keywords = Column(Text, nullable=True)  # Search keywords
    
    # Administrative details
    timezone = Column(String(50), default="Asia/Dhaka")
    is_active = Column(Boolean, default=True)
    is_major_hub = Column(Boolean, default=False)  # For prioritizing in search
    
    # Distance from main hub for pricing calculations
    distance_from_hub = Column(Float, nullable=True, default=0.0)
    
    # Search and analytics data
    search_count = Column(Integer, default=0)
    booking_count = Column(Integer, default=0)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    departure_schedules = relationship("Schedule", foreign_keys="Schedule.source_id", back_populates="source")
    arrival_schedules = relationship("Schedule", foreign_keys="Schedule.destination_id", back_populates="destination")

    # Database indexes for performance
    __table_args__ = (
        Index('idx_location_search', 'name', 'code', 'city'),
        Index('idx_location_coords', 'latitude', 'longitude'),
        Index('idx_location_active', 'is_active', 'is_major_hub'),
    )

    def __repr__(self):
        return f"<Location(id={self.id}, name='{self.name}', code='{self.code}')>"

    @classmethod
    def get_popular_routes(cls, session, limit=10):
        """Get most popular routes based on booking frequency"""
        # This would be implemented with a complex query
        # joining schedules and bookings
        pass

    def distance_to(self, other_location):
        """Calculate distance to another location using Haversine formula"""
        if not (self.latitude and self.longitude and other_location.latitude and other_location.longitude):
            return None
        
        import math
        
        # Convert decimal degrees to radians
        lat1, lon1, lat2, lon2 = map(math.radians, [
            self.latitude, self.longitude, 
            other_location.latitude, other_location.longitude
        ])
        
        # Haversine formula
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.asin(math.sqrt(a))
        r = 6371  # Radius of earth in kilometers
        return c * r