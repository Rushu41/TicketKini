import asyncio
from datetime import datetime, time, timedelta
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from passlib.context import CryptContext
import random
import string

# Import all models
from backend.database.database import Base
from backend.database.models.schedule import Schedule
from backend.database.models.user import User, GenderEnum
from backend.database.models.booking import Booking
from backend.database.models.vehicle import Vehicle, Bus, Train, Plane
from backend.database.models.location import Location
from backend.database.models.payment import Payment
from backend.database.models.operator import Operator
from backend.database.models.feedback import Feedback
from backend.database.models.notification import Notification, NotificationTypeEnum, NotificationPriorityEnum
from backend.database.models.coupon import Coupon, CouponType
# Import search analytics models (avoid duplicates)
from backend.database.models.search_analytics import *
# Import only non-duplicate models from advanced_features
from backend.database.models.advanced_features import Discount, MultiLegJourney, ChatConversation, ChatMessage
from backend.config import settings
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

# Configuration from settings (normalized to asyncpg and SSL as needed)
DATABASE_URL = settings.DATABASE_URL

def _sanitize_asyncpg_url(url: str):
    s = (url or "").strip()
    if s.startswith("postgres://"):
        s = "postgresql://" + s[len("postgres://"):]
    if s.startswith("postgresql://"):
        s = "postgresql+asyncpg://" + s[len("postgresql://"):]
    try:
        parsed = urlparse(s)
        qs = dict(parse_qsl(parsed.query))
        qs.pop("sslmode", None)
        host = (parsed.hostname or "").lower()
        if host.endswith("render.com") or "render.com" in host:
            qs["ssl"] = "true"
        new_query = urlencode(qs)
        s = urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment))
    except Exception:
        pass
    connect_args = {}
    if "ssl=true" in s:
        connect_args["ssl"] = True
    return s, connect_args
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def generate_pnr():
    """Generate a random PNR code"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

async def init_db():
    """Initialize database with sample data only if empty"""
    _db_url, _connect_args = _sanitize_asyncpg_url(DATABASE_URL)
    db_engine = create_async_engine(_db_url, echo=bool(getattr(settings, "DEBUG", False)), connect_args=_connect_args)
    async_session = sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    
    # Create tables only if they don't exist (don't drop existing data)
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Check if data already exists before inserting sample data
    existing_locations = None
    async with async_session() as session:
        try:
            # Check if locations already exist
            result = await session.execute(select(Location))
            existing_locations = result.scalars().first()
        except Exception as e:
            print(f"❌ Error during database initialization: {e}")
            raise
    
    # Insert sample data if database is empty
    if existing_locations is None:
        print("📊 Database is empty. Inserting sample data...")
        await insert_sample_data(db_engine, async_session)
    else:
        print("📋 Database already contains data. Skipping sample data insertion.")

async def insert_sample_data(db_engine, async_session):
    """Insert sample data into the database"""
    async with async_session() as session:
        try:
            # 1. Create Locations
            locations_data = [
                {"name": "Dhaka", "code": "DHK", "city": "Dhaka", "distance_from_hub": 0},
                {"name": "Chittagong", "code": "CTG", "city": "Chittagong", "distance_from_hub": 244},
                {"name": "Sylhet", "code": "SYL", "city": "Sylhet", "distance_from_hub": 247},
                {"name": "Rajshahi", "code": "RAJ", "city": "Rajshahi", "distance_from_hub": 256},
                {"name": "Khulna", "code": "KHL", "city": "Khulna", "distance_from_hub": 334},
                {"name": "Barisal", "code": "BAR", "city": "Barisal", "distance_from_hub": 252},
                {"name": "Rangpur", "code": "RNG", "city": "Rangpur", "distance_from_hub": 347},
                {"name": "Mymensingh", "code": "MYM", "city": "Mymensingh", "distance_from_hub": 120},
                {"name": "Cox's Bazar", "code": "CXB", "city": "Cox's Bazar", "distance_from_hub": 414},
                {"name": "Jessore", "code": "JSR", "city": "Jessore", "distance_from_hub": 200}
            ]
            
            locations = []
            for loc_data in locations_data:
                location = Location(**loc_data)
                session.add(location)
                locations.append(location)
            
            await session.flush()
            
            # 2. Create Operators
            operators_data = [
                {
                    "name": "Green Line Paribahan",
                    "contact_email": "info@greenline.com.bd",
                    "contact_phone": "+8801777123456",
                    "license_number": "GL001",
                    "average_rating": 4.5
                },
                {
                    "name": "Ena Transport",
                    "contact_email": "booking@enatransport.com",
                    "contact_phone": "+8801888234567",
                    "license_number": "ET002",
                    "average_rating": 4.2
                },
                {
                    "name": "Shyamoli Paribahan",
                    "contact_email": "support@shyamoli.com.bd",
                    "contact_phone": "+8801999345678",
                    "license_number": "SP003",
                    "average_rating": 4.3
                },
                {
                    "name": "Bangladesh Railway",
                    "contact_email": "info@railway.gov.bd",
                    "contact_phone": "+8801234567890",
                    "license_number": "BR004",
                    "average_rating": 3.8
                },
                {
                    "name": "Biman Bangladesh Airlines",
                    "contact_email": "reservations@biman-airlines.com",
                    "contact_phone": "+8801234567891",
                    "license_number": "BG005",
                    "average_rating": 4.0
                }
            ]
            
            operators = []
            for op_data in operators_data:
                operator = Operator(**op_data)
                session.add(operator)
                operators.append(operator)
            
            await session.flush()
            
            # 3. Create Vehicles
            # Buses
            bus_configs = [
                {"rows": 10, "cols": 4, "name": "Volvo AC", "operator_idx": 0},
                {"rows": 12, "cols": 4, "name": "Scania Multi-Axle", "operator_idx": 0},
                {"rows": 9, "cols": 4, "name": "Hino AC", "operator_idx": 1},
                {"rows": 11, "cols": 4, "name": "Ashok Leyland", "operator_idx": 1},
                {"rows": 10, "cols": 4, "name": "Hyundai Universe", "operator_idx": 2}
            ]

            for i, config in enumerate(bus_configs):
                seat_map = [[1 if (r*config["cols"]+c+1) <= (config["rows"]*config["cols"]) else 0
                           for c in range(config["cols"])] for r in range(config["rows"])]

                bus = Bus(
                    vehicle_number=f"DHK-{1000+i}",
                    vehicle_name=config["name"],
                    seat_map=seat_map,
                    total_seats=config["rows"] * config["cols"],
                    class_prices={"economy": 800, "business": 1200},
                    operator_id=operators[config["operator_idx"]].id,
                    facilities=["AC", "WiFi", "Charging Port", "Entertainment"],
                    is_active=True
                )
                session.add(bus)

            # Trains
            train_configs = [
                {"name": "Suborno Express", "operator_idx": 3},
                {"name": "Padma Express", "operator_idx": 3},
                {"name": "Intercity Express", "operator_idx": 3}
            ]

            for i, config in enumerate(train_configs):
                seat_map = [[1 for c in range(18)] for r in range(16)]

                train = Train(
                    vehicle_number=f"TR-{2000+i}",
                    vehicle_name=config["name"],
                    seat_map=seat_map,
                    total_seats=288,
                    class_prices={"shovon": 400, "first_class": 800, "ac": 1200},
                    operator_id=operators[config["operator_idx"]].id,
                    facilities=["Restaurant Car", "AC", "Sleeper", "WiFi"],
                    is_active=True
                )
                session.add(train)

            # Planes
            plane_configs = [
                {"name": "Boeing 737-800", "operator_idx": 4},
                {"name": "ATR 72-600", "operator_idx": 4}
            ]

            for i, config in enumerate(plane_configs):
                seat_map = [[1 for c in range(6)] for r in range(30)]

                plane = Plane(
                    vehicle_number=f"S2-{3000+i}",
                    vehicle_name=config["name"],
                    seat_map=seat_map,
                    total_seats=180,
                    class_prices={"economy": 8000, "business": 15000},
                    operator_id=operators[config["operator_idx"]].id,
                    facilities=["In-flight Meal", "Entertainment", "WiFi", "AC"],
                    is_active=True
                )
                session.add(plane)
            
            await session.flush()
            
            # 4. Create Schedules
            vehicles = await session.execute(select(Vehicle))
            vehicles = vehicles.scalars().all()
            
            schedule_configs = [
                {"vehicle_idx": 0, "source_idx": 0, "dest_idx": 1, "dep": "08:00", "arr": "14:00"},
                {"vehicle_idx": 0, "source_idx": 1, "dest_idx": 0, "dep": "16:00", "arr": "22:00"},
                {"vehicle_idx": 1, "source_idx": 0, "dest_idx": 2, "dep": "09:30", "arr": "15:30"},
                {"vehicle_idx": 2, "source_idx": 0, "dest_idx": 3, "dep": "07:00", "arr": "13:00"},
                {"vehicle_idx": 3, "source_idx": 0, "dest_idx": 4, "dep": "06:30", "arr": "13:30"},
                {"vehicle_idx": 4, "source_idx": 0, "dest_idx": 8, "dep": "22:00", "arr": "08:00"},
                {"vehicle_idx": 5, "source_idx": 0, "dest_idx": 1, "dep": "15:00", "arr": "23:00"},
                {"vehicle_idx": 6, "source_idx": 0, "dest_idx": 2, "dep": "22:15", "arr": "06:45"},
                {"vehicle_idx": 7, "source_idx": 0, "dest_idx": 3, "dep": "06:45", "arr": "13:30"},
                {"vehicle_idx": 8, "source_idx": 0, "dest_idx": 1, "dep": "10:30", "arr": "11:45"},
                {"vehicle_idx": 9, "source_idx": 0, "dest_idx": 2, "dep": "14:20", "arr": "15:30"}
            ]
            
            for config in schedule_configs:
                dep_time = time.fromisoformat(config["dep"])
                arr_time = time.fromisoformat(config["arr"])
                
                schedule = Schedule(
                    vehicle_id=vehicles[config["vehicle_idx"]].id,
                    source_id=locations[config["source_idx"]].id,
                    destination_id=locations[config["dest_idx"]].id,
                    departure_time=dep_time,
                    arrival_time=arr_time,
                    duration="6h 0m",
                    frequency="daily"
                )
                session.add(schedule)
            
            await session.flush()
            
            # 5. Create Users
            users_data = [
                {"name": "Admin User", "email": "admin@travelsync.com", "phone": "+8801700000000", "hashed_password": hash_password("admin123"), "gender": GenderEnum.MALE, "is_admin": True},
                {"name": "John Doe", "email": "john@example.com", "phone": "+8801700000001", "hashed_password": hash_password("password123"), "gender": GenderEnum.MALE, "is_admin": False},
                {"name": "Jane Smith", "email": "jane@example.com", "phone": "+8801700000002", "hashed_password": hash_password("password123"), "gender": GenderEnum.FEMALE, "is_admin": False},
                {"name": "Mike Johnson", "email": "mike@example.com", "phone": "+8801700000003", "hashed_password": hash_password("password123"), "gender": GenderEnum.MALE, "is_admin": False}
            ]

            users = []
            for user_data in users_data:
                user = User(**user_data)
                session.add(user)
                users.append(user)

            await session.flush()
            
            # 6. Create Coupons
            coupons_data = [
                {"code": "WELCOME10", "name": "Welcome Discount", "description": "10% off on your first booking", "coupon_type": CouponType.FIRST_TIME, "discount_percent": 10.0, "min_order_value": 500.0, "max_discount": 200.0, "usage_limit": 1000, "valid_until": datetime.utcnow() + timedelta(days=365)},
                {"code": "SUMMER25", "name": "Summer Special", "description": "25% off on all bookings", "coupon_type": CouponType.SEASONAL, "discount_percent": 25.0, "min_order_value": 1000.0, "max_discount": 500.0, "usage_limit": 500, "valid_until": datetime.utcnow() + timedelta(days=90)},
                {"code": "FIXED100", "name": "Fixed Discount", "description": "৳100 off on bookings above ৳1000", "coupon_type": CouponType.FIXED_AMOUNT, "discount_amount": 100.0, "min_order_value": 1000.0, "usage_limit": 200, "valid_until": datetime.utcnow() + timedelta(days=30)}
            ]
            
            for coupon_data in coupons_data:
                coupon = Coupon(**coupon_data)
                session.add(coupon)
            
            await session.flush()
            
            # 7. Create Sample Bookings
            for i in range(10):
                booking = Booking(
                    user_id=users[1 + (i % 3)].id,
                    transport_id=vehicles[i % len(vehicles)].id,
                    seats=[1, 2] if i % 2 == 0 else [3],
                    seat_class="economy" if i % 3 != 0 else "business",
                    passenger_details=[{"name": f"Passenger {i+1}", "age": 25 + i, "gender": "male" if i % 2 == 0 else "female"}],
                    total_price=800.0 + (i * 100),
                    status="CONFIRMED" if i % 2 == 0 else "PENDING",
                    pnr=generate_pnr(),
                    booking_date=datetime.utcnow() - timedelta(days=random.randint(1, 30)),
                    travel_date=datetime.utcnow() + timedelta(days=random.randint(1, 60))
                )
                session.add(booking)
            
            await session.flush()
            
            # 8. Create Sample Payments
            bookings = await session.execute(select(Booking))
            bookings = bookings.scalars().all()
            
            from backend.database.models.payment import PaymentMethodEnum, PaymentStatusEnum
            for booking in bookings:
                if booking.status == "CONFIRMED":
                    payment = Payment(
                        booking_id=booking.id,
                        user_id=booking.user_id,
                        amount=booking.total_price,
                        final_amount=booking.total_price,
                        method=random.choice([PaymentMethodEnum.CARD, PaymentMethodEnum.BKASH, PaymentMethodEnum.NAGAD, PaymentMethodEnum.ROCKET]),
                        transaction_id=f"TXN{random.randint(100000, 999999)}",
                        status=PaymentStatusEnum.COMPLETED,
                        coupon_code="WELCOME10" if random.random() < 0.3 else None
                    )
                    session.add(payment)
            
            # 9. Create Sample Feedback
            feedback_data = [
                {"vehicle_id": vehicles[1].id, "user_id": users[2].id, "rating": 4, "comment": "Good experience overall, slight delay but manageable."},
                {"vehicle_id": vehicles[2].id, "user_id": users[3].id, "rating": 3, "comment": "Average service, could be better."},
                {"vehicle_id": vehicles[0].id, "user_id": users[2].id, "rating": 5, "comment": "Amazing! Will definitely book again."},
                {"vehicle_id": vehicles[3].id, "user_id": users[1].id, "rating": 4, "comment": "Clean and comfortable, staff was helpful."}
            ]
            
            for fb_data in feedback_data:
                feedback = Feedback(**fb_data)
                session.add(feedback)
            
            await session.flush()
            
            # 10. Create Sample Notifications
            notification_data = [
                {"user_id": users[1].id, "title": "Booking Confirmed!", "message": "Your booking has been confirmed! PNR: ABC123", "is_read": False, "type": NotificationTypeEnum.BOOKING_CONFIRMATION, "priority": NotificationPriorityEnum.HIGH},
                {"user_id": users[2].id, "title": "Payment Successful", "message": "Payment received successfully for booking PNR: DEF456", "is_read": True, "type": NotificationTypeEnum.PAYMENT_SUCCESS, "priority": NotificationPriorityEnum.HIGH},
                {"user_id": users[3].id, "title": "Welcome aboard!", "message": "Welcome to TravelSync! Use code WELCOME10 for your first booking.", "is_read": False, "type": NotificationTypeEnum.PROMOTIONAL, "priority": NotificationPriorityEnum.MEDIUM},
                {"user_id": users[1].id, "title": "Trip Reminder", "message": "Your journey starts in 2 hours. Have a safe trip!", "is_read": False, "type": NotificationTypeEnum.REMINDER, "priority": NotificationPriorityEnum.URGENT}
            ]
            
            for notif_data in notification_data:
                notification = Notification(**notif_data)
                session.add(notification)
            
            await session.commit()
            print("✅ Sample data inserted successfully!")
            
        except Exception as e:
            await session.rollback()
            print(f"❌ Error inserting sample data: {e}")
            raise
        finally:
            await session.close()
    
    await db_engine.dispose()

async def reset_database():
    """Reset database - drop and recreate all tables"""
    _db_url, _connect_args = _sanitize_asyncpg_url(DATABASE_URL)
    db_engine = create_async_engine(_db_url, echo=bool(getattr(settings, "DEBUG", False)), connect_args=_connect_args)
    
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        print("🗑️ All tables dropped")
        await conn.run_sync(Base.metadata.create_all)
        print("🏗️ All tables recreated")
    
    await db_engine.dispose()

async def main():
    """Main function to run database initialization"""
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "--reset":
        print("🔄 Resetting database...")
        await reset_database()
        print("✅ Database reset complete!")
    else:
        print("🚀 Initializing TravelSync database...")
        await init_db()

if __name__ == "__main__":
    asyncio.run(main())