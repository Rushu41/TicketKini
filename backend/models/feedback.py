
from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime
from enum import Enum

class FeedbackType(str, Enum):
    GENERAL = "GENERAL"
    SERVICE = "SERVICE"
    VEHICLE = "VEHICLE"
    BOOKING = "BOOKING"
    PAYMENT = "PAYMENT"
    COMPLAINT = "COMPLAINT"
    SUGGESTION = "SUGGESTION"

class FeedbackStatus(str, Enum):
    PENDING = "PENDING"
    REVIEWED = "REVIEWED"
    RESOLVED = "RESOLVED"
    DISMISSED = "DISMISSED"

class FeedbackBase(BaseModel):
    transport_id: Optional[int] = None  # Related to schedule/vehicle
    booking_id: Optional[int] = None    # Related to specific booking
    rating: int = Field(..., ge=1, le=5, description="Rating from 1 to 5 stars")
    comment: str = Field(..., min_length=10, max_length=1000)
    feedback_type: FeedbackType = FeedbackType.GENERAL
    is_anonymous: bool = False

    @validator('comment')
    @classmethod
    def validate_comment(cls, v):
        if not v.strip():
            raise ValueError('Comment cannot be empty')
        
        # Basic content filtering
        prohibited_words = ['spam', 'abuse', 'hate']  # Add more as needed
        comment_lower = v.lower()
        
        for word in prohibited_words:
            if word in comment_lower:
                raise ValueError(f'Comment contains prohibited content')
        
        return v.strip()

    @validator('rating')
    @classmethod
    def validate_rating(cls, v):
        if v < 1 or v > 5:
            raise ValueError('Rating must be between 1 and 5')
        return v

class FeedbackCreate(FeedbackBase):
    pass

class FeedbackOut(FeedbackBase):
    id: int
    user_id: int
    status: FeedbackStatus = FeedbackStatus.PENDING
    admin_response: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    # Related data (joined)
    user_info: Optional[dict] = None
    transport_info: Optional[dict] = None
    booking_info: Optional[dict] = None

    class Config:
        from_attributes = True

class FeedbackUpdate(BaseModel):
    rating: Optional[int] = Field(None, ge=1, le=5)
    comment: Optional[str] = Field(None, min_length=10, max_length=1000)
    feedback_type: Optional[FeedbackType] = None
    status: Optional[FeedbackStatus] = None
    admin_response: Optional[str] = Field(None, max_length=500)

    @validator('comment')
    @classmethod
    
    def validate_comment(cls, v):
        if v is not None:
            if not v.strip():
                raise ValueError('Comment cannot be empty')
            return v.strip()
        return v

# Aggregated feedback models
class FeedbackSummary(BaseModel):
    transport_id: int
    total_reviews: int
    average_rating: float
    rating_distribution: dict  # {1: count, 2: count, ...}
    recent_reviews: List[FeedbackOut]

class FeedbackStats(BaseModel):
    total_feedback: int
    pending_feedback: int
    average_rating: float
    feedback_by_type: dict
    monthly_trends: List[dict]