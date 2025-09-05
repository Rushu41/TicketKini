from sqlalchemy import Column, Integer, String, DateTime, Boolean, Float, Text, JSON, ForeignKey, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.database.database import Base
import enum

# Note: SearchLog, UserPreference, and PriceHistory are defined in search_analytics.py
# to avoid duplicate table definitions

class Discount(Base):
    """Discount codes and promotional offers"""
    __tablename__ = "discounts"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    
    # Discount details
    discount_type = Column(String(20), nullable=False)  # "percentage", "flat"
    discount_value = Column(Float, nullable=False)
    max_discount_amount = Column(Float, nullable=True)
    min_booking_amount = Column(Float, default=0)
    
    # Usage limits
    usage_limit = Column(Integer, nullable=True)  # null = unlimited
    usage_count = Column(Integer, default=0)
    usage_limit_per_user = Column(Integer, default=1)
    
    # Conditions
    applicable_transport_types = Column(JSON, nullable=True)  # ["BUS", "TRAIN"]
    applicable_routes = Column(JSON, nullable=True)  # [{"from": "Dhaka", "to": "Chittagong"}]
    first_booking_only = Column(Boolean, default=False)
    
    # Validity
    valid_from = Column(DateTime, nullable=False)
    valid_until = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('idx_discount_code_active', 'code', 'is_active'),
        Index('idx_discount_validity', 'valid_from', 'valid_until'),
    )

class MultiLegJourney(Base):
    """Multi-leg journey planning"""
    __tablename__ = "multi_leg_journeys"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Journey overview
    origin = Column(String(100), nullable=False)
    destination = Column(String(100), nullable=False)
    total_duration_minutes = Column(Integer, nullable=False)
    total_distance_km = Column(Float, nullable=True)
    total_cost = Column(Float, nullable=False)
    
    # Journey legs stored as JSON
    legs = Column(JSON, nullable=False)  # Array of leg details
    
    # Status
    is_bookable = Column(Boolean, default=True)
    expires_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    user = relationship("User")

class ChatConversation(Base):
    """Chat support conversations"""
    __tablename__ = "chat_conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    session_id = Column(String(255), nullable=True)
    
    # Conversation metadata
    topic = Column(String(100), nullable=True)  # "booking", "payment", "cancellation"
    status = Column(String(20), default="ACTIVE")  # "ACTIVE", "RESOLVED", "ESCALATED"
    priority = Column(String(20), default="NORMAL")  # "LOW", "NORMAL", "HIGH", "URGENT"
    
    # Resolution
    resolved_at = Column(DateTime, nullable=True)
    satisfaction_rating = Column(Integer, nullable=True)  # 1-5
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User")
    messages = relationship("ChatMessage", back_populates="conversation")

class ChatMessage(Base):
    """Individual chat messages"""
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("chat_conversations.id"), nullable=False)
    
    # Message details
    sender_type = Column(String(20), nullable=False)  # "USER", "BOT", "AGENT"
    sender_id = Column(Integer, nullable=True)  # User ID or Agent ID
    message_text = Column(Text, nullable=False)
    message_type = Column(String(20), default="TEXT")  # "TEXT", "IMAGE", "FILE", "QUICK_REPLY"
    
    # Metadata
    is_automated = Column(Boolean, default=False)
    requires_response = Column(Boolean, default=False)
    
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    conversation = relationship("ChatConversation", back_populates="messages")

    __table_args__ = (
        Index('idx_message_conversation', 'conversation_id', 'created_at'),
    )
