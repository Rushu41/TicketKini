from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, Numeric
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.database.database import Base
import enum

class PaymentMethodEnum(enum.Enum):
    CARD = "card"
    BKASH = "bkash"
    NAGAD = "nagad"
    ROCKET = "rocket"
    UPAY = "upay"
    BANK_TRANSFER = "bank_transfer"
    CASH = "cash"

class PaymentStatusEnum(enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False, unique=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Payment details
    amount = Column(Numeric(10, 2), nullable=False)
    discount_amount = Column(Numeric(10, 2), default=0.0)
    final_amount = Column(Numeric(10, 2), nullable=False)
    
    method = Column(Enum(PaymentMethodEnum), nullable=False)
    status = Column(Enum(PaymentStatusEnum), nullable=False, default=PaymentStatusEnum.PENDING)
    
    # Transaction details
    transaction_id = Column(String(100), unique=True, nullable=True)
    gateway_response = Column(String(1000), nullable=True)  # Store gateway response for debugging
    
    # Coupon information
    coupon_code = Column(String(20), nullable=True)
    coupon_discount_percent = Column(Numeric(5, 2), nullable=True)
    
    # Refund information
    refund_amount = Column(Numeric(10, 2), nullable=True)
    refund_reason = Column(String(500), nullable=True)
    refunded_at = Column(DateTime, nullable=True)
    
    # Timestamps
    payment_time = Column(DateTime, nullable=True)  # When payment was actually completed
    created_at = Column(DateTime, server_default=func.now())  # Changed to func.now()
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())  # Changed to func.now()
    
    # Relationships
    booking = relationship("Booking", back_populates="payment")
    user = relationship("User", back_populates="payments")

    @property
    def is_successful(self):
        """Check if payment was successful"""
        return self.status == PaymentStatusEnum.COMPLETED

    @property
    def can_be_refunded(self):
        """Check if payment can be refunded"""
        return self.status == PaymentStatusEnum.COMPLETED and not self.refund_amount

    def calculate_refund_amount(self, refund_percentage=100):
        """Calculate refund amount based on percentage"""
        if not self.can_be_refunded:
            return 0
        return (float(self.final_amount) * refund_percentage) / 100

    def __repr__(self):
        return f"<Payment(id={self.id}, booking_id={self.booking_id}, amount={self.final_amount}, status='{self.status.value}')>"