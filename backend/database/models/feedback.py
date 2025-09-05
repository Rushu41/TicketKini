from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.sql import text
from datetime import datetime, timedelta
from sqlalchemy.orm import relationship
from backend.database.database import Base
import enum


class FeedbackTypeEnum(enum.Enum):
    TRIP_REVIEW = "trip_review"
    SERVICE_COMPLAINT = "service_complaint"
    SUGGESTION = "suggestion"
    COMPLIMENT = "compliment"
    TECHNICAL_ISSUE = "technical_issue"
    REFUND_REQUEST = "refund_request"
    GENERAL = "general"


class FeedbackStatusEnum(enum.Enum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    RESOLVED = "resolved"
    CLOSED = "closed"


class UserRoleEnum(enum.Enum):
    USER = "user"
    ADMIN = "admin"
    OPERATOR = "operator"


class Feedback(Base):
    __tablename__ = "feedbacks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    # Store as strings to tolerate mixed-case in existing rows
    role = Column(String(20), nullable=False, default=UserRoleEnum.USER.value)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=True)

    # Feedback content
    title = Column(String(200), nullable=True)
    message = Column(Text, nullable=False)

    # Feedback metadata
    type = Column(String(50), default=FeedbackTypeEnum.GENERAL.value)
    status = Column(String(50), default=FeedbackStatusEnum.PENDING.value)
    priority = Column(String(20), default="medium")

    # Ratings
    rating = Column(Integer, nullable=True)
    comment = Column(Text, nullable=True)
    
    # Category-wise ratings (only those present in prod)
    cleanliness_rating = Column(Integer, nullable=True)
    comfort_rating = Column(Integer, nullable=True)
    staff_rating = Column(Integer, nullable=True)
    punctuality_rating = Column(Integer, nullable=True)

    # Approval and anonymity
    is_approved = Column(Boolean, default=True)
    is_anonymous = Column(Boolean, default=False)
    # Featured on home/carousel
    is_featured = Column(Boolean, default=False)

    # Admin response
    admin_response = Column(Text, nullable=True)
    responded_at = Column(DateTime, nullable=True)
    responded_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, server_default=text('CURRENT_TIMESTAMP'))
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=text('CURRENT_TIMESTAMP'))

    # Relationships
    user = relationship("User", back_populates="feedbacks", foreign_keys=[user_id])
    vehicle = relationship("Vehicle", back_populates="feedbacks")
    booking = relationship("Booking")
    admin_user = relationship("User", foreign_keys=[responded_by], back_populates="responded_feedbacks")

    def mark_as_resolved(self, admin_id: int):
        # With simplified schema, we only update status and responder
        self.status = FeedbackStatusEnum.RESOLVED.value
        self.responded_by = admin_id

    def mark_as_closed(self):
        self.status = FeedbackStatusEnum.CLOSED.value

    def add_admin_response(self, admin_id: int, response: str):
        self.admin_response = response
        self.responded_by = admin_id
        self.responded_at = datetime.utcnow()
        self.status = FeedbackStatusEnum.UNDER_REVIEW.value

    @property
    def overall_rating(self):
        ratings = [
            self.rating,
            self.cleanliness_rating,
            self.comfort_rating,
            self.staff_rating,
            self.punctuality_rating,
        ]
        valid = [r for r in ratings if r is not None]
        if not valid:
            return None
        return round(sum(valid) / len(valid), 1)

    @property
    def average_category_rating(self):
        ratings = [
            self.cleanliness_rating,
            self.comfort_rating,
            self.staff_rating,
            self.punctuality_rating,
        ]
        valid = [r for r in ratings if r is not None]
        if not valid:
            return None
        return round(sum(valid) / len(valid), 1)

    @property
    def sentiment_score(self):
        if not self.rating:
            return "neutral"
        if self.rating >= 4:
            return "positive"
        if self.rating <= 2:
            return "negative"
        return "neutral"

    @property
    def is_overdue(self):
        if self.status in (FeedbackStatusEnum.RESOLVED.value, FeedbackStatusEnum.CLOSED.value):
            return False
        overdue_date = self.created_at + timedelta(days=3)
        return datetime.utcnow() > overdue_date

    @staticmethod
    def validate_rating(rating: int) -> bool:
        return 1 <= rating <= 5

    @classmethod
    def create_trip_feedback(cls, user_id: int, booking_id: int, vehicle_id: int, rating: int, message: str, **category_ratings):
        return cls(
            user_id=user_id,
            role=UserRoleEnum.USER.value,
            booking_id=booking_id,
            vehicle_id=vehicle_id,
            rating=rating,
            message=message,
            type=FeedbackTypeEnum.TRIP_REVIEW.value,
            title="Trip Review",
            **category_ratings,
        )

    @classmethod
    def create_complaint(cls, user_id: int, title: str, message: str, priority: str = "medium"):
        return cls(
            user_id=user_id,
            role=UserRoleEnum.USER.value,
            title=title,
            message=message,
            type=FeedbackTypeEnum.SERVICE_COMPLAINT.value,
            priority=priority,
        )

    def __repr__(self):
        return f"<Feedback(id={self.id}, type='{self.type}', rating={self.rating}, status='{self.status}')>"