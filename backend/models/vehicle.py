from pydantic import BaseModel, Field, validator
from typing import List, Dict, Optional
from datetime import datetime, time
from enum import Enum

class VehicleType(str, Enum):
    BUS = "BUS"
    TRAIN = "TRAIN"
    PLANE = "PLANE"

class VehicleStatus(str, Enum):
    ACTIVE = "ACTIVE"
    MAINTENANCE = "MAINTENANCE"
    INACTIVE = "INACTIVE"

class SeatMapRow(BaseModel):
    row_number: int
    seats: List[int]  # List of seat numbers in this row
    class_type: str = "ECONOMY"

class ClassPricing(BaseModel):
    class_name: str
    base_price: float = Field(..., ge=0)

# Helper functions for seat map conversion
def convert_1d_to_2d_seat_map(seat_classes: Dict[str, List[int]], total_seats: int, layout: str = "2-2") -> List[List[int]]:
    """Convert 1D seat arrays from database to 2D array for frontend"""
    # Flatten all seats from all classes
    all_seats = []
    for seats in seat_classes.values():
        all_seats.extend(seats)
    
    # Sort seats to ensure proper order
    all_seats.sort()
    
    # Determine seats per row based on layout
    seats_per_row = {
        "2-2": 4,
        "2-1": 3,
        "3-3": 6,
        "2-3-2": 7,
        "compartment": 4
    }.get(layout, 4)  # Default to 4 if layout not found
    
    # Create 2D array
    seat_map_2d = []
    for i in range(0, len(all_seats), seats_per_row):
        row = all_seats[i:i + seats_per_row]
        if row:  # Only add non-empty rows
            seat_map_2d.append(row)
    
    return seat_map_2d

def convert_2d_to_1d_seat_map(seat_map_2d: List[List[int]], class_prices: List[ClassPricing]) -> Dict:
    """Convert 2D seat array from frontend to database format.
    If class_prices is empty or None, default all seats to ECONOMY.
    """
    # Flatten 2D array
    all_seats: List[int] = []
    for row in seat_map_2d:
        # Coerce to int and filter invalids
        for n in row:
            try:
                all_seats.append(int(n))
            except Exception:
                continue

    all_seats = sorted(set(all_seats))  # Ensure order and uniqueness
    total_seats = len(all_seats)

    # Default: all seats are ECONOMY when no class prices are provided
    if not class_prices:
        return {
            "total_seats": total_seats,
            "layout": "2-2",
            "classes": {"ECONOMY": all_seats},
        }

    # Distribute seats among classes based on proportions (simple even split)
    classes: Dict[str, List[int]] = {}
    seat_index = 0
    seats_per_class = total_seats // max(1, len(class_prices))

    for i, class_info in enumerate(class_prices):
        class_name = class_info.class_name
        if i < len(class_prices) - 1:
            end_index = min(seat_index + seats_per_class, total_seats)
        else:
            # Last class gets the remainder
            end_index = total_seats
        classes[class_name] = all_seats[seat_index:end_index]
        seat_index = end_index

    return {
        "total_seats": total_seats,
        "layout": "2-2",  # Default layout
        "classes": classes,
    }

def convert_class_prices_to_dict(class_prices: List[ClassPricing]) -> Dict[str, float]:
    """Convert class pricing array to dictionary for database"""
    return {cp.class_name: cp.base_price for cp in class_prices}

def convert_class_prices_from_dict(class_prices_dict: Dict[str, float]) -> List[ClassPricing]:
    """Convert class pricing dictionary from database to array"""
    return [
        ClassPricing(class_name=class_name, base_price=price)
        for class_name, price in class_prices_dict.items()
    ]

