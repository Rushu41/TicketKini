
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Literal
from datetime import datetime
from enum import Enum

class BookingStatus(str, Enum):
    CART = "CART"           # Items in cart, not blocking seats
    PENDING = "PENDING"     # Payment initiated, seats temporarily blocked
    CONFIRMED = "CONFIRMED" # Payment successful, seats booked
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"

class SeatClass(str, Enum):
    ECONOMY = "ECONOMY"
    BUSINESS = "BUSINESS"
    FIRST = "FIRST"
    AC = "AC"
    NON_AC = "NON_AC"
    SLEEPER = "SLEEPER"
    CHAIR = "CHAIR"
    
    # Also allow lowercase variants
    economy = "economy"
    business = "business"
    first = "first"
    ac = "ac"
    non_ac = "non_ac"
    sleeper = "sleeper"
    chair = "chair"

class PassengerDetails(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    age: int = Field(..., ge=1, le=120)
    gender: Literal["Male", "Female", "Other"]
    seat_number: int = Field(..., ge=1)
    phone: Optional[str] = Field(None, max_length=15)
    id_type: Optional[Literal["NID", "Passport", "Driving License"]] = None
    id_number: Optional[str] = Field(None, max_length=50)

    @validator('name')
    @classmethod
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError('Passenger name cannot be empty')
        return v.strip().title()

class BookingBase(BaseModel):
    schedule_id: int = Field(..., description="ID of the schedule/trip")
    seats: List[int] = Field(..., min_items=1, max_items=6, description="List of seat numbers")
    # Default seat class to ECONOMY if not provided
    seat_class: str = Field("ECONOMY", description="Seat class")
    passenger_details: List[PassengerDetails] = Field(..., min_items=1, max_items=6)

    @validator('passenger_details')
    @classmethod
    def validate_passengers_match_seats(cls, v, values):
        if 'seats' in values and len(v) != len(values['seats']):
            raise ValueError('Number of passengers must match number of seats')
        return v

    @validator('seats')
    @classmethod
    def validate_unique_seats(cls, v):
        if len(v) != len(set(v)):
            raise ValueError('Duplicate seats are not allowed')
        return v

    @validator('seat_class', pre=True, always=True)
    @classmethod
    def normalize_seat_class(cls, v):
        """Normalize seat class to uppercase and default to ECONOMY when empty/None."""
        if v is None or (isinstance(v, str) and not v.strip()):
            return 'ECONOMY'
        return str(v).strip().upper()

class BookingCreate(BookingBase):
    travel_date: str = Field(..., description="Travel date in YYYY-MM-DD format")
    
    @validator('travel_date')
    @classmethod
    def validate_travel_date(cls, v):
        try:
            travel_date = datetime.strptime(v, "%Y-%m-%d").date()
            current_date = datetime.now().date()
            
            # Allow booking for today and future dates
            if travel_date < current_date:
                raise ValueError(f'Travel date cannot be in the past. Today is {current_date.strftime("%Y-%m-%d")}. Please select today or a future date.')
            
            # Optional: Limit how far in advance bookings can be made (e.g., 1 year)
            max_advance_date = current_date.replace(year=current_date.year + 1)
            if travel_date > max_advance_date:
                raise ValueError(f'Bookings can only be made up to {max_advance_date.strftime("%Y-%m-%d")}')
            
            return v
        except ValueError as e:
            if 'past' in str(e) or 'advance' in str(e):
                raise e
            raise ValueError('Invalid date format. Use YYYY-MM-DD')

class BookingOut(BookingBase):
    id: int
    user_id: int
    pnr: Optional[str] = None
    total_price: float
    status: BookingStatus
    booking_date: datetime
    expiry_time: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Transport details (joined from schedule/vehicle)
    transport_info: Optional[dict] = None

    class Config:
        from_attributes = True

class BookingUpdate(BaseModel):
    status: Optional[BookingStatus] = None
    passenger_details: Optional[List[PassengerDetails]] = None

class BookingSearchFilters(BaseModel):
    user_id: Optional[int] = None
    status: Optional[BookingStatus] = None
    from_date: Optional[datetime] = None
    to_date: Optional[datetime] = None
    transport_type: Optional[str] = None
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)

class BookingSummary(BaseModel):
    total_bookings: int
    confirmed_bookings: int
    pending_bookings: int
    cancelled_bookings: int
    total_revenue: float
    today_bookings: int
    today_revenue: float