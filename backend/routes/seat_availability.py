from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from datetime import datetime
from typing import List, Optional

from backend.database.database import get_db
from backend.database.models.booking import Booking
from backend.database.models.schedule import Schedule
from backend.database.models.vehicle import Vehicle
from backend.models.booking import BookingStatus

router = APIRouter(prefix="/seats", tags=["seat-availability"])

@router.get("/availability/{schedule_id}")
async def get_seat_availability(
    schedule_id: int,
    travel_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Get seat availability for a specific schedule and travel date"""
    
    # Add debugging information
    print(f"DEBUG: get_seat_availability called with schedule_id={schedule_id}, travel_date={travel_date}")
    
    # Get schedule and vehicle info
    query = select(Schedule, Vehicle).join(Vehicle).where(Schedule.id == schedule_id)
    result = await db.execute(query)
    schedule_vehicle = result.first()
    
    if not schedule_vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found"
        )
    
    schedule, vehicle = schedule_vehicle
    
    print(f"DEBUG: Found schedule {schedule.id} for vehicle {vehicle.id} ({vehicle.vehicle_number})")
    
    # Get booked seats for this schedule and travel date
    # Only count CONFIRMED and PENDING bookings
    booked_seats_query = select(Booking.seats, Booking.status, Booking.id, Booking.travel_date).where(
        and_(
            Booking.schedule_id == schedule_id,
            Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.PENDING])
        )
    )
    
    if travel_date:
        travel_date_obj = datetime.strptime(travel_date, "%Y-%m-%d").date()
        booked_seats_query = booked_seats_query.where(
            func.date(Booking.travel_date) == travel_date_obj
        )
        print(f"DEBUG: Filtering bookings for travel_date={travel_date_obj}")
    else:
        print(f"DEBUG: No travel_date provided, getting all bookings for schedule")
    
    booked_results = await db.execute(booked_seats_query)
    booked_bookings = booked_results.all()
    
    print(f"DEBUG: Found {len(booked_bookings)} active bookings for this schedule/date")
    
    # Flatten booked seats and track which booking has which seats
    booked_seats = []
    seat_booking_map = {}
    
    for seat_list, booking_status, booking_id, booking_travel_date in booked_bookings:
        if seat_list:
            print(f"DEBUG: Booking {booking_id} (status={booking_status}, travel_date={booking_travel_date}) has seats: {seat_list}")
            for seat in seat_list:
                booked_seats.append(seat)
                seat_booking_map[seat] = {
                    "booking_id": booking_id,
                    "status": booking_status,
                    "travel_date": booking_travel_date.isoformat() if booking_travel_date else None
                }
    
    # Generate all possible seats
    all_seats = list(range(1, vehicle.total_seats + 1))
    available_seats = [seat for seat in all_seats if seat not in booked_seats]
    
    print(f"DEBUG: Vehicle has {vehicle.total_seats} total seats")
    print(f"DEBUG: {len(booked_seats)} seats are booked: {sorted(booked_seats)}")
    print(f"DEBUG: {len(available_seats)} seats are available: {sorted(available_seats)}")
    
    # Get recently cancelled seats for information
    cancelled_query = select(Booking.seats, Booking.cancelled_at, Booking.id, Booking.travel_date).where(
        and_(
            Booking.schedule_id == schedule_id,
            Booking.status == BookingStatus.CANCELLED,
            Booking.cancelled_at.isnot(None)
        )
    )
    
    if travel_date:
        travel_date_obj = datetime.strptime(travel_date, "%Y-%m-%d").date()
        cancelled_query = cancelled_query.where(
            func.date(Booking.travel_date) == travel_date_obj
        )
    
    cancelled_query = cancelled_query.order_by(Booking.cancelled_at.desc()).limit(10)
    cancelled_results = await db.execute(cancelled_query)
    
    recently_freed_seats = []
    for seat_list, cancelled_at, booking_id, booking_travel_date in cancelled_results.all():
        if seat_list and cancelled_at:
            for seat in seat_list:
                recently_freed_seats.append({
                    "seat": seat,
                    "freed_at": cancelled_at.isoformat(),
                    "booking_id": booking_id,
                    "travel_date": booking_travel_date.isoformat() if booking_travel_date else None
                })
    
    print(f"DEBUG: {len(recently_freed_seats)} recently freed seats")
    
    response_data = {
        "schedule_id": schedule_id,
        "travel_date": travel_date,
        "vehicle": {
            "id": vehicle.id,
            "name": vehicle.vehicle_name,
            "number": vehicle.vehicle_number,
            "total_seats": vehicle.total_seats,
            "type": vehicle.vehicle_type
        },
        "schedule": {
            "departure_time": schedule.departure_time.strftime("%H:%M") if schedule.departure_time else None,
            "arrival_time": schedule.arrival_time.strftime("%H:%M") if schedule.arrival_time else None
        },
        "seat_availability": {
            "total_seats": vehicle.total_seats,
            "available_seats": len(available_seats),
            "booked_seats": len(booked_seats),
            "available_seat_numbers": sorted(available_seats),
            "booked_seat_numbers": sorted(booked_seats)
        },
        "recently_freed_seats": recently_freed_seats[:5],  # Show last 5 freed seats
        "seat_details": seat_booking_map,
        "debug_info": {
            "query_travel_date": travel_date,
            "current_date": datetime.now().date().isoformat(),
            "total_bookings_found": len(booked_bookings),
            "total_cancelled_found": len(cancelled_results.all())
        }
    }
    
    print(f"DEBUG: Returning seat availability response with {len(available_seats)} available seats")
    return response_data

@router.get("/check/{schedule_id}")
async def check_specific_seats(
    schedule_id: int,
    seats: str,  # Comma-separated seat numbers
    travel_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Check if specific seats are available"""
    
    try:
        seat_numbers = [int(s.strip()) for s in seats.split(',')]
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid seat numbers format. Use comma-separated integers."
        )
    
    # Get schedule and vehicle info
    query = select(Schedule, Vehicle).join(Vehicle).where(Schedule.id == schedule_id)
    result = await db.execute(query)
    schedule_vehicle = result.first()
    
    if not schedule_vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Schedule not found"
        )
    
    schedule, vehicle = schedule_vehicle
    
    # Validate seat numbers
    invalid_seats = [seat for seat in seat_numbers if seat < 1 or seat > vehicle.total_seats]
    if invalid_seats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid seat numbers: {invalid_seats}. Valid range: 1-{vehicle.total_seats}"
        )
    
    # Check if seats are already booked
    booked_seats_query = select(Booking.seats, Booking.status, Booking.id).where(
        and_(
            Booking.schedule_id == schedule_id,
            Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.PENDING])
        )
    )
    
    if travel_date:
        travel_date_obj = datetime.strptime(travel_date, "%Y-%m-%d").date()
        booked_seats_query = booked_seats_query.where(
            func.date(Booking.travel_date) == travel_date_obj
        )
    
    booked_results = await db.execute(booked_seats_query)
    
    # Check conflicts
    conflicts = []
    for seat_list, booking_status, booking_id in booked_results.all():
        if seat_list:
            conflicting_seats = set(seat_numbers) & set(seat_list)
            if conflicting_seats:
                conflicts.append({
                    "seats": list(conflicting_seats),
                    "booking_id": booking_id,
                    "status": booking_status
                })
    
    is_available = len(conflicts) == 0
    
    return {
        "schedule_id": schedule_id,
        "travel_date": travel_date,
        "requested_seats": seat_numbers,
        "available": is_available,
        "conflicts": conflicts,
        "message": "All seats are available" if is_available else f"Some seats are already booked"
    }