class VehicleBase(BaseModel):
    vehicle_number: str = Field(..., min_length=3, max_length=20)
    vehicle_name: str = Field(..., min_length=1, max_length=100)
    vehicle_type: VehicleType
    operator_id: int
    total_seats: int = Field(..., ge=1, le=500)
    seat_map: List[List[int]] = Field(..., description="2D array representing seat layout")
    class_prices: Optional[List[ClassPricing]] = Field(None, description="Class pricing (DEPRECATED - now using schedule-level pricing)")
    facilities: List[str] = Field(default_factory=list)
    status: VehicleStatus = VehicleStatus.ACTIVE

    @validator('vehicle_type', pre=True)
    @classmethod
    def normalize_vehicle_type(cls, v):
        """Accept flexible vehicle_type inputs (e.g., 'bus', 'microbus', 'air', etc.) and normalize to enum."""
        if isinstance(v, VehicleType):
            return v
        if isinstance(v, str):
            t = v.strip().lower()
            if t in {"bus", "microbus", "car", "coach", "launch"}:
                return VehicleType.BUS
            if t == "train":
                return VehicleType.TRAIN
            if t in {"plane", "air", "aircraft"}:
                return VehicleType.PLANE
            # Default to BUS if unknown
            return VehicleType.BUS
        return v

    @validator('class_prices', pre=True)
    @classmethod
    def normalize_class_prices(cls, v):
        """Allow class_prices as dict or array and coerce to a list of ClassPricing. Returns None if not provided."""
        if v is None:
            return None  # Allow None values now that pricing is schedule-based
        if isinstance(v, dict):
            return [ClassPricing(class_name=str(k), base_price=float(v[k])) for k in v]
        if isinstance(v, list):
            # Coerce list entries into ClassPricing
            norm = []
            for item in v:
                if isinstance(item, ClassPricing):
                    norm.append(item)
                elif isinstance(item, dict):
                    cn = str(item.get('class_name') or item.get('name') or 'ECONOMY')
                    bp_raw = item.get('base_price') if 'base_price' in item else item.get('price')
                    try:
                        bp = float(bp_raw)
                    except Exception:
                        bp = 0.0
                    norm.append(ClassPricing(class_name=cn, base_price=bp))
            return norm if norm else None
        # Return None for any other type
        return None

    @validator('seat_map', pre=True)
    @classmethod
    def validate_seat_map(cls, v, values):
        """Ensure seat_map is present and matches total_seats; rebuild if mismatched to avoid 422."""
        # If payload omitted seat_map or sent non-list, build a default 2-2 map
        def build_map(total: int) -> List[List[int]]:
            rows: List[List[int]] = []
            if total and isinstance(total, int) and total > 0:
                i = 1
                while i <= total:
                    row = [i, i+1, i+2, i+3]
                    row = [n for n in row if n <= total]
                    rows.append(row)
                    i += 4
            return rows

        total_seats = values.get('total_seats')
        if not isinstance(v, list) or not v:
            return build_map(total_seats)

        # Coerce inner values to ints and drop invalids
        cleaned: List[List[int]] = []
        for row in v:
            if isinstance(row, list):
                nums = []
                for n in row:
                    try:
                        n_int = int(n)
                        nums.append(n_int)
                    except Exception:
                        continue
                if nums:
                    cleaned.append(nums)

        if not cleaned:
            return build_map(total_seats)

        # Check count and rebuild if mismatch
        total_in_map = sum(len(row) for row in cleaned)
        if isinstance(total_seats, int) and total_seats > 0 and total_in_map != total_seats:
            return build_map(total_seats)
        return cleaned

    @validator('vehicle_number')
    @classmethod
    def validate_vehicle_number(cls, v):
        if not v.strip():
            raise ValueError('Vehicle number cannot be empty')
        return v.strip().upper()

class VehicleCreate(VehicleBase):
    pass

class VehicleOut(VehicleBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    # Operator details (joined)
    operator_info: Optional[dict] = None

    class Config:
        from_attributes = True

class VehicleUpdate(BaseModel):
    vehicle_number: Optional[str] = Field(None, min_length=3, max_length=20)
    vehicle_name: Optional[str] = Field(None, min_length=1, max_length=100)
    total_seats: Optional[int] = Field(None, ge=1, le=500)
    seat_map: Optional[List[List[int]]] = None
    class_prices: Optional[List[ClassPricing]] = None
    facilities: Optional[List[str]] = None
    status: Optional[VehicleStatus] = None

    @validator('vehicle_number')
    @classmethod
    def validate_vehicle_number(cls, v):
        if v is not None and not v.strip():
            raise ValueError('Vehicle number cannot be empty')
        return v.strip().upper() if v else v

# Schedule Models
class ScheduleBase(BaseModel):
    vehicle_id: int
    source_id: int
    destination_id: int
    departure_time: time
    arrival_time: time
    duration: str = Field(..., min_length=1)
    frequency: str = Field(default="daily")
    is_active: bool = True

    @validator('arrival_time')
    @classmethod
    def validate_arrival_after_departure(cls, v, values):
        
        if 'departure_time' in values:
            # Handle next day arrivals
            dep_minutes = values['departure_time'].hour * 60 + values['departure_time'].minute
            arr_minutes = v.hour * 60 + v.minute
            
            # If arrival is earlier than departure, assume next day
            if arr_minutes < dep_minutes:
                # This is valid for overnight journeys
                pass
            
        return v

class ScheduleCreate(ScheduleBase):
    pass

class ScheduleOut(ScheduleBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    # Related data (joined)
    vehicle_info: Optional[dict] = None
    source_info: Optional[dict] = None
    destination_info: Optional[dict] = None
    available_seats: Optional[int] = None

    class Config:
        from_attributes = True

class ScheduleUpdate(BaseModel):
    departure_time: Optional[time] = None
    arrival_time: Optional[time] = None
    duration: Optional[str] = None
    frequency: Optional[str] = None
    is_active: Optional[bool] = None