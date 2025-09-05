from enum import Enum
from datetime import time, date, datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class SeatClass(str, Enum):
    """Available seat classes for vehicles"""
    ECONOMY = "ECONOMY"
    BUSINESS = "BUSINESS"
    FIRST = "FIRST"
    PREMIUM_ECONOMY = "PREMIUM_ECONOMY"
    SLEEPER = "SLEEPER"
    SEATER = "SEATER"

class TripResult(BaseModel):
    """Represents a single trip result from search"""
    id: int
    vehicle_id: int
    vehicle_number: str
    vehicle_type: str
    operator_name: str
    operator_id: int
    source_name: str
    destination_name: str
    departure_time: time
    arrival_time: time
    duration: str
    travel_date: date
    class_prices: Dict[str, float]
    available_seats: Dict[str, Any]
    total_seats: int
    amenities: List[str]
    rating: float = Field(..., ge=0, le=5)
    total_reviews: int = Field(..., ge=0)

    class Config:
        json_encoders = {
            time: lambda v: v.strftime("%H:%M"),
            datetime: lambda v: v.isoformat(),
        }

class SearchRequest(BaseModel):
    """Request model for search parameters"""
    source: str
    destination: str
    travel_date: date
    vehicle_type: Optional[str] = None
    seat_class: Optional[SeatClass] = None
    operator_id: Optional[int] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    departure_time_start: Optional[str] = None
    departure_time_end: Optional[str] = None
    sort_by: str = "departure_time"
    sort_order: str = "asc"
    page: int = 1
    limit: int = 20

class SearchResponse(BaseModel):
    """Response model for search results"""
    trips: List[TripResult]
    total_count: int
    page: int
    limit: int
    has_next: bool
    has_previous: bool
    search_params: Dict[str, Any]

    class Config:
        json_encoders = {
            date: lambda v: v.isoformat(),
        }

class LocationResult(BaseModel):
    """Model for location search results"""
    id: int
    name: str
    code: str
    city: str
    full_name: str

class OperatorResult(BaseModel):
    """Model for operator search results"""
    id: int
    name: str
    rating: float
    total_vehicles: int

class PopularRoute(BaseModel):
    """Model for popular route results"""
    source: Dict[str, Any]
    destination: Dict[str, Any]
    booking_count: int
    avg_price: float
    min_duration_hours: float

class SearchFilters(BaseModel):
    """Model for available search filters"""
    vehicle_types: List[str]
    operators: List[Dict[str, Any]]
    seat_classes: List[str]
    price_range: Dict[str, float]
    departure_times: List[Dict[str, str]]

# Additional models for advanced search
class SearchFiltersModel(BaseModel):
    """Advanced search filters model"""
    vehicle_types: Optional[List[str]] = None
    operators: Optional[List[int]] = None
    seat_classes: Optional[List[SeatClass]] = None
    amenities: Optional[List[str]] = None
    departure_time_ranges: Optional[List[str]] = None
    price_range: Optional[Dict[str, float]] = None
    rating_min: Optional[float] = Field(None, ge=0, le=5)
    sort_preferences: Optional[Dict[str, str]] = None

class SearchResponseModel(BaseModel):
    """Comprehensive search response model"""
    results: List[TripResult]
    total_count: int
    filters_applied: Dict[str, Any]
    suggestions: List[Dict[str, Any]]
    popular_routes: List[Dict[str, Any]]
    price_trends: Optional[Dict[str, Any]] = None
    search_metadata: Dict[str, Any]
    
    class Config:
        json_encoders = {
            date: lambda v: v.isoformat(),
            datetime: lambda v: v.isoformat(),
        }

# Alias for backward compatibility
SearchFilters = SearchFiltersModel