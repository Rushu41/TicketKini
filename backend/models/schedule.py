from pydantic import BaseModel, Field, field_validator
from typing import Optional
from datetime import time, datetime
from decimal import Decimal

class ScheduleBase(BaseModel):
    vehicle_id: int
    source_id: int
    destination_id: int
    departure_time: time
    arrival_time: time
    duration: str = Field(..., pattern=r"^\d+h \d+m$")
    base_price: Decimal = Field(default=Decimal("500.00"), ge=50, le=50000)
    frequency: Optional[str] = "daily"

class ScheduleCreate(ScheduleBase):
    is_active: Optional[bool] = True

class ScheduleOut(ScheduleBase):
    id: int
    is_active: bool
    created_at: str
    updated_at: Optional[str] = None

    @field_validator('created_at', mode='before')
    @classmethod
    def validate_created_at(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    @field_validator('updated_at', mode='before')
    @classmethod
    def validate_updated_at(cls, v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    @field_validator('base_price', mode='before')
    @classmethod
    def validate_base_price(cls, v):
        if isinstance(v, (int, float)):
            return Decimal(str(v))
        return v

    class Config:
        from_attributes = True
        json_encoders = {
            time: lambda v: v.isoformat(),
            Decimal: lambda v: float(v)
        }

class ScheduleUpdate(BaseModel):
    vehicle_id: Optional[int] = None
    source_id: Optional[int] = None
    destination_id: Optional[int] = None
    departure_time: Optional[time] = None
    arrival_time: Optional[time] = None
    duration: Optional[str] = None
    base_price: Optional[Decimal] = None
    frequency: Optional[str] = None
    is_active: Optional[bool] = None