from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from datetime import datetime, timedelta
from typing import List, Optional, Dict
import random
import string
import asyncio

from backend.database.models.booking import Booking
from backend.database.models.schedule import Schedule
from backend.database.models.vehicle import Vehicle
from backend.models.booking import BookingCreate, BookingStatus
from backend.config import settings
from backend.middleware.logger import log_booking_event

class BookingService:
    """Service class for booking-related operations"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def check_availability(self, schedule_id: int, seats: List[int], seat_class: str, travel_date: str = None) -> Dict:
        """Check if requested seats are available for booking"""
        
        # Get schedule and vehicle info
        query = select(Schedule, Vehicle).join(Vehicle).where(Schedule.id == schedule_id)
        result = await self.db.execute(query)
        schedule_vehicle = result.first()
        
        if not schedule_vehicle:
            return {"available": False, "message": "Schedule not found"}
        
        schedule, vehicle = schedule_vehicle
        
        # Debug logging
        print(f"DEBUG: check_availability - schedule_id={schedule_id}, vehicle_id={vehicle.id}")
        
        # Check if schedule is active and in future
        if not schedule.is_active:
            return {"available": False, "message": "Schedule is not active"}
        
        # Check if the travel date is not in the past (only if travel_date is provided)
        if travel_date:
            travel_date_obj = datetime.strptime(travel_date, "%Y-%m-%d").date() if isinstance(travel_date, str) else travel_date
            if travel_date_obj < datetime.now().date():
                return {"available": False, "message": "Cannot book past journeys"}
        
        # Get already booked seats for this schedule and travel date
        # Only count CONFIRMED and PENDING bookings as booked
        # CANCELLED, EXPIRED, and CART bookings don't block seats
        booked_seats_query = select(Booking.seats).where(
            and_(
                Booking.schedule_id == schedule_id,
                Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.PENDING])
            )
        )
        
        # If travel_date is provided, filter by travel_date too
        if travel_date:
            travel_date_obj = datetime.strptime(travel_date, "%Y-%m-%d").date() if isinstance(travel_date, str) else travel_date
            booked_seats_query = booked_seats_query.where(
                func.date(Booking.travel_date) == travel_date_obj
            )
        
        booked_results = await self.db.execute(booked_seats_query)
        
        # Flatten booked seats
        booked_seats = []
        for seat_list in booked_results.scalars():
            if seat_list:
                booked_seats.extend(seat_list)
        
        # Check if requested seats are already booked
        conflicting_seats = set(seats) & set(booked_seats)
        if conflicting_seats:
            return {
                "available": False, 
                "message": f"Seats {list(conflicting_seats)} are already booked"
            }
        
        # Validate seat numbers against vehicle capacity
        max_seat = vehicle.total_seats
        invalid_seats = [seat for seat in seats if seat < 1 or seat > max_seat]
        if invalid_seats:
            return {
                "available": False,
                "message": f"Invalid seat numbers: {invalid_seats}"
            }
        
        # Calculate price
        price_per_seat = await self._get_price_for_class(vehicle, seat_class, schedule)
        if price_per_seat is None:
            return {"available": False, "message": f"Class {seat_class} not available"}
        
        total_price = price_per_seat * len(seats)
        
        result = {
            "available": True,
            "price_per_seat": price_per_seat,
            "total_price": total_price,
            "schedule_id": schedule_id,
            "vehicle_id": vehicle.id,
            "vehicle_info": {
                "vehicle_number": vehicle.vehicle_number,
                "vehicle_type": vehicle.vehicle_type,
                "total_seats": vehicle.total_seats
            },
            "schedule_info": {
                "departure_time": schedule.departure_time,
                "arrival_time": schedule.arrival_time,
                "travel_date": travel_date,
                "duration": schedule.duration
            }
        }
        
        print(f"DEBUG: check_availability result - vehicle_id={result['vehicle_id']}")
        return result
    
    async def create_booking(self, user_id: int, booking_data: BookingCreate) -> Dict:
        """Create a new booking"""
        
        # Check availability first
        availability = await self.check_availability(
            booking_data.schedule_id,  # Changed from transport_id to schedule_id
            booking_data.seats,
            booking_data.seat_class,
            booking_data.travel_date
        )
        
        if not availability["available"]:
            return {"success": False, "message": availability["message"]}
        
        # Debug logging
        print(f"DEBUG: Creating booking with schedule_id={booking_data.schedule_id}, vehicle_id={availability.get('vehicle_id')}")
        
        # Create booking with expiry time
        # Initially create in CART status - doesn't block seats
        expiry_time = datetime.now() + timedelta(minutes=settings.BOOKING_EXPIRY_MINUTES)
        
        new_booking = Booking(
            user_id=user_id,
            transport_id=availability["vehicle_id"],  # Use the actual vehicle_id
            schedule_id=booking_data.schedule_id,    # Store the schedule_id (this is actually the schedule ID from frontend)
            seats=booking_data.seats,
            seat_class=booking_data.seat_class,
            passenger_details=[p.dict() for p in booking_data.passenger_details],
            total_price=availability["total_price"],
            status=BookingStatus.CART,  # Changed to CART status
            booking_date=datetime.now(),
            travel_date=datetime.strptime(booking_data.travel_date, "%Y-%m-%d"),
            expires_at=expiry_time
        )
        
        self.db.add(new_booking)
        await self.db.commit()
        await self.db.refresh(new_booking)
        
        # Log booking event
        log_booking_event(
            booking_id=new_booking.id,
            event="BOOKING_CREATED",
            user_id=user_id,
            details={
                "schedule_id": booking_data.schedule_id,
                "vehicle_id": availability["vehicle_id"],
                "seats": booking_data.seats,
                "total_price": availability["total_price"]
            }
        )
        
        return {
            "success": True,
            "booking_id": new_booking.id,
            "expiry_time": expiry_time,
            "total_price": availability["total_price"],
            "message": f"Booking saved to cart. Complete payment within {settings.BOOKING_EXPIRY_MINUTES} minutes to confirm."
        }
    
    async def auto_cancel_expired_bookings(self):
        """Background task to cancel expired bookings"""
        current_time = datetime.now()
        
        # Find expired PENDING and CART bookings
        expired_query = select(Booking).where(
            and_(
                Booking.status.in_([BookingStatus.PENDING, BookingStatus.CART]),
                Booking.expires_at < current_time
            )
        )
        
        result = await self.db.execute(expired_query)
        expired_bookings = result.scalars().all()
        
        for booking in expired_bookings:
            booking.status = BookingStatus.EXPIRED
            booking.cancelled_at = current_time
            booking.cancellation_reason = "Auto-expired due to payment timeout"
            log_booking_event(
                booking_id=booking.id,
                event="BOOKING_EXPIRED",
                user_id=booking.user_id
            )
        
        if expired_bookings:
            await self.db.commit()
            return len(expired_bookings)
        
        return 0
    
    async def cancel_booking(self, booking_id: int, user_id: int, is_admin: bool = False) -> Dict:
        """Cancel a booking"""
        
        # Get booking
        query = select(Booking).where(Booking.id == booking_id)
        if not is_admin:
            query = query.where(Booking.user_id == user_id)
        
        result = await self.db.execute(query)
        booking = result.scalar_one_or_none()
        
        if not booking:
            return {"success": False, "message": "Booking not found"}
        
        if booking.status in [BookingStatus.CANCELLED, BookingStatus.EXPIRED]:
            return {"success": False, "message": "Booking is already cancelled"}
        
        # Check if booking can be cancelled (e.g., not too close to departure)
        if booking.schedule_id:
            schedule_query = select(Schedule).where(Schedule.id == booking.schedule_id)
            schedule_result = await self.db.execute(schedule_query)
            schedule = schedule_result.scalar_one_or_none()
            
            if schedule:
                # Get travel_date from booking (it's stored as datetime, so extract date)
                travel_date_obj = booking.travel_date.date() if booking.travel_date else datetime.now().date()
                departure_datetime = datetime.combine(
                    travel_date_obj,
                    schedule.departure_time
                )
                time_to_departure = departure_datetime - datetime.now()
                
                # Don't allow cancellation within 2 hours of departure
                if time_to_departure.total_seconds() < 7200 and not is_admin:
                    return {
                        "success": False,
                        "message": "Cannot cancel booking within 2 hours of departure"
                    }
        
        # Cancel booking
        old_status = booking.status
        booking.status = BookingStatus.CANCELLED
        booking.cancelled_at = datetime.now()
        booking.updated_at = datetime.now()
        
        # Get seat numbers for logging
        cancelled_seats = booking.seats or []
        
        # If booking was confirmed, initiate refund
        refund_amount = 0
        if old_status == BookingStatus.CONFIRMED:
            # Calculate refund amount (you might want to deduct cancellation charges)
            refund_amount = float(booking.total_price) * 0.9  # 10% cancellation charge
        
        await self.db.commit()
        
        log_booking_event(
            booking_id=booking_id,
            event="BOOKING_CANCELLED",
            user_id=user_id,
            details={
                "old_status": old_status, 
                "refund_amount": refund_amount,
                "freed_seats": cancelled_seats,
                "schedule_id": booking.schedule_id,
                "transport_id": booking.transport_id
            }
        )
        
        return {
            "success": True,
            "message": f"Booking cancelled successfully. Seats {', '.join(map(str, cancelled_seats))} are now available for other passengers.",
            "refund_amount": refund_amount,
            "freed_seats": cancelled_seats
        }
    
    async def confirm_booking(self, booking_id: int, payment_id: int) -> Dict:
        """Confirm booking after successful payment"""
        
        # Get booking
        query = select(Booking).where(Booking.id == booking_id)
        result = await self.db.execute(query)
        booking = result.scalar_one_or_none()
        
        if not booking:
            return {"success": False, "message": "Booking not found"}
        
        if booking.status != BookingStatus.PENDING:
            return {"success": False, "message": "Booking is not in pending status"}
        
        # Generate PNR
        pnr = self._generate_pnr()
        
        # Confirm booking
        booking.status = BookingStatus.CONFIRMED
        booking.pnr = pnr
        booking.updated_at = datetime.now()
        
        await self.db.commit()
        
        log_booking_event(
            booking_id=booking_id,
            event="BOOKING_CONFIRMED",
            user_id=booking.user_id,
            details={"pnr": pnr, "payment_id": payment_id}
        )
        
        return {
            "success": True,
            "pnr": pnr,
            "message": "Booking confirmed successfully"
        }
    
    async def get_user_bookings(self, user_id: int, status: Optional[str] = None) -> List[Dict]:
        """Get user's bookings with detailed information"""
        from sqlalchemy.orm import selectinload
        
        # Build query with joins to get vehicle, schedule, and route information
        query = select(Booking).options(
            selectinload(Booking.vehicle).selectinload(Vehicle.operator),
            selectinload(Booking.schedule).selectinload(Schedule.source),
            selectinload(Booking.schedule).selectinload(Schedule.destination)
        ).where(Booking.user_id == user_id)
        
        if status:
            query = query.where(Booking.status == status)
        
        query = query.order_by(Booking.created_at.desc())
        
        result = await self.db.execute(query)
        bookings = result.scalars().all()
        
        # Convert to dictionary format with enhanced information
        enhanced_bookings = []
        for booking in bookings:
            booking_dict = {
                'id': booking.id,
                'pnr': booking.pnr,
                'status': booking.status,
                'seats': booking.seats or [],
                'seat_class': booking.seat_class,
                'travel_date': booking.travel_date.isoformat() if booking.travel_date else None,
                'booking_date': booking.booking_date.isoformat() if booking.booking_date else booking.created_at.isoformat(),
                'total_price': float(booking.total_price),
                'passenger_details': booking.passenger_details or [],
                'created_at': booking.created_at.isoformat(),
                'updated_at': booking.updated_at.isoformat() if booking.updated_at else None,
            }
            
            # Add vehicle information
            if booking.vehicle:
                booking_dict['vehicle'] = {
                    'id': booking.vehicle.id,
                    'vehicle_name': booking.vehicle.vehicle_name,
                    'vehicle_number': booking.vehicle.vehicle_number,
                    'vehicle_type': booking.vehicle.vehicle_type.value if booking.vehicle.vehicle_type else None,
                    'operator_name': booking.vehicle.operator.name if booking.vehicle.operator else None
                }
            
            # Add route information from schedule
            if booking.schedule:
                booking_dict['route'] = {
                    'source': booking.schedule.source.name if booking.schedule.source else 'Unknown',
                    'destination': booking.schedule.destination.name if booking.schedule.destination else 'Unknown',
                    'departure_time': booking.schedule.departure_time,
                    'arrival_time': booking.schedule.arrival_time,
                    'schedule_id': booking.schedule.id
                }
            
            enhanced_bookings.append(booking_dict)
        
        return enhanced_bookings
    
    async def compute_price(self, schedule_id: int, seat_class: str, seat_count: int) -> float:
        """Compute total price for booking"""
        query = select(Schedule, Vehicle).join(Vehicle).where(Schedule.id == schedule_id)
        result = await self.db.execute(query)
        schedule_vehicle = result.first()

        if not schedule_vehicle:
            return 0.0

        schedule, vehicle = schedule_vehicle
        price_per_seat = await self._get_price_for_class(vehicle, seat_class, schedule)

        if price_per_seat is None:
            return 0.0

        return float(price_per_seat) * float(seat_count)
    
    async def _get_price_for_class(self, vehicle: Vehicle, seat_class: str, schedule: Optional[Schedule] = None) -> Optional[float]:
        """Get price for specific seat class.
        Fallback: if class_prices missing or class not found and class is ECONOMY, use schedule.base_price when available.
        """
        # Normalize requested class
        normalized = seat_class.upper() if isinstance(seat_class, str) else str(seat_class)

        # If no class_prices configured, fallback to schedule base price for ECONOMY
        if not getattr(vehicle, 'class_prices', None):
            if schedule is not None and normalized == 'ECONOMY' and getattr(schedule, 'base_price', None) is not None:
                return float(schedule.base_price)
            return None

        # Handle dict mapping
        if isinstance(vehicle.class_prices, dict):
            # Direct lookup (case-sensitive)
            if normalized in vehicle.class_prices:
                return float(vehicle.class_prices[normalized])

            # Case-insensitive lookup
            for class_name, price in vehicle.class_prices.items():
                if str(class_name).upper() == normalized:
                    return float(price)

            # Not found in mapping: fallback to schedule base price for ECONOMY
            if schedule is not None and normalized == 'ECONOMY' and getattr(schedule, 'base_price', None) is not None:
                return float(schedule.base_price)

        return None
    
    def _generate_pnr(self) -> str:
        """Generate unique PNR (Passenger Name Record)"""
        # Format: TXN + 6 random alphanumeric characters
        random_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        return f"TSY{random_part}"


# Background task runner
async def run_booking_cleanup():
    """Background task to clean up expired bookings"""
    from backend.database.database import get_db
    
    while True:
        try:
            async for db in get_db():
                service = BookingService(db)
                cancelled_count = await service.auto_cancel_expired_bookings()
                if cancelled_count > 0:
                    print(f"Auto-cancelled {cancelled_count} expired bookings")  # Auto-cancelled expired bookings
                    break
        except Exception as e:
            print(f"Error in booking cleanup: {e}")
        # Wait 60 seconds before next check
        await asyncio.sleep(60)