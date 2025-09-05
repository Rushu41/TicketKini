from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
import sqlalchemy as sa
from sqlalchemy.orm import relationship
from backend.database.database import Base
import enum

class NotificationTypeEnum(enum.Enum):
    # User notifications
    BOOKING_CONFIRMATION = "booking_confirmation"
    PAYMENT_SUCCESS = "payment_success"
    BOOKING_CANCELLATION = "booking_cancellation"
    SCHEDULE_CHANGE = "schedule_change"
    REFUND_PROCESSED = "refund_processed"
    TRIP_REMINDER = "trip_reminder"
    PROMOTIONAL = "promotional"
    REWARD_EARNED = "reward_earned"
    
    # Admin notifications
    SYSTEM_ALERT = "system_alert"
    BOOKING_ANALYTICS = "booking_analytics"
    REVENUE_REPORT = "revenue_report"
    SECURITY_ALERT = "security_alert"
    VEHICLE_UPDATE = "vehicle_update"
    SCHEDULE_UPDATE = "schedule_update"
    USER_FEEDBACK = "user_feedback"
    
    # General
    ANNOUNCEMENT = "announcement"

class NotificationPriorityEnum(enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"

class UserRoleEnum(enum.Enum):
    USER = "user"
    ADMIN = "admin"
    OPERATOR = "operator"

class NotificationStatusEnum(enum.Enum):
    UNREAD = "unread"
    READ = "read"
    ARCHIVED = "archived"

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Nullable for system-wide notifications
    
    # Role-based targeting (store as string for full compatibility with legacy rows)
    role = Column(String(20), nullable=False, default="user")
    
    # Notification content
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    
    # Notification metadata
    # Store core metadata as strings to avoid enum coercion issues with legacy data
    type = Column(String(50), nullable=False)
    priority = Column(String(20), default="medium")
    status = Column(String(20), default="unread")
    
    # Related entities (optional)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=True)
    payment_id = Column(Integer, ForeignKey("payments.id"), nullable=True)
    feedback_id = Column(Integer, ForeignKey("feedbacks.id"), nullable=True)
    
    # Action URL for clickable notifications
    action_url = Column(String(500), nullable=True)
    
    # Delivery channels
    send_email = Column(Boolean, default=False)
    send_push = Column(Boolean, default=True)  # Web push notification
    
    # Delivery status
    email_sent_at = Column(DateTime, nullable=True)
    push_sent_at = Column(DateTime, nullable=True)
    
    # Read status
    read_at = Column(DateTime, nullable=True)
    
    # Expiry (for promotional notifications)
    expires_at = Column(DateTime, nullable=True)
    
    # System-wide notification flag
    is_system_wide = Column(Boolean, default=False)
    
    # Auto-archive after completion
    auto_archive_after = Column(DateTime, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, server_default=sa.text("NOW()"))
    updated_at = Column(DateTime, server_default=sa.text("NOW()"), onupdate=sa.text("NOW()"))

    # Relationships
    user = relationship("User", back_populates="notifications")
    booking = relationship("Booking")
    payment = relationship("Payment")
    feedback = relationship("Feedback")

    def mark_as_read(self):
        """Mark notification as read"""
        # Handle both enum and string cases gracefully
        status_val = getattr(self.status, "value", str(self.status)).lower() if self.status is not None else ""
        if status_val == "unread":
            self.status = "read"
            from datetime import datetime
            self.read_at = datetime.utcnow()

    def mark_as_archived(self):
        """Mark notification as archived"""
        self.status = "archived"

    @property
    def is_expired(self):
        """Check if notification has expired"""
        if not self.expires_at:
            return False
        from datetime import datetime
        return datetime.utcnow() > self.expires_at

    @property
    def should_auto_archive(self):
        """Check if notification should be auto-archived"""
        if not self.auto_archive_after:
            return False
        from datetime import datetime
        return datetime.utcnow() > self.auto_archive_after

    @classmethod
    def create_booking_confirmation(cls, user_id: int, booking_id: int, pnr: str):
        """Factory method to create booking confirmation notification"""
        return cls(
            user_id=user_id,
            booking_id=booking_id,
            role="user",
            title="Booking Confirmed! 🎫",
            message=f"Your booking has been confirmed. PNR: {pnr}. Have a safe journey!",
            type=NotificationTypeEnum.BOOKING_CONFIRMATION.value,
            priority=NotificationPriorityEnum.HIGH.value,
            send_email=True,
            # Link to bookings page with context instead of non-existent /booking/{id}
            action_url=f"/pages/my-bookings.html?booking_id={booking_id}"
        )

    @classmethod
    def create_payment_success(cls, user_id: int, payment_id: int, amount: float):
        """Factory method to create payment success notification"""
        return cls(
            user_id=user_id,
            payment_id=payment_id,
            role="user",
            title="Payment Successful ✅",
            message=f"Your payment of ৳{amount} has been processed successfully.",
            type=NotificationTypeEnum.PAYMENT_SUCCESS.value,
            priority=NotificationPriorityEnum.HIGH.value,
            send_email=True,
            # Link to confirmation page which can load payment details
            action_url=f"/pages/confirmation.html?payment_id={payment_id}"
        )

    @classmethod
    def create_trip_reminder(cls, user_id: int, booking_id: int, departure_time: str, route: str):
        """Factory method to create trip reminder notification"""
        from datetime import datetime, timedelta
        auto_archive = datetime.utcnow() + timedelta(days=1)  # Archive after trip
        
        return cls(
            user_id=user_id,
            booking_id=booking_id,
            role="user",
            title="Trip Reminder ⏰",
            message=f"Your trip {route} is scheduled in 2 hours at {departure_time}. Please arrive 30 minutes early.",
            type=NotificationTypeEnum.TRIP_REMINDER.value,
            priority=NotificationPriorityEnum.HIGH.value,
            send_email=True,
            auto_archive_after=auto_archive,
            action_url=f"/pages/my-bookings.html?booking_id={booking_id}"
        )

    @classmethod
    def create_admin_booking_alert(cls, booking_count: int, revenue: float):
        """Factory method to create admin booking analytics notification"""
        return cls(
            role="admin",
            is_system_wide=True,
            title="Daily Booking Report 📊",
            message=f"Today: {booking_count} new bookings, ৳{revenue} revenue generated.",
            type=NotificationTypeEnum.BOOKING_ANALYTICS.value,
            priority=NotificationPriorityEnum.MEDIUM.value,
            action_url="/admin/analytics"
        )

    @classmethod
    def create_feedback_notification(cls, feedback_id: int, user_name: str, rating: int):
        """Factory method to create feedback notification for admin"""
        return cls(
            feedback_id=feedback_id,
            role="admin",
            is_system_wide=True,
            title="New User Feedback 💬",
            message=f"New {rating}⭐ feedback from {user_name}. Review required.",
            type=NotificationTypeEnum.USER_FEEDBACK.value,
            priority=NotificationPriorityEnum.MEDIUM.value,
            action_url=f"/admin/feedback/{feedback_id}"
        )

    def __repr__(self):
        type_str = getattr(self.type, "value", str(self.type))
        status_str = getattr(self.status, "value", str(self.status))
        return f"<Notification(id={self.id}, user_id={self.user_id}, type='{type_str}', status='{status_str}')>"