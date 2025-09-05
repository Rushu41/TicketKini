
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime

class LocationBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    code: str = Field(..., min_length=2, max_length=10)
    city: str = Field(..., min_length=2, max_length=50)
    state: Optional[str] = Field(None, max_length=50)
    country: str = Field(default="Bangladesh", max_length=50)
    distance_from_hub: float = Field(0, ge=0, description="Distance in kilometers from main hub")
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    is_active: bool = True

    @validator('name')
    @classmethod
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError('Location name cannot be empty')
        return v.strip().title()

    @validator('code')
    @classmethod
    def validate_code(cls, v):
        if not v.strip():
            raise ValueError('Location code cannot be empty')
        # Code should be uppercase and alphanumeric
        code = v.strip().upper()
        if not code.replace('-', '').replace('_', '').isalnum():
            raise ValueError('Location code can only contain alphanumeric characters, hyphens, and underscores')
        return code

    @validator('city')
    @classmethod
    def validate_city(cls, v):
        if not v.strip():
            raise ValueError('City name cannot be empty')
        return v.strip().title()

class LocationCreate(LocationBase):
    pass

class LocationOut(LocationBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class LocationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    city: Optional[str] = Field(None, min_length=2, max_length=50)
    state: Optional[str] = Field(None, max_length=50)
    country: Optional[str] = Field(None, max_length=50)
    distance_from_hub: Optional[float] = Field(None, ge=0)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    is_active: Optional[bool] = None

    @validator('name')
    @classmethod
    def validate_name(cls, v):
        
        
        if v is not None and not v.strip():
            raise ValueError('Location name cannot be empty')
        return v.strip().title() if v else v

    @validator('city')
    @classmethod
    def validate_city(cls, v):
        if v is not None and not v.strip():
            raise ValueError('City name cannot be empty')
        return v.strip().title() if v else v

# Popular routes for quick search
class PopularRoute(BaseModel):
    source_name: str
    destination_name: str
    source_code: str
    destination_code: str
    avg_price: float
    avg_duration_hours: float
    frequency_per_day: int

class LocationWithRoutes(LocationOut):
    popular_destinations: List[PopularRoute] = []
    incoming_routes_count: int = 0
    outgoing_routes_count: int = 0