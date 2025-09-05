from sqlalchemy import Column, Integer, String, DateTime, Enum, ForeignKey, JSON, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from backend.database.database import Base
import enum

class VehicleTypeEnum(enum.Enum):
    BUS = "BUS"
    TRAIN = "TRAIN"
    PLANE = "PLANE"

class VehicleStatusEnum(enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    MAINTENANCE = "MAINTENANCE"

class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_number = Column(String(50), unique=True, nullable=False)
    vehicle_name = Column(String(100), nullable=False)
    vehicle_type = Column(Enum(VehicleTypeEnum), nullable=False)
    
    # Operator relationship
    operator_id = Column(Integer, ForeignKey("operators.id"), nullable=False)
    
    # Seat configuration stored as JSON
    # Format: {"total_seats": 320, "layout": "2-2", "classes": {"ECONOMY": [1,2,3,...,320]}}
    seat_map = Column(JSON, nullable=False)
    
    # Class-wise pricing stored as JSON (DEPRECATED - now using schedule-level base_price)
    # Format: {"economy": 500, "business": 800, "ac": 600, "non_ac": 400}
    class_prices = Column(JSON, nullable=True)
    
    # Vehicle specifications
    total_seats = Column(Integer, nullable=False)
    facilities = Column(JSON, nullable=True)  # ["wifi", "ac", "toilet", "charging_port"]
    
    # Performance metrics for dynamic pricing
    avg_rating = Column(JSON, nullable=True)  # {"overall": 4.2, "comfort": 4.1, "service": 4.3}
    total_trips = Column(Integer, default=0)
    total_revenue = Column(JSON, nullable=True)  # {"current_month": 50000, "last_month": 45000}
    
    # Status and timestamps
    status = Column(Enum(VehicleStatusEnum), default=VehicleStatusEnum.ACTIVE)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Polymorphic setup for vehicle types
    __mapper_args__ = {
        'polymorphic_identity': 'vehicle',
        'polymorphic_on': vehicle_type
    }

    # Relationships
    operator = relationship("Operator", back_populates="vehicles")
    schedules = relationship("Schedule", back_populates="vehicle")
    bookings = relationship("Booking", back_populates="vehicle")
    feedbacks = relationship("Feedback", back_populates="vehicle")
    
    # New relationships for advanced features
    price_history = relationship("PriceHistory", back_populates="vehicle")

    def get_available_seats(self, booked_seats: list = None):
        """Get list of available seat numbers"""
        if booked_seats is None:
            booked_seats = []
        
        all_seats = list(range(1, self.total_seats + 1))
        return [seat for seat in all_seats if seat not in booked_seats]

    def get_price_for_class(self, seat_class: str):
        """Get price for specific seat class"""
        return self.class_prices.get(seat_class, 0)

    def calculate_dynamic_price(self, seat_class: str, days_before_travel: int, demand_factor: float = 1.0):
        """Calculate dynamic price based on demand and time"""
        base_price = self.get_price_for_class(seat_class)
        
        # Time-based pricing (early bird discount, last-minute premium)
        if days_before_travel > 30:
            time_factor = 0.85  # 15% discount for early booking
        elif days_before_travel > 14:
            time_factor = 0.95  # 5% discount
        elif days_before_travel > 7:
            time_factor = 1.0   # No change
        elif days_before_travel > 1:
            time_factor = 1.1   # 10% premium
        else:
            time_factor = 1.2   # 20% premium for last-minute
        
        # Apply demand factor
        final_price = base_price * time_factor * demand_factor
        
        return round(final_price, 2)

    def __repr__(self):
        return f"<Vehicle(id={self.id}, number='{self.vehicle_number}', type='{self.vehicle_type.value}')>"


class Bus(Vehicle):
    __tablename__ = "buses"
    
    id = Column(Integer, ForeignKey("vehicles.id"), primary_key=True)
    bus_type = Column(String(50))  # "AC", "Non-AC", "Sleeper", "Semi-Sleeper"
    
    __mapper_args__ = {
        'polymorphic_identity': VehicleTypeEnum.BUS,
    }


class Train(Vehicle):
    __tablename__ = "trains"
    
    id = Column(Integer, ForeignKey("vehicles.id"), primary_key=True)
    train_type = Column(String(50))  # "Express", "Intercity", "Local"
    
    __mapper_args__ = {
        'polymorphic_identity': VehicleTypeEnum.TRAIN,
    }


class Plane(Vehicle):
    __tablename__ = "planes"
    
    id = Column(Integer, ForeignKey("vehicles.id"), primary_key=True)
    aircraft_model = Column(String(50))  # "Boeing 737", "Airbus A320"
    
    __mapper_args__ = {
        'polymorphic_identity': VehicleTypeEnum.PLANE,
    }