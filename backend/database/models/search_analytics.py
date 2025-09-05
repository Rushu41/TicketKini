from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float, Text, ForeignKey, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.database.database import Base

class SearchLog(Base):
    """Track user search patterns for AI recommendations"""
    __tablename__ = "search_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Can be null for anonymous
    session_id = Column(String(100), nullable=False, index=True)  # Track anonymous sessions
    
    # Search parameters
    from_location = Column(String(100), nullable=False, index=True)
    to_location = Column(String(100), nullable=False, index=True)
    travel_date = Column(DateTime, nullable=False, index=True)
    transport_type = Column(String(20), nullable=True)
    passenger_count = Column(Integer, default=1)
    
    # Advanced filters used
    filters_applied = Column(JSON, nullable=True)  # Store filter preferences
    
    # Search context
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    search_timestamp = Column(DateTime, server_default=func.now(), index=True)
    
    # Results
    results_count = Column(Integer, default=0)
    clicked_result_id = Column(Integer, nullable=True)  # Which result was clicked
    booking_made = Column(Boolean, default=False)
    
    # Relationships
    user = relationship("User", back_populates="search_logs")

class PopularRoute(Base):
    """Track popular routes for trending analysis"""
    __tablename__ = "popular_routes"

    id = Column(Integer, primary_key=True, index=True)
    from_location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    to_location_id = Column(Integer, ForeignKey("locations.id"), nullable=False)
    
    # Statistics
    search_count = Column(Integer, default=0)
    booking_count = Column(Integer, default=0)
    total_revenue = Column(Float, default=0.0)
    
    # Trends
    weekly_searches = Column(Integer, default=0)
    monthly_searches = Column(Integer, default=0)
    growth_rate = Column(Float, default=0.0)  # Percentage growth
    
    # Popular times
    peak_days = Column(JSON, nullable=True)  # ["Friday", "Sunday"]
    peak_hours = Column(JSON, nullable=True)  # ["08:00", "18:00"]
    
    # Pricing insights
    average_price = Column(Float, default=0.0)
    price_trend = Column(String(20), default="stable")  # "increasing", "decreasing", "stable"
    
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    from_location = relationship("Location", foreign_keys=[from_location_id])
    to_location = relationship("Location", foreign_keys=[to_location_id])

class PriceHistory(Base):
    """Track price changes for dynamic pricing"""
    __tablename__ = "price_history"

    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("schedules.id"), nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    
    # Price data
    price = Column(Float, nullable=False)
    seat_class = Column(String(20), nullable=False, default="economy")
    
    # Pricing factors
    demand_factor = Column(Float, default=1.0)
    time_factor = Column(Float, default=1.0)  # Days before departure
    seasonal_factor = Column(Float, default=1.0)
    special_event_factor = Column(Float, default=1.0)
    
    # Availability context
    available_seats = Column(Integer, nullable=False)
    total_seats = Column(Integer, nullable=False)
    occupancy_rate = Column(Float, nullable=False)  # available/total
    
    # Timestamp
    recorded_at = Column(DateTime, server_default=func.now(), index=True)
    
    # Relationships
    schedule = relationship("Schedule")
    vehicle = relationship("Vehicle", back_populates="price_history")

class UserPreference(Base):
    """Store user preferences for personalized recommendations"""
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    
    # Travel preferences
    preferred_transport_types = Column(JSON, nullable=True)  # ["BUS", "TRAIN"]
    preferred_departure_times = Column(JSON, nullable=True)  # ["morning", "evening"]
    preferred_seat_class = Column(String(20), nullable=True)
    
    # Budget preferences
    budget_range_min = Column(Float, nullable=True)
    budget_range_max = Column(Float, nullable=True)
    price_sensitivity = Column(String(20), default="medium")  # "low", "medium", "high"
    
    # Comfort preferences
    preferred_amenities = Column(JSON, nullable=True)  # ["wifi", "ac", "charging"]
    accessibility_needs = Column(JSON, nullable=True)
    
    # Booking behavior
    advance_booking_days = Column(Integer, default=7)  # Average days in advance
    flexibility_preference = Column(Boolean, default=False)  # Flexible dates
    
    # Notification preferences
    price_alert_enabled = Column(Boolean, default=True)
    booking_reminders = Column(Boolean, default=True)
    promotional_notifications = Column(Boolean, default=False)
    
    # Location preferences
    home_location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    work_location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    frequent_destinations = Column(JSON, nullable=True)  # List of location IDs
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="preferences")
    home_location = relationship("Location", foreign_keys=[home_location_id])
    work_location = relationship("Location", foreign_keys=[work_location_id])

class TravelSuggestion(Base):
    """AI-generated travel suggestions"""
    __tablename__ = "travel_suggestions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Suggestion details
    suggestion_type = Column(String(50), nullable=False)  # "popular_destination", "price_drop", "flexible_date"
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    
    # Target route/destination
    from_location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    to_location_id = Column(Integer, ForeignKey("locations.id"), nullable=True)
    suggested_date = Column(DateTime, nullable=True)
    
    # Suggestion metadata
    confidence_score = Column(Float, default=0.0)  # AI confidence in suggestion
    priority = Column(Integer, default=1)  # Display priority
    
    # Interaction tracking
    shown_count = Column(Integer, default=0)
    clicked_count = Column(Integer, default=0)
    booking_conversion = Column(Boolean, default=False)
    
    # Lifecycle
    is_active = Column(Boolean, default=True)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    user = relationship("User")
    from_location = relationship("Location", foreign_keys=[from_location_id])
    to_location = relationship("Location", foreign_keys=[to_location_id])
