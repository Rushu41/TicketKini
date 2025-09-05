from sqlalchemy import Column, Integer, String, DateTime, Enum, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.database.database import Base
import enum
import re

class GenderEnum(enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"

class IDTypeEnum(enum.Enum):
    NID = "nid"
    PASSPORT = "passport"
    BIRTH_CERTIFICATE = "birth_certificate"
    DRIVING_LICENSE = "driving_license"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=False)
    # Ensure proper enum handling with native_enum=False for better PostgreSQL compatibility
    gender = Column(Enum(GenderEnum, name="genderenum", native_enum=True), nullable=True)
    date_of_birth = Column(DateTime, nullable=True)
    id_type = Column(Enum(IDTypeEnum, name="idtypeenum", native_enum=True), nullable=True)
    id_number = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    
    # Authentication tracking
    last_login = Column(DateTime, nullable=True)
    failed_login_attempts = Column(Integer, default=0)
    account_locked_until = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    bookings = relationship("Booking", back_populates="user")
    payments = relationship("Payment", back_populates="user")
    notifications = relationship("Notification", back_populates="user")
    feedbacks = relationship("Feedback", 
                           back_populates="user", 
                           foreign_keys="[Feedback.user_id]")
    responded_feedbacks = relationship(
        "Feedback",
        foreign_keys="[Feedback.responded_by]",
        back_populates="admin_user",
    )
    
    # New relationships for advanced features
    search_logs = relationship("SearchLog", back_populates="user")
    preferences = relationship("UserPreference", back_populates="user", uselist=False)

    @staticmethod
    def validate_email(email: str) -> bool:
        """Validate email format"""
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return re.match(pattern, email) is not None

    @staticmethod
    def validate_phone(phone: str) -> bool:
        """Validate phone number format"""
        # Bangladesh phone number format: +880XXXXXXXXX or 01XXXXXXXXX
        pattern = r'^(\+880|880|0)1[3-9]\d{8}$'
        return re.match(pattern, phone) is not None

    def __repr__(self):
        return f"<User(id={self.id}, email='{self.email}', name='{self.name}')>"