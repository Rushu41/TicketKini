from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, Enum
from sqlalchemy.sql import func  # Import func for SQL functions
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
import enum

# Import Base from your main database module instead of creating a new one
from backend.database.database import Base

class CouponType(enum.Enum):
    PERCENTAGE = "percentage"
    FIXED_AMOUNT = "fixed_amount"
    FIRST_TIME = "first_time"
    SEASONAL = "seasonal"

class Coupon(Base):
    __tablename__ = "coupons"
    
    code = Column(String(20), primary_key=True, index=True)  # e.g., "SAVE20", "FIRST50"
    name = Column(String(100), nullable=False)  # Display name
    description = Column(Text, nullable=True)
    coupon_type = Column(Enum(CouponType), default=CouponType.PERCENTAGE)
    discount_percent = Column(Float, nullable=True)  # For percentage discounts
    discount_amount = Column(Float, nullable=True)  # For fixed amount discounts
    min_order_value = Column(Float, default=0.0)  # Minimum booking amount required
    max_discount = Column(Float, nullable=True)  # Maximum discount cap
    usage_limit = Column(Integer, nullable=True)  # Total usage limit
    usage_count = Column(Integer, default=0)  # Current usage count
    user_usage_limit = Column(Integer, default=1)  # Per-user usage limit
    is_active = Column(Boolean, default=True)
    valid_from = Column(DateTime, server_default=func.now())  # Changed to server_default
    valid_until = Column(DateTime, nullable=True)
    applicable_routes = Column(Text, nullable=True)  # JSON string of route IDs
    applicable_operators = Column(Text, nullable=True)  # JSON string of operator IDs
    created_at = Column(DateTime, server_default=func.now())  # Changed to server_default
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())  # Changed to server_default
    
    def __repr__(self):
        return f"<Coupon(code='{self.code}', type={self.coupon_type.value}, active={self.is_active})>"
    
    @property
    def is_valid(self):
        """Check if coupon is currently valid"""
        now = datetime.utcnow()
        
        # Check if active
        if not self.is_active:
            return False, "Coupon is not active"
        
        # Check validity period
        if self.valid_from and now < self.valid_from:
            return False, "Coupon is not yet valid"
        
        if self.valid_until and now > self.valid_until:
            return False, "Coupon has expired"
        
        # Check usage limit
        if self.usage_limit and self.usage_count >= self.usage_limit:
            return False, "Coupon usage limit exceeded"
        
        return True, "Valid"
    
    def calculate_discount(self, order_amount):
        """Calculate discount amount for given order value"""
        if not self.is_valid[0]:
            return 0, self.is_valid[1]
        
        # Check minimum order value
        if order_amount < self.min_order_value:
            return 0, f"Minimum order value of ৳{self.min_order_value} required"
        
        discount = 0
        
        if self.coupon_type == CouponType.PERCENTAGE:
            discount = (order_amount * self.discount_percent) / 100
        elif self.coupon_type == CouponType.FIXED_AMOUNT:
            discount = self.discount_amount
        elif self.coupon_type == CouponType.FIRST_TIME:
            # Assume this is a percentage discount for first-time users
            discount = (order_amount * self.discount_percent) / 100
        elif self.coupon_type == CouponType.SEASONAL:
            discount = (order_amount * self.discount_percent) / 100
        
        # Apply maximum discount cap
        if self.max_discount and discount > self.max_discount:
            discount = self.max_discount
        
        return discount, "Discount applied successfully"
    
    def increment_usage(self):
        """Increment the usage count"""
        self.usage_count += 1
    
    @classmethod
    def create_welcome_coupon(cls):
        """Factory method to create a welcome coupon for new users"""
        return cls(
            code="WELCOME10",
            name="Welcome Discount",
            description="10% off on your first booking",
            coupon_type=CouponType.FIRST_TIME,
            discount_percent=10.0,
            min_order_value=500.0,
            max_discount=200.0,
            user_usage_limit=1,
            valid_until=datetime.utcnow() + timedelta(days=365)
        )
    
    @classmethod
    def create_seasonal_coupon(cls, season_name, discount_percent, valid_days=30):
        """Factory method to create seasonal coupons"""
        code = f"{season_name.upper()}{int(discount_percent)}"
        return cls(
            code=code,
            name=f"{season_name} Special",
            description=f"{discount_percent}% off during {season_name} season",
            coupon_type=CouponType.SEASONAL,
            discount_percent=discount_percent,
            min_order_value=1000.0,
            max_discount=500.0,
            valid_until=datetime.utcnow() + timedelta(days=valid_days)
        )