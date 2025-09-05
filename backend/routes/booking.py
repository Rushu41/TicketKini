from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from datetime import datetime, timedelta
from typing import List, Optional

from backend.database.database import get_db
from backend.database.models.user import User
from backend.database.models.booking import Booking
from backend.database.models.vehicle import Vehicle
from backend.database.models.schedule import Schedule
from backend.database.models.location import Location
from backend.database.models.operator import Operator
from backend.models.booking import BookingCreate, BookingOut, BookingUpdate, BookingStatus
# from backend.models.user import UserOut  # not used directly in routes
from backend.middleware.jwt_auth import get_current_user
from backend.services.booking_service import BookingService
from backend.middleware.logger import log_user_action

router = APIRouter()

@router.post("/", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
async def create_booking(
    booking_data: BookingCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new booking"""
    
    # Initialize booking service
    booking_service = BookingService(db)
    
    # Create booking using the service
    result = await booking_service.create_booking(
        user_id=current_user.id,
        booking_data=booking_data
    )
    
    if not result["success"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result["message"]
        )
    
    # Note: Auto-cancellation is handled by a separate scheduled task
    # to avoid aggressive cancellation during the booking process
    
    # Get the created booking to return
    booking_query = select(Booking).where(Booking.id == result["booking_id"])
    booking_result = await db.execute(booking_query)
    booking = booking_result.scalar_one()
    
    # Log booking creation
    log_user_action(
        user_id=current_user.id,
        action="BOOKING_CREATED",
        details={
            "booking_id": booking.id,
            "schedule_id": booking_data.schedule_id,  # Changed from transport_id to schedule_id
            "seats": booking_data.seats,
            "total_price": result["total_price"]
        }
    )
    
    return booking

@router.get("/user/count")
async def get_user_booking_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Return total number of confirmed/completed bookings for the current user.

    Frontend expects: { "booking_count": <int> }
    """
    # Use raw SQL to avoid analysis issues with func.count
    count_query = text(
        "SELECT COUNT(*) FROM bookings WHERE user_id = :uid AND status IN ('CONFIRMED','COMPLETED')"
    )
    result = await db.execute(count_query, {"uid": current_user.id})
    booking_count = result.scalar() or 0

    # Optional: log action
    log_user_action(
        user_id=current_user.id,
        action="BOOKING_COUNT_REQUESTED",
        details={"booking_count": booking_count}
    )

    return {"booking_count": int(booking_count)}

@router.get("/{user_id}")
async def get_user_bookings(
    user_id: int,
    status_filter: Optional[BookingStatus] = None,
    limit: int = 20,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user's bookings with detailed information including vehicle and route details"""
    
    # Users can only access their own bookings unless admin
    if current_user.id != user_id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Initialize booking service
    booking_service = BookingService(db)
    
    # Get enhanced bookings using service method
    bookings = await booking_service.get_user_bookings(
        user_id=user_id,
        status=status_filter.value if status_filter else None
    )
    
    # Apply pagination
    paginated_bookings = bookings[offset:offset + limit]
    
    # Log the action
    log_user_action(
        user_id=current_user.id,
        action="VIEW_BOOKINGS",
        details={"viewed_user_id": user_id, "total_bookings": len(bookings)}
    )
    
    return {
        "success": True,
        "data": paginated_bookings,
        "total": len(bookings),
        "offset": offset,
        "limit": limit
    }

@router.get("/details/{booking_id}", response_model=BookingOut)
async def get_booking_details(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed booking information"""
    
    # Get booking with schedule and vehicle information
    booking_query = select(Booking, Schedule, Vehicle).join(
        Schedule, Booking.schedule_id == Schedule.id, isouter=True
    ).join(
        Vehicle, Booking.transport_id == Vehicle.id, isouter=True
    ).where(Booking.id == booking_id)
    
    booking_result = await db.execute(booking_query)
    result = booking_result.first()
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found"
        )
    
    booking, schedule, vehicle = result
    
    # Check access permissions
    if booking.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Get location names for route information
    source_location = None
    destination_location = None
    
    if schedule:
        source_query = select(Location).where(Location.id == schedule.source_id)
        source_result = await db.execute(source_query)
        source_location = source_result.scalar_one_or_none()
        
        dest_query = select(Location).where(Location.id == schedule.destination_id)
        dest_result = await db.execute(dest_query)
        destination_location = dest_result.scalar_one_or_none()
    
    # Create enhanced booking response
    booking_dict = {
        "id": booking.id,
        "user_id": booking.user_id,
        "transport_id": booking.transport_id,
        "schedule_id": booking.schedule_id,
        "seats": booking.seats,
        "seat_class": booking.seat_class,
        "passenger_details": booking.passenger_details,
        "total_price": float(booking.total_price),
        "status": booking.status,
        "pnr": booking.pnr,
        "booking_date": booking.booking_date,
        "travel_date": booking.travel_date,
        "expires_at": getattr(booking, 'expires_at', None) or getattr(booking, 'expiry_time', None),
        "created_at": booking.created_at,
        "updated_at": booking.updated_at,
        "route": None,
        "vehicle": None
    }
    
    # Add route information if available
    if schedule and source_location and destination_location:
        booking_dict["route"] = {
            "source": source_location.name,
            "destination": destination_location.name,
            "departure_time": schedule.departure_time.strftime("%H:%M") if schedule.departure_time else None,
            "arrival_time": schedule.arrival_time.strftime("%H:%M") if schedule.arrival_time else None,
            "duration": schedule.duration if hasattr(schedule, 'duration') else None
        }
    
    # Add vehicle information if available
    if vehicle:
        # Get operator name
        operator_query = select(Operator).where(Operator.id == vehicle.operator_id)
        operator_result = await db.execute(operator_query)
        operator = operator_result.scalar_one_or_none()
        
        booking_dict["vehicle"] = {
            "vehicle_name": vehicle.vehicle_name,
            "vehicle_number": vehicle.vehicle_number,
            "vehicle_type": vehicle.vehicle_type,
            "operator_name": operator.name if operator else None,
            "total_seats": vehicle.total_seats
        }
    
    return booking_dict

@router.put("/{booking_id}", response_model=BookingOut)
async def update_booking(
    booking_id: int,
    booking_update: BookingUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update booking details (limited fields)"""
    
    # Get booking
    booking_query = select(Booking).where(Booking.id == booking_id)
    booking_result = await db.execute(booking_query)
    booking = booking_result.scalar_one_or_none()
    
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found"
        )
    
    # Check access permissions
    if booking.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Only allow updates for PENDING bookings
    if booking.status != BookingStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only update pending bookings"
        )
    
    # Update allowed fields
    update_data = booking_update.dict(exclude_unset=True)
    
    for field, value in update_data.items():
        if hasattr(booking, field):
            setattr(booking, field, value)
    
    booking.updated_at = datetime.now()
    await db.commit()
    await db.refresh(booking)
    
    # Log booking update
    log_user_action(
        user_id=current_user.id,
        action="BOOKING_UPDATED",
        details={
            "booking_id": booking_id,
            "updated_fields": list(update_data.keys())
        }
    )
    
    return booking

@router.delete("/{booking_id}")
async def cancel_booking(
    booking_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Cancel a booking"""
    
    # Initialize booking service
    booking_service = BookingService(db)
    
    # Cancel booking using service
    result = await booking_service.cancel_booking(
        booking_id=booking_id,
        user_id=current_user.id,
        is_admin=current_user.is_admin
    )
    
    if not result["success"]:
        if "not found" in result["message"].lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result["message"]
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=result["message"]
            )
    
    # Log booking cancellation
    log_user_action(
        user_id=current_user.id,
        action="BOOKING_CANCELLED",
        details={
            "booking_id": booking_id,
            "cancelled_by": "admin" if current_user.is_admin else "user",
            "refund_amount": result.get("refund_amount", 0)
        }
    )
    
    return {
        "message": result["message"],
        "booking_id": booking_id,
        "refund_amount": result.get("refund_amount", 0)
    }

@router.get("/stats")
async def get_booking_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user's booking statistics"""
    
    # Get user's booking counts by status using raw SQL
    
    stats_query = text("""
        SELECT 
            status,
            COUNT(*) as count,
            COALESCE(SUM(total_price), 0) as total_amount
        FROM bookings 
        WHERE user_id = :user_id 
        GROUP BY status
    """)
    
    result = await db.execute(stats_query, {"user_id": current_user.id})
    stats = result.fetchall()
    
    # Format response
    stats_dict = {
        "total_bookings": 0,
        "total_spent": 0,
        "by_status": {}
    }
    
    for st, cnt, amount in stats:
        stats_dict["total_bookings"] += cnt
        stats_dict["total_spent"] += float(amount or 0)
        stats_dict["by_status"][st] = {
            "count": cnt,
            "total_amount": float(amount or 0)
        }
    
    return stats_dict

@router.post("/extend/{booking_id}")
async def extend_booking_expiry(
    booking_id: int,
    extension_minutes: int = 15,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Extend booking expiry time (for pending bookings)"""
    
    # Get booking
    booking_query = select(Booking).where(Booking.id == booking_id)
    booking_result = await db.execute(booking_query)
    booking = booking_result.scalar_one_or_none()
    
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found"
        )
    
    # Check access permissions
    if booking.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Only extend PENDING bookings
    if booking.status != BookingStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only extend pending bookings"
        )
    
    # Check if booking hasn't already expired (use expiry_time instead of expires_at)
    expiry_field = getattr(booking, 'expires_at', None) or getattr(booking, 'expiry_time', None)
    if expiry_field and expiry_field < datetime.now():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Booking has already expired"
        )
    
    # Extend expiry time
    new_expiry = datetime.now() + timedelta(minutes=extension_minutes)
    if hasattr(booking, 'expires_at'):
        booking.expires_at = new_expiry
    elif hasattr(booking, 'expiry_time'):
        booking.expiry_time = new_expiry
    
    booking.updated_at = datetime.now()
    
    await db.commit()
    
    # Log extension
    log_user_action(
        user_id=current_user.id,
        action="BOOKING_EXTENDED",
        details={
            "booking_id": booking_id,
            "extension_minutes": extension_minutes,
            "new_expiry": new_expiry.isoformat()
        }
    )
    
    return {
        "message": "Booking expiry extended successfully",
        "new_expiry": new_expiry,
        "booking_id": booking_id
    }

@router.post("/confirm/{booking_id}")
async def confirm_booking(
    booking_id: int,
    payment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Confirm booking after payment"""
    
    # Initialize booking service
    booking_service = BookingService(db)
    
    # Confirm booking using service
    result = await booking_service.confirm_booking(
        booking_id=booking_id,
        payment_id=payment_id
    )
    
    if not result["success"]:
        if "not found" in result["message"].lower():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result["message"]
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=result["message"]
            )
    
    # Log booking confirmation
    log_user_action(
        user_id=current_user.id,
        action="BOOKING_CONFIRMED",
        details={
            "booking_id": booking_id,
            "pnr": result["pnr"],
            "payment_id": payment_id
        }
    )
    
    return {
        "message": result["message"],
        "pnr": result["pnr"],
        "booking_id": booking_id
    }

@router.get("/availability/{transport_id}")
async def check_seat_availability(
    transport_id: int,
    seats: List[int],
    seat_class: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Check seat availability for a transport"""
    
    # Initialize booking service
    booking_service = BookingService(db)
    
    # Check availability
    # Interpret transport_id as schedule_id for availability check
    # (endpoint name kept for backward compatibility; frontend doesn't use it currently)
    _ = current_user.id  # mark as used
    result = await booking_service.check_availability(
        schedule_id=transport_id,
        seats=seats,
        seat_class=seat_class
    )
    
    return result