from sqlalchemy import Column, Integer, String, DateTime, Boolean, Numeric, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.database.database import Base

class Operator(Base):
    __tablename__ = "operators"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    short_name = Column(String(20), nullable=True)  # "Green Line", "Shohagh"
    
    # Contact information
    contact_email = Column(String(255), nullable=False)
    contact_phone = Column(String(20), nullable=False)
    emergency_phone = Column(String(20), nullable=True)
    
    # Address
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    postal_code = Column(String(10), nullable=True)
    
    # Business information
    license_number = Column(String(50), nullable=True)
    tax_id = Column(String(50), nullable=True)
    
    # Rating and reviews
    average_rating = Column(Numeric(3, 2), default=0.0)  # 0.00 to 5.00
    total_reviews = Column(Integer, default=0)
    
    # Business details
    founded_year = Column(Integer, nullable=True)
    website = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime, server_default=func.now())  # Changed to func.now()
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())  # Changed to func.now()

    # Relationships
    vehicles = relationship("Vehicle", back_populates="operator")

    @property
    def total_vehicles(self):
        """Get total number of vehicles for this operator"""
        return len(self.vehicles)

    @property
    def active_vehicles(self):
        """Get number of active vehicles"""
        return len([v for v in self.vehicles if v.is_active])

    def update_rating(self, new_rating: float):
        """Update average rating when new feedback is added"""
        if self.total_reviews == 0:
            self.average_rating = new_rating
            self.total_reviews = 1
        else:
            total_rating = self.average_rating * self.total_reviews
            self.total_reviews += 1
            self.average_rating = (total_rating + new_rating) / self.total_reviews

    def __repr__(self):
        return f"<Operator(id={self.id}, name='{self.name}', rating={self.average_rating})>"