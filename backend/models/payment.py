
from pydantic import BaseModel, Field, validator
from typing import Optional, Literal
from datetime import datetime
from enum import Enum
from decimal import Decimal as _Decimal_unused  # type: ignore  # avoid unused import warnings

class PaymentStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"
    CANCELLED = "CANCELLED"

class PaymentMethod(str, Enum):
    CARD = "CARD"
    BKASH = "BKASH"
    NAGAD = "NAGAD"
    ROCKET = "ROCKET"
    UPAY = "UPAY"
    BANK_TRANSFER = "BANK_TRANSFER"

class PaymentBase(BaseModel):
    booking_id: int
    amount: float = Field(..., gt=0, description="Payment amount in BDT")
    payment_method: PaymentMethod
    coupon_code: Optional[str] = Field(None, max_length=20)
    discount_amount: float = Field(0, ge=0)

    @validator('amount')
    @classmethod
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError('Payment amount must be greater than 0')
        # Round to 2 decimal places
        return round(v, 2)

    @validator('coupon_code')
    @classmethod
    def validate_coupon_code(cls, v):
        if v is not None:
            v = v.strip().upper()
            if not v:
                return None
            if not v.replace('-', '').replace('_', '').isalnum():
                raise ValueError('Coupon code can only contain alphanumeric characters, hyphens, and underscores')
        return v

class PaymentCreate(PaymentBase):
    # Additional fields for payment creation
    payment_details: Optional[dict] = Field(None, description="Payment gateway specific details")
    # Whether to apply the provided coupon_code (if any) during payment
    apply_coupon: Optional[bool] = Field(True, description="Apply provided coupon code at checkout")

class PaymentOut(PaymentBase):
    id: int
    user_id: int
    status: PaymentStatus
    transaction_id: Optional[str] = None
    gateway_transaction_id: Optional[str] = None
    gateway_response: Optional[dict] = None
    payment_time: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Related booking info
    booking_info: Optional[dict] = None

    class Config:
        from_attributes = True

class PaymentUpdate(BaseModel):
    status: Optional[PaymentStatus] = None
    transaction_id: Optional[str] = None
    gateway_transaction_id: Optional[str] = None
    gateway_response: Optional[dict] = None
    payment_time: Optional[datetime] = None

# Coupon Models
class CouponBase(BaseModel):
    code: str = Field(..., min_length=3, max_length=20)
    discount_type: Literal["PERCENTAGE", "FIXED"] = "PERCENTAGE"
    discount_value: float = Field(..., gt=0)
    minimum_amount: float = Field(0, ge=0)
    maximum_discount: Optional[float] = Field(None, ge=0)
    usage_limit: Optional[int] = Field(None, ge=1)
    user_limit: int = Field(1, ge=1, description="How many times a user can use this coupon")
    expiry_date: Optional[datetime] = None
    is_active: bool = True

    @validator('code')
    @classmethod
    def validate_code(cls, v):
        code = v.strip().upper()
        if not code.replace('-', '').replace('_', '').isalnum():
            raise ValueError('Coupon code can only contain alphanumeric characters, hyphens, and underscores')
        return code

    @validator('discount_value')
    @classmethod
    def validate_discount_value(cls, v, values):
        if 'discount_type' in values:
            if values['discount_type'] == 'PERCENTAGE' and v > 100:
                raise ValueError('Percentage discount cannot exceed 100%')
        return v

class CouponCreate(CouponBase):
    pass

class CouponOut(CouponBase):
    id: int
    used_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CouponUpdate(BaseModel):
    discount_value: Optional[float] = Field(None, gt=0)
    minimum_amount: Optional[float] = Field(None, ge=0)
    maximum_discount: Optional[float] = Field(None, ge=0)
    usage_limit: Optional[int] = Field(None, ge=1)
    user_limit: Optional[int] = Field(None, ge=1)
    expiry_date: Optional[datetime] = None
    is_active: Optional[bool] = None

# Payment gateway response models
class PaymentResponse(BaseModel):
    success: bool
    # Return the created payment id so the frontend can fetch details
    id: Optional[int] = None
    transaction_id: Optional[str] = None
    gateway_transaction_id: Optional[str] = None
    message: str
    payment_url: Optional[str] = None  # For redirect-based payments
    
class RefundRequest(BaseModel):
    payment_id: int
    refund_amount: Optional[float] = None  # If None, full refund
    reason: str = Field(..., min_length=10, max_length=500)

class RefundResponse(BaseModel):
    success: bool
    refund_id: Optional[str] = None
    refund_amount: float
    message: str
    estimated_days: int = 7