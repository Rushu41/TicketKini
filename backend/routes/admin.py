from fastapi import APIRouter, Depends, HTTPException, status as http_status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, text
from typing import List, Optional
import asyncio
from datetime import datetime, timedelta, time

from backend.database.database import get_db
from backend.database.models.user import User
from backend.database.models.vehicle import Vehicle, VehicleTypeEnum
from backend.database.models.booking import Booking
from backend.database.models.payment import Payment
from backend.database.models.schedule import Schedule
from backend.database.models.operator import Operator
from backend.models.vehicle import VehicleCreate, VehicleUpdate, VehicleOut
from backend.models.user import UserOut, UserCreate, UserUpdate
from backend.models.schedule import ScheduleCreate, ScheduleOut, ScheduleUpdate
from backend.middleware.jwt_auth import get_current_user, require_admin, create_access_token
from passlib.context import CryptContext

router = APIRouter(prefix="/admin", tags=["admin"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@router.post("/setup_admin")
async def setup_admin(db: AsyncSession = Depends(get_db)):
    """Create a default admin user if one doesn't exist."""
    admin_user = await db.execute(select(User).where(User.email == "admin"))
    if admin_user.scalar_one_or_none() is None:
        hashed_password = pwd_context.hash("admin")
        new_admin = User(email="admin", 
                           name="Admin", 
                           hashed_password=hashed_password, 
                           is_admin=True)
        db.add(new_admin)
        await db.commit()
        return {"message": "Admin user created successfully."}
    return {"message": "Admin user already exists."}


# Vehicle Management
@router.post("/vehicles", response_model=VehicleOut)
async def create_vehicle(
    vehicle: VehicleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Create a new vehicle (Admin only)"""
    from backend.models.vehicle import convert_2d_to_1d_seat_map, convert_class_prices_to_dict
    from sqlalchemy.exc import IntegrityError
    
    # Debug logging
    print(f"DEBUG: Received vehicle data: {vehicle.dict()}")
    print(f"DEBUG: Vehicle type: {type(vehicle.vehicle_type)}, value: {vehicle.vehicle_type}")
    print(f"DEBUG: Class prices: {vehicle.class_prices}")
    print(f"DEBUG: Seat map: {vehicle.seat_map}")
    
    try:
        # Check if vehicle number already exists
        existing_vehicle = await db.execute(
            select(Vehicle).where(Vehicle.vehicle_number == vehicle.vehicle_number)
        )
        if existing_vehicle.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=f"Vehicle number {vehicle.vehicle_number} already exists"
            )
        
        # Normalize seat_map for DB: always store as { total_seats, layout, classes: { ECONOMY: [1..N] } }
        try:
            # If client already sent the dict shape, honor it but validate
            sm = getattr(vehicle, 'seat_map', None)
            if isinstance(sm, dict) and 'classes' in sm and 'total_seats' in sm:
                # Coerce classes to ECONOMY only with cleaned seat numbers
                seats = []
                try:
                    # Prefer ECONOMY key if present else merge all
                    if 'ECONOMY' in sm.get('classes', {}):
                        seats = list(map(int, sm['classes']['ECONOMY']))
                    else:
                        for arr in sm.get('classes', {}).values():
                            for n in arr:
                                try:
                                    seats.append(int(n))
                                except Exception:
                                    continue
                except Exception:
                    seats = []
                seats = sorted(set(seats))
                if not seats and vehicle.total_seats:
                    seats = list(range(1, int(vehicle.total_seats) + 1))
                seat_map_dict = {
                    'total_seats': int(vehicle.total_seats),
                    'layout': str(sm.get('layout') or '2-2'),
                    'classes': {'ECONOMY': seats},
                }
            else:
                # Convert from 2D array using helper; with no class prices default to ECONOMY
                class_prices_for_map = vehicle.class_prices or []
                seat_map_dict = convert_2d_to_1d_seat_map(vehicle.seat_map, class_prices_for_map)
                # Ensure total_seats matches declared total
                if seat_map_dict.get('total_seats') != int(vehicle.total_seats):
                    seat_map_dict['total_seats'] = int(vehicle.total_seats)
                if 'layout' not in seat_map_dict or not seat_map_dict['layout']:
                    seat_map_dict['layout'] = '2-2'
        except Exception:
            # Fallback: simple sequential ECONOMY seat map
            flattened = [n for row in (getattr(vehicle, 'seat_map', []) or []) for n in row if isinstance(n, int)]
            if not flattened and vehicle.total_seats:
                flattened = list(range(1, int(vehicle.total_seats) + 1))
            seat_map_dict = {
                'total_seats': int(vehicle.total_seats),
                'layout': '2-2',
                'classes': {'ECONOMY': flattened}
            }

        # Convert class_prices list to dict format for database
        try:
            if vehicle.class_prices:
                class_prices_dict = convert_class_prices_to_dict(vehicle.class_prices)
            else:
                # Set class_prices to null - pricing will be handled at schedule level
                class_prices_dict = None
        except Exception:
            # Set to null on any conversion error - pricing handled at schedule level
            class_prices_dict = None
        
        db_vehicle = Vehicle(
            vehicle_number=vehicle.vehicle_number,
            vehicle_name=vehicle.vehicle_name,
            vehicle_type=vehicle.vehicle_type,
            seat_map=seat_map_dict,
            class_prices=class_prices_dict,
            operator_id=vehicle.operator_id,
            total_seats=vehicle.total_seats,
            facilities=vehicle.facilities
        )
        
        try:
            db.add(db_vehicle)
            await db.commit()
            
            # Query the created vehicle to get all fields for proper response
            result = await db.execute(
                select(Vehicle).where(Vehicle.vehicle_number == vehicle.vehicle_number)
            )
            created_vehicle = result.scalar_one()
            
            # Convert seat_map back to 2D format for response
            from backend.models.vehicle import convert_1d_to_2d_seat_map
            seat_map_2d = vehicle.seat_map  # Use the original 2D seat map from input
            
            # Return proper VehicleOut response
            return VehicleOut(
                id=created_vehicle.id,
                vehicle_number=created_vehicle.vehicle_number,
                vehicle_name=created_vehicle.vehicle_name,
                vehicle_type=created_vehicle.vehicle_type,
                operator_id=created_vehicle.operator_id,
                total_seats=created_vehicle.total_seats,
                seat_map=seat_map_2d,
                class_prices=[] if not vehicle.class_prices else vehicle.class_prices,
                facilities=created_vehicle.facilities or [],
                status=created_vehicle.status,
                created_at=created_vehicle.created_at,
                updated_at=created_vehicle.updated_at
            )
        except IntegrityError as e:
            await db.rollback()
            if "duplicate key value violates unique constraint" in str(e):
                raise HTTPException(
                    status_code=400,
                    detail=f"Vehicle number {vehicle.vehicle_number} already exists"
                )
            else:
                raise HTTPException(
                    status_code=500,
                    detail=f"Database error: {str(e)}"
                )
    except Exception as e:
        print(f"DEBUG: Unexpected error: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error: {str(e)}"
        )

@router.get("/vehicles")
async def get_vehicles(
    skip: int = 0,
    limit: int = 500,  # default limit 500
    vehicle_type: Optional[VehicleTypeEnum] = None,
    operator_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get all vehicles with detailed information"""
    from backend.models.vehicle import convert_1d_to_2d_seat_map, convert_class_prices_from_dict
    
    query = select(Vehicle, Operator).join(
        Operator, Vehicle.operator_id == Operator.id
    )
    
    if vehicle_type:
        query = query.where(Vehicle.vehicle_type == vehicle_type)
    if operator_id:
        query = query.where(Vehicle.operator_id == operator_id)
    
    # Show latest vehicles first
    query = query.order_by(Vehicle.id.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    rows = result.fetchall()
    
    vehicles_data = []
    for row in rows:
        vehicle, operator = row
        
        # Convert seat_map from database format to frontend format
        seat_map_2d = []
        if vehicle.seat_map and isinstance(vehicle.seat_map, dict) and "classes" in vehicle.seat_map:
            layout = vehicle.seat_map.get("layout", "2-2")
            seat_map_2d = convert_1d_to_2d_seat_map(vehicle.seat_map["classes"], vehicle.total_seats, layout)
        
        # Convert class_prices from database format to frontend format
        class_prices_list = []
        if vehicle.class_prices and isinstance(vehicle.class_prices, dict):
            class_prices_list = convert_class_prices_from_dict(vehicle.class_prices)
        
        vehicles_data.append({
            "id": vehicle.id,
            "vehicle_number": vehicle.vehicle_number,
            "vehicle_name": vehicle.vehicle_name,
            "vehicle_type": vehicle.vehicle_type.value,
            "operator_id": vehicle.operator_id,
            "operator_name": operator.name,
            "total_seats": vehicle.total_seats,
            "seat_map": seat_map_2d,
            "class_prices": [cp.dict() for cp in class_prices_list],
            "facilities": vehicle.facilities,
            "avg_rating": vehicle.avg_rating,
            "status": vehicle.status.value,
            "is_active": vehicle.is_active,
            "created_at": vehicle.created_at.isoformat() if vehicle.created_at else None
        })
    
    return vehicles_data

@router.put("/vehicles/{vehicle_id}")
async def update_vehicle(
    vehicle_id: int,
    payload: VehicleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    try:
        # Get the vehicle
        query = select(Vehicle).where(Vehicle.id == vehicle_id)
        result = await db.execute(query)
        db_vehicle = result.scalar_one_or_none()
        if not db_vehicle:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Vehicle not found")

        # Get only the fields that were provided (exclude_unset=True)
        data = payload.dict(exclude_unset=True)
        
        # Apply changes to the vehicle object
        for key, value in data.items():
            if key == 'class_prices' and isinstance(value, list):
                # Accept list of {class_name, base_price} and convert to dict
                class_dict = {}
                for item in value:
                    if isinstance(item, dict):
                        class_dict[str(item.get('class_name', 'ECONOMY'))] = float(item.get('base_price', 0))
                    else:
                        cname = getattr(item, 'class_name', 'ECONOMY')
                        price = float(getattr(item, 'base_price', 0))
                        class_dict[str(cname)] = price
                setattr(db_vehicle, 'class_prices', class_dict)
            elif key == 'seat_map' and isinstance(value, list):
                # Rebuild a simple seat_map dict from 2D array (all seats as ECONOMY)
                flattened = [n for row in value for n in row if isinstance(n, (int, float))]
                total = len(flattened)
                setattr(db_vehicle, 'seat_map', {
                    'total_seats': total,
                    'layout': '2-2',
                    'classes': {'ECONOMY': flattened}
                })
            else:
                # Set the attribute directly
                setattr(db_vehicle, key, value)

        # Commit the changes
        await db.commit()
        
        # Return a simple success response without trying to refresh or serialize the object
        return {
            "success": True,
            "message": "Vehicle updated successfully", 
            "vehicle_id": vehicle_id,
            "updated_fields": list(data.keys())
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        await db.rollback()
        raise
    except Exception as e:
        # Handle any other exceptions
        await db.rollback()
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Failed to update vehicle: {str(e)}"
        )

@router.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    result = await db.execute(select(Vehicle).where(Vehicle.id == vehicle_id))
    db_vehicle = result.scalar_one_or_none()
    if not db_vehicle:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
    await db.delete(db_vehicle)
    await db.commit()
    return {"message": "Vehicle deleted"}

# Schedule Management
@router.post("/schedules", response_model=ScheduleOut)
async def create_schedule(
    schedule: ScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Create a new schedule (Admin only)"""
    try:
        print(f"DEBUG: Received schedule data: {schedule.dict()}")
        
        db_schedule = Schedule(
            vehicle_id=schedule.vehicle_id,
            source_id=schedule.source_id,
            destination_id=schedule.destination_id,
            departure_time=schedule.departure_time,
            arrival_time=schedule.arrival_time,
            duration=schedule.duration,
            base_price=schedule.base_price,
            frequency=schedule.frequency or 'daily',
            is_active=1  # New schedules are active by default
        )
        db.add(db_schedule)
        await db.commit()
        
        # Query the created schedule to get all fields for proper response
        result = await db.execute(
            select(Schedule).where(
                Schedule.vehicle_id == schedule.vehicle_id,
                Schedule.source_id == schedule.source_id,
                Schedule.destination_id == schedule.destination_id,
                Schedule.departure_time == schedule.departure_time
            ).order_by(Schedule.id.desc()).limit(1)
        )
        created_schedule = result.scalar_one()
        
        # Return proper ScheduleOut response
        return ScheduleOut(
            id=created_schedule.id,
            vehicle_id=created_schedule.vehicle_id,
            source_id=created_schedule.source_id,
            destination_id=created_schedule.destination_id,
            departure_time=created_schedule.departure_time,
            arrival_time=created_schedule.arrival_time,
            duration=created_schedule.duration,
            base_price=created_schedule.base_price,
            frequency=created_schedule.frequency,
            is_active=created_schedule.is_active,
            created_at=created_schedule.created_at,
            updated_at=created_schedule.updated_at
        )
    except Exception as e:
        print(f"DEBUG: Error creating schedule: {e}")
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create schedule: {str(e)}"
        )

@router.get("/schedules")
async def get_schedules(
    skip: int = 0,
    limit: int = 500,  # default limit 500
    vehicle_type: Optional[VehicleTypeEnum] = None,
    source_id: Optional[int] = None,
    destination_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get all schedules with detailed information"""
    from backend.database.models.location import Location
    from sqlalchemy.orm import aliased
    
    SourceLocation = aliased(Location)
    DestLocation = aliased(Location)
    
    query = select(
        Schedule,
        Vehicle,
        Operator,
        SourceLocation,
        DestLocation
    ).join(
        Vehicle, Schedule.vehicle_id == Vehicle.id
    ).join(
        Operator, Vehicle.operator_id == Operator.id
    ).join(
        SourceLocation, Schedule.source_id == SourceLocation.id
    ).join(
        DestLocation, Schedule.destination_id == DestLocation.id
    )
    
    # Apply filters
    if vehicle_type:
        query = query.where(Vehicle.vehicle_type == vehicle_type)
    if source_id:
        query = query.where(Schedule.source_id == source_id)
    if destination_id:
        query = query.where(Schedule.destination_id == destination_id)
    
    # Show latest schedules first
    query = query.order_by(Schedule.id.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    rows = result.fetchall()
    
    schedules_data = []
    for row in rows:
        schedule, vehicle, operator, source_loc, dest_loc = row
        schedules_data.append({
            "id": schedule.id,
            "vehicle_id": schedule.vehicle_id,
            "vehicle_number": vehicle.vehicle_number,
            "vehicle_type": vehicle.vehicle_type.value,
            "operator_name": operator.name,
            "source_id": schedule.source_id,
            "source_name": source_loc.name,
            "destination_id": schedule.destination_id,
            "destination_name": dest_loc.name,
            "departure_time": schedule.departure_time.strftime("%H:%M"),
            "arrival_time": schedule.arrival_time.strftime("%H:%M"),
            "duration": schedule.duration,
            "frequency": schedule.frequency,
            "is_active": schedule.is_active,
            "created_at": schedule.created_at.isoformat() if schedule.created_at else None
        })
    
    return schedules_data

@router.put("/schedules/{schedule_id}")
async def update_schedule(
    schedule_id: int,
    payload: ScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    result = await db.execute(select(Schedule).where(Schedule.id == schedule_id))
    db_schedule = result.scalar_one_or_none()
    if not db_schedule:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    for k, v in payload.dict(exclude_unset=True).items():
        setattr(db_schedule, k, v)
    await db.commit()
    # Remove problematic refresh call
    return {"success": True, "message": "Schedule updated", "schedule_id": schedule_id}

@router.delete("/schedules/{schedule_id}")
async def delete_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    result = await db.execute(select(Schedule).where(Schedule.id == schedule_id))
    db_schedule = result.scalar_one_or_none()
    if not db_schedule:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Schedule not found")
    await db.delete(db_schedule)
    await db.commit()
    return {"message": "Schedule deleted"}


# Statistics and Analytics
@router.get("/stats")
async def get_admin_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get admin dashboard statistics"""
    try:
        # Get total counts
        total_users_result = await db.execute(select(func.count(User.id)))
        total_users = total_users_result.scalar()
        
        total_bookings_result = await db.execute(select(func.count(Booking.id)))
        total_bookings = total_bookings_result.scalar()
        
        total_vehicles_result = await db.execute(select(func.count(Vehicle.id)))
        total_vehicles = total_vehicles_result.scalar()
        
        total_operators_result = await db.execute(select(func.count(Operator.id)))
        total_operators = total_operators_result.scalar()
        
        # Get revenue stats
        total_revenue_result = await db.execute(
            select(func.sum(Payment.amount)).where(Payment.status == "COMPLETED")
        )
        total_revenue = total_revenue_result.scalar() or 0
        
        # Get active users (users who made bookings in last 30 days)
        thirty_days_ago = datetime.now() - timedelta(days=30)
        active_users_result = await db.execute(
            select(func.count(func.distinct(Booking.user_id))).where(Booking.created_at >= thirty_days_ago)
        )
        active_users = active_users_result.scalar()
        
        # Get active trips (confirmed bookings in next 7 days)
        seven_days_from_now = datetime.now() + timedelta(days=7)
        active_trips_result = await db.execute(
            select(func.count(Booking.id)).where(
                and_(
                    Booking.status == "CONFIRMED",
                    Booking.travel_date <= seven_days_from_now,
                    Booking.travel_date >= datetime.now()
                )
            )
        )
        active_trips = active_trips_result.scalar()
        
        # Get recent bookings count (last 30 days)
        recent_bookings_result = await db.execute(
            select(func.count(Booking.id)).where(Booking.created_at >= thirty_days_ago)
        )
        recent_bookings = recent_bookings_result.scalar()
        
        # Get booking status distribution
        booking_stats_result = await db.execute(
            select(Booking.status, func.count(Booking.id)).group_by(Booking.status)
        )
        booking_status_stats = {status: count for status, count in booking_stats_result.fetchall()}
        
        # Get vehicle type distribution
        vehicle_stats_result = await db.execute(
            select(Vehicle.vehicle_type, func.count(Vehicle.id)).group_by(Vehicle.vehicle_type)
        )
        vehicle_type_stats = {vehicle_type.value: count for vehicle_type, count in vehicle_stats_result.fetchall()}
        
        # Get monthly revenue data (last 6 months)
        monthly_revenue = []
        for i in range(6):
            month_start = (datetime.now().replace(day=1) - timedelta(days=30*i)).replace(day=1)
            month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
            
            month_revenue_result = await db.execute(
                select(func.coalesce(func.sum(Payment.amount), 0)).where(
                    and_(
                        Payment.status == "COMPLETED",
                        Payment.created_at >= month_start,
                        Payment.created_at <= month_end
                    )
                )
            )
            month_revenue = float(month_revenue_result.scalar() or 0)
            monthly_revenue.append({
                "month": month_start.strftime("%b"),
                "revenue": month_revenue
            })
        
        monthly_revenue.reverse()  # Show chronological order
        
        # Get popular routes (top 5) - simplified for now
        try:
            from backend.database.models.schedule import Schedule
            from backend.database.models.location import Location
            from sqlalchemy.orm import aliased
            
            source_loc = aliased(Location)
            dest_loc = aliased(Location)
            
            popular_routes_result = await db.execute(
                select(
                    func.concat(source_loc.name, ' → ', dest_loc.name).label('route'),
                    func.count(Booking.id).label('count')
                )
                .join(Schedule, Booking.schedule_id == Schedule.id)
                .join(source_loc, Schedule.source_id == source_loc.id)
                .join(dest_loc, Schedule.destination_id == dest_loc.id)
                .group_by('route')
                .order_by(func.count(Booking.id).desc())
                .limit(5)
            )
            popular_routes = [{"route": route, "count": count} for route, count in popular_routes_result.fetchall()]
        except Exception as e:
            # Fallback to empty list if routes query fails
            popular_routes = []
        
        # Calculate growth rates (current month vs previous month)
        current_month_start = datetime.now().replace(day=1)
        previous_month_start = (current_month_start - timedelta(days=1)).replace(day=1)
        previous_month_end = current_month_start - timedelta(days=1)
        
        # Revenue growth
        current_month_revenue_result = await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                and_(
                    Payment.status == "COMPLETED",
                    Payment.created_at >= current_month_start
                )
            )
        )
        current_month_revenue = float(current_month_revenue_result.scalar() or 0)
        
        previous_month_revenue_result = await db.execute(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                and_(
                    Payment.status == "COMPLETED",
                    Payment.created_at >= previous_month_start,
                    Payment.created_at <= previous_month_end
                )
            )
        )
        previous_month_revenue = float(previous_month_revenue_result.scalar() or 1)  # Avoid division by zero
        
        revenue_growth = ((current_month_revenue - previous_month_revenue) / previous_month_revenue) * 100 if previous_month_revenue > 0 else 0
        
        # User growth
        current_month_users_result = await db.execute(
            select(func.count(User.id)).where(User.created_at >= current_month_start)
        )
        current_month_users = current_month_users_result.scalar()
        
        previous_month_users_result = await db.execute(
            select(func.count(User.id)).where(
                and_(
                    User.created_at >= previous_month_start,
                    User.created_at <= previous_month_end
                )
            )
        )
        previous_month_users = previous_month_users_result.scalar() or 1  # Avoid division by zero
        
        user_growth = ((current_month_users - previous_month_users) / previous_month_users) * 100 if previous_month_users > 0 else 0
        
        # Get average rating (if feedback table exists)
        try:
            avg_rating_result = await db.execute(
                text("SELECT AVG(rating) FROM feedbacks WHERE rating IS NOT NULL")
            )
            avg_rating = float(avg_rating_result.scalar() or 4.5)
        except:
            avg_rating = 4.5  # Default rating if no feedback table
        
        return {
            "totalBookings": total_bookings,
            "totalRevenue": float(total_revenue),
            "activeUsers": active_users,
            "activeTrips": active_trips,
            "totalVehicles": total_vehicles,
            "totalOperators": total_operators,
            "recentBookings": recent_bookings,
            "avgRating": avg_rating,
            "revenueGrowth": revenue_growth,
            "userGrowth": user_growth,
            "completedBookings": booking_status_stats.get("CONFIRMED", 0),
            "cancelledBookings": booking_status_stats.get("CANCELLED", 0),
            "monthlyRevenue": monthly_revenue,
            "popularRoutes": popular_routes,
            "vehicleUtilization": [{"vehicle_type": k, "utilization": v} for k, v in vehicle_type_stats.items()],
            "bookingStatusStats": booking_status_stats,
            "vehicleTypeStats": vehicle_type_stats,
            "lastUpdated": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching admin statistics: {str(e)}"
        )

# User Management
@router.get("/users", response_model=List[UserOut])
async def get_all_users(
    skip: int = 0,
    limit: int = 500,  # default limit 500
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get all users with optional search"""
    query = select(User)
    
    if search:
        query = query.where(
            User.name.ilike(f"%{search}%") | 
            User.email.ilike(f"%{search}%")
        )
    
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()
    
    return users

@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    result = await db.execute(select(User).where(User.id == user_id))
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")

    # Apply validated fields from UserUpdate if present
    data = {}
    try:
        data = UserUpdate(**{k: v for k, v in payload.items() if k in UserUpdate.model_fields}).dict(exclude_unset=True)
    except Exception:
        # If validation fails on some fields, continue with best-effort for allowed fields
        data = {k: v for k, v in payload.items() if k in UserUpdate.model_fields}

    for k, v in data.items():
        setattr(db_user, k, v)

    # Allow toggling admin role explicitly when provided
    if 'is_admin' in payload:
        db_user.is_admin = bool(payload['is_admin'])

    await db.commit()
    # Remove problematic refresh call
    return {"success": True, "message": "User updated", "user_id": user_id}

@router.post("/users/{user_id}/promote")
async def promote_user_to_admin(
    user_id: int,
    return_token: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Promote a user to admin; optionally return a fresh admin JWT so they can access admin immediately."""
    result = await db.execute(select(User).where(User.id == user_id))
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")
    db_user.is_admin = True
    db_user.is_active = True
    await db.commit()
    if return_token:
        # Issue token with admin claim; subject is the user's email
        token = create_access_token({"sub": db_user.email, "is_admin": True})
        return {"message": "User promoted to admin", "access_token": token, "token_type": "bearer"}
    return {"message": "User promoted to admin"}

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    result = await db.execute(select(User).where(User.id == user_id))
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="User not found")
    await db.delete(db_user)
    await db.commit()
    return {"message": "User deleted"}

@router.get("/bookings")  
async def get_all_bookings(
    skip: int = 0,
    limit: int = 500,  # default limit 500
    status: Optional[str] = None,
    user_id: Optional[int] = None,
    vehicle_id: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get all bookings with comprehensive details"""
    from backend.database.models.location import Location
    from sqlalchemy.orm import selectinload
    
    # Build base query with all related data
    query = select(Booking).options(
        selectinload(Booking.user),
        selectinload(Booking.vehicle),
        selectinload(Booking.schedule),
        selectinload(Booking.payment)
    )
    
    # Apply filters
    if status:
        query = query.where(Booking.status == status)
    if user_id:
        query = query.where(Booking.user_id == user_id)
    if vehicle_id:
        query = query.where(Booking.transport_id == vehicle_id)
    if start_date:
        query = query.where(Booking.travel_date >= start_date)
    if end_date:
        query = query.where(Booking.travel_date <= end_date)
    
    # Order by most recent first
    query = query.order_by(Booking.created_at.desc())
    
    # Apply pagination
    query = query.offset(skip).limit(limit)
    
    result = await db.execute(query)
    bookings = result.scalars().all()
    
    # Format response with comprehensive details
    booking_data = []
    for booking in bookings:
        # Get user details
        user_info = {
            "id": booking.user.id if booking.user else None,
            "name": booking.user.name if booking.user else "Unknown",
            "email": booking.user.email if booking.user else "Unknown",
            "phone": booking.user.phone if booking.user else "Unknown"
        }
        
        # Get vehicle details
        vehicle_info = {
            "id": booking.vehicle.id if booking.vehicle else None,
            "vehicle_number": booking.vehicle.vehicle_number if booking.vehicle else "Unknown",
            "vehicle_type": booking.vehicle.vehicle_type.value if booking.vehicle else "Unknown",
            "total_seats": booking.vehicle.total_seats if booking.vehicle else 0
        }
        
        # Get schedule details with locations
        schedule_info = {}
        if booking.schedule:
            # Get source and destination locations
            source_query = select(Location).where(Location.id == booking.schedule.source_id)
            dest_query = select(Location).where(Location.id == booking.schedule.destination_id)
            
            source_result = await db.execute(source_query)
            dest_result = await db.execute(dest_query)
            
            source_location = source_result.scalar_one_or_none()
            dest_location = dest_result.scalar_one_or_none()
            
            schedule_info = {
                "id": booking.schedule.id,
                "source": source_location.name if source_location else "Unknown",
                "destination": dest_location.name if dest_location else "Unknown",
                "departure_time": str(booking.schedule.departure_time),
                "arrival_time": str(booking.schedule.arrival_time),
                "duration": booking.schedule.duration
            }
        
        # Get payment details (single payment relation)
        payment_info = []
        if getattr(booking, 'payment', None):
            p = booking.payment
            payment_info.append({
                "id": p.id,
                "amount": float(p.final_amount if getattr(p, 'final_amount', None) is not None else p.amount),
                "payment_method": p.method.value if hasattr(p, 'method') and hasattr(p.method, 'value') else getattr(p, 'payment_method', None),
                "status": p.status.value if hasattr(p, 'status') and hasattr(p.status, 'value') else getattr(p, 'status', None),
                "transaction_id": p.transaction_id,
                "created_at": p.created_at.isoformat() if getattr(p, 'created_at', None) else None
            })
        
        # Format passenger details
        passenger_details = []
        if booking.passenger_details:
            for passenger in booking.passenger_details:
                if isinstance(passenger, dict):
                    passenger_details.append({
                        "name": passenger.get("name", "Unknown"),
                        "age": passenger.get("age", 0),
                        "gender": passenger.get("gender", "Unknown"),
                        "seat_number": passenger.get("seat_number", 0)
                    })
        
        booking_data.append({
            "id": booking.id,
            "pnr": booking.pnr,
            "status": booking.status,
            "total_price": float(booking.total_price),
            "seats": booking.seats,
            "seat_class": booking.seat_class,
            "booking_date": booking.booking_date.isoformat() if booking.booking_date else None,
            "travel_date": booking.travel_date.isoformat() if booking.travel_date else None,
            "expires_at": booking.expires_at.isoformat() if booking.expires_at else None,
            "created_at": booking.created_at.isoformat() if booking.created_at else None,
            "updated_at": booking.updated_at.isoformat() if booking.updated_at else None,
            # Flattened fields for admin UI convenience
            "user_name": user_info.get("name"),
            "vehicle_number": vehicle_info.get("vehicle_number"),
            "source": schedule_info.get("source") if schedule_info else None,
            "destination": schedule_info.get("destination") if schedule_info else None,
            "route": (f"{schedule_info.get('source')} → {schedule_info.get('destination')}" if schedule_info else None),
            "user": user_info,
            "vehicle": vehicle_info,
            "schedule": schedule_info,
            "passenger_details": passenger_details,
            "payments": payment_info
        })
    
    # Get total count for pagination
    count_query = select(func.count(Booking.id))
    if status:
        count_query = count_query.where(Booking.status == status)
    if user_id:
        count_query = count_query.where(Booking.user_id == user_id)
    if vehicle_id:
        count_query = count_query.where(Booking.transport_id == vehicle_id)
    if start_date:
        count_query = count_query.where(Booking.travel_date >= start_date)
    if end_date:
        count_query = count_query.where(Booking.travel_date <= end_date)
    
    count_result = await db.execute(count_query)
    total_count = count_result.scalar()
    
    return {
        "bookings": booking_data,
        "total_count": total_count,
        "page": (skip // limit) + 1,
        "limit": limit,
        "has_next": skip + limit < total_count
    }

@router.get("/bookings/analytics")
async def get_booking_analytics(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get detailed booking analytics for admin dashboard"""
    from backend.database.models.location import Location
    
    # Date range for analytics
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    # Booking trends by date
    daily_bookings_query = select(
        func.date(Booking.created_at).label('booking_date'),
        func.count(Booking.id).label('count'),
        func.sum(Booking.total_price).label('revenue')
    ).where(
        Booking.created_at >= start_date
    ).group_by(
        func.date(Booking.created_at)
    ).order_by(
        func.date(Booking.created_at)
    )
    
    daily_bookings_result = await db.execute(daily_bookings_query)
    daily_trends = []
    for row in daily_bookings_result:
        daily_trends.append({
            "date": row.booking_date.isoformat(),
            "bookings": row.count,
            "revenue": float(row.revenue or 0)
        })
    
    # Top routes by booking count
    top_routes_query = select(
        Schedule.source_id,
        Schedule.destination_id,
        func.count(Booking.id).label('booking_count'),
        func.sum(Booking.total_price).label('total_revenue')
    ).join(
        Schedule, Booking.schedule_id == Schedule.id
    ).where(
        Booking.created_at >= start_date
    ).group_by(
        Schedule.source_id, Schedule.destination_id
    ).order_by(
        func.count(Booking.id).desc()
    ).limit(10)
    
    top_routes_result = await db.execute(top_routes_query)
    top_routes = []
    for row in top_routes_result:
        # Get location names
        source_query = select(Location).where(Location.id == row.source_id)
        dest_query = select(Location).where(Location.id == row.destination_id)
        
        source_result = await db.execute(source_query)
        dest_result = await db.execute(dest_query)
        
        source_location = source_result.scalar_one_or_none()
        dest_location = dest_result.scalar_one_or_none()
        
        top_routes.append({
            "source": source_location.name if source_location else "Unknown",
            "destination": dest_location.name if dest_location else "Unknown",
            "booking_count": row.booking_count,
            "total_revenue": float(row.total_revenue or 0)
        })
    
    # Booking status breakdown
    status_breakdown_query = select(
        Booking.status,
        func.count(Booking.id).label('count'),
        func.sum(Booking.total_price).label('revenue')
    ).where(
        Booking.created_at >= start_date
    ).group_by(
        Booking.status
    )
    
    status_breakdown_result = await db.execute(status_breakdown_query)
    status_breakdown = []
    for row in status_breakdown_result:
        status_breakdown.append({
            "status": row.status,
            "count": row.count,
            "revenue": float(row.revenue or 0)
        })
    
    # Vehicle type performance
    vehicle_performance_query = select(
        Vehicle.vehicle_type,
        func.count(Booking.id).label('booking_count'),
        func.sum(Booking.total_price).label('total_revenue'),
        func.avg(Booking.total_price).label('avg_booking_value')
    ).join(
        Vehicle, Booking.transport_id == Vehicle.id
    ).where(
        Booking.created_at >= start_date
    ).group_by(
        Vehicle.vehicle_type
    )
    
    vehicle_performance_result = await db.execute(vehicle_performance_query)
    vehicle_performance = []
    for row in vehicle_performance_result:
        vehicle_performance.append({
            "vehicle_type": row.vehicle_type.value,
            "booking_count": row.booking_count,
            "total_revenue": float(row.total_revenue or 0),
            "avg_booking_value": float(row.avg_booking_value or 0)
        })
    
    # Seat class popularity
    seat_class_query = select(
        Booking.seat_class,
        func.count(Booking.id).label('count'),
        func.sum(Booking.total_price).label('revenue')
    ).where(
        Booking.created_at >= start_date
    ).group_by(
        Booking.seat_class
    ).order_by(
        func.count(Booking.id).desc()
    )
    
    seat_class_result = await db.execute(seat_class_query)
    seat_class_stats = []
    for row in seat_class_result:
        seat_class_stats.append({
            "seat_class": row.seat_class,
            "count": row.count,
            "revenue": float(row.revenue or 0)
        })
    
    return {
        "period_days": days,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily_trends": daily_trends,
        "top_routes": top_routes,
        "status_breakdown": status_breakdown,
        "vehicle_performance": vehicle_performance,
        "seat_class_stats": seat_class_stats
    }

# Operator Management  
@router.get("/operators")
async def get_operators(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get all operators"""
    result = await db.execute(select(Operator))
    operators = result.scalars().all()
    return operators

@router.post("/operators")
async def create_operator(
    operator_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Create a new operator"""
    db_operator = Operator(
        name=operator_data["name"],
        contact_email=operator_data["contact_email"],
        phone=operator_data["phone"],
        address=operator_data.get("address"),
        license_number=operator_data.get("license_number")
    )
    
    db.add(db_operator)
    await db.commit()
    # Remove problematic refresh call
    
    return {
        "success": True,
        "message": "Operator created successfully",
        "name": operator_data["name"],
        "contact_email": operator_data["contact_email"]
    }

# Locations for dropdowns
@router.get("/locations")
async def get_locations(
    location_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get all locations for dropdowns"""
    from backend.database.models.location import Location
    
    query = select(Location).where(Location.is_active == True)
    
    if location_type:
        query = query.where(Location.location_type == location_type)
    
    query = query.order_by(Location.name)
    result = await db.execute(query)
    locations = result.scalars().all()
    
    return [
        {
            "id": loc.id,
            "name": loc.name,
            "code": loc.code,
            "city": loc.city,
            "location_type": loc.location_type,
            "full_name": f"{loc.name}, {loc.city}"
        }
        for loc in locations
    ]

# Debug endpoint to check database content
@router.get("/debug/database-status")
async def debug_database_status(db: AsyncSession = Depends(get_db)):
    """Debug endpoint to check database content"""
    try:
        from backend.database.models.location import Location
        
        # Check counts
        schedules_count = await db.execute(select(func.count(Schedule.id)))
        vehicles_count = await db.execute(select(func.count(Vehicle.id)))
        locations_count = await db.execute(select(func.count(Location.id)))
        
        # Get sample data
        sample_schedules = await db.execute(
            select(Schedule, Vehicle, Location)
            .join(Vehicle, Schedule.vehicle_id == Vehicle.id)
            .join(Location, Schedule.source_id == Location.id)
            .limit(3)
        )
        
        return {
            "database_status": "connected",
            "counts": {
                "schedules": schedules_count.scalar(),
                "vehicles": vehicles_count.scalar(),
                "locations": locations_count.scalar()
            },
            "sample_schedules": [
                {
                    "schedule_id": row[0].id,
                    "vehicle_number": row[1].vehicle_number,
                    "vehicle_type": row[1].vehicle_type.value,
                    "source_location": row[2].name,
                    "departure_time": row[0].departure_time.strftime("%H:%M"),
                    "arrival_time": row[0].arrival_time.strftime("%H:%M")
                }
                for row in sample_schedules.fetchall()
            ]
        }
    except Exception as e:
        return {
            "database_status": "error",
            "error": str(e)
        }

@router.get("/vehicles/numbers")
async def get_vehicle_numbers(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get all vehicle numbers for debugging (Admin only)"""
    result = await db.execute(select(Vehicle.vehicle_number, Vehicle.id))
    vehicles = result.fetchall()
    return {"vehicle_numbers": [{"id": v.id, "number": v.vehicle_number} for v in vehicles]}

@router.get("/bookings/{booking_id}")
async def get_booking_by_id(
    booking_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get detailed booking information by ID"""
    from backend.database.models.location import Location
    from sqlalchemy.orm import selectinload
    
    # Get booking with all related data
    query = select(Booking).options(
        selectinload(Booking.user),
        selectinload(Booking.vehicle),
        selectinload(Booking.schedule),
        selectinload(Booking.payment)
    ).where(Booking.id == booking_id)
    
    result = await db.execute(query)
    booking = result.scalar_one_or_none()
    
    if not booking:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Booking not found"
        )
    
    # Get schedule details with locations
    schedule_info = {}
    if booking.schedule:
        source_query = select(Location).where(Location.id == booking.schedule.source_id)
        dest_query = select(Location).where(Location.id == booking.schedule.destination_id)
        
        source_result = await db.execute(source_query)
        dest_result = await db.execute(dest_query)
        
        source_location = source_result.scalar_one_or_none()
        dest_location = dest_result.scalar_one_or_none()
        
        schedule_info = {
            "id": booking.schedule.id,
            "source": {
                "id": source_location.id if source_location else None,
                "name": source_location.name if source_location else "Unknown",
                "code": source_location.code if source_location else "Unknown"
            },
            "destination": {
                "id": dest_location.id if dest_location else None,
                "name": dest_location.name if dest_location else "Unknown",
                "code": dest_location.code if dest_location else "Unknown"
            },
            "departure_time": str(booking.schedule.departure_time),
            "arrival_time": str(booking.schedule.arrival_time),
            "duration": booking.schedule.duration
        }
    
    # Format response
    return {
        "id": booking.id,
        "pnr": booking.pnr,
        "status": booking.status,
        "total_price": float(booking.total_price),
        "seats": booking.seats,
        "seat_class": booking.seat_class,
        "booking_date": booking.booking_date.isoformat() if booking.booking_date else None,
        "travel_date": booking.travel_date.isoformat() if booking.travel_date else None,
        "expires_at": booking.expires_at.isoformat() if booking.expires_at else None,
        "created_at": booking.created_at.isoformat() if booking.created_at else None,
        "updated_at": booking.updated_at.isoformat() if booking.updated_at else None,
        "user": {
            "id": booking.user.id if booking.user else None,
            "name": booking.user.name if booking.user else "Unknown",
            "email": booking.user.email if booking.user else "Unknown",
            "phone": booking.user.phone if booking.user else "Unknown"
        },
        "vehicle": {
            "id": booking.vehicle.id if booking.vehicle else None,
            "vehicle_number": booking.vehicle.vehicle_number if booking.vehicle else "Unknown",
            "vehicle_type": (
                booking.vehicle.vehicle_type.value
                if booking.vehicle and hasattr(booking.vehicle.vehicle_type, 'value')
                else (booking.vehicle.vehicle_type if booking.vehicle else "Unknown")
            ),
            "total_seats": booking.vehicle.total_seats if booking.vehicle else 0
        },
        "schedule": schedule_info,
        "passenger_details": booking.passenger_details or [],
        "payments": (
            [
                {
                    "id": booking.payment.id,
                    "amount": float(booking.payment.final_amount if getattr(booking.payment, 'final_amount', None) is not None else booking.payment.amount),
                    "payment_method": booking.payment.method.value if hasattr(booking.payment, 'method') and hasattr(booking.payment.method, 'value') else getattr(booking.payment, 'payment_method', None),
                    "status": booking.payment.status.value if hasattr(booking.payment, 'status') and hasattr(booking.payment.status, 'value') else getattr(booking.payment, 'status', None),
                    "transaction_id": booking.payment.transaction_id,
                    "created_at": booking.payment.created_at.isoformat() if getattr(booking.payment, 'created_at', None) else None
                }
            ]
            if getattr(booking, 'payment', None) else []
        )
    }

@router.put("/bookings/{booking_id}/status")
async def update_booking_status(
    booking_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Update booking status (Admin only)"""
    from backend.models.booking import BookingStatus
    
    # Extract and validate status
    new_status = payload.get("status") if isinstance(payload, dict) else None
    if not new_status:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Missing status")
    valid_statuses = [status.value for status in BookingStatus]
    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Valid options: {valid_statuses}"
        )
    
    # Get booking
    query = select(Booking).where(Booking.id == booking_id)
    result = await db.execute(query)
    booking = result.scalar_one_or_none()
    
    if not booking:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail="Booking not found"
        )
    
    # Update status
    old_status = booking.status
    booking.status = new_status
    booking.updated_at = datetime.now()
    
    await db.commit()
    
    return {
        "message": f"Booking status updated from {old_status} to {new_status}",
        "booking_id": booking_id,
        "old_status": old_status,
        "new_status": new_status,
        "updated_at": booking.updated_at.isoformat()
    }

@router.get("/bookings/export/csv")
async def export_bookings_csv(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Export bookings as CSV data"""
    from fastapi.responses import Response
    from backend.database.models.location import Location
    import csv
    import io
    
    # Build query
    query = select(Booking).join(User).join(Vehicle).join(Schedule)
    
    if status:
        query = query.where(Booking.status == status)
    if start_date:
        query = query.where(Booking.travel_date >= start_date)
    if end_date:
        query = query.where(Booking.travel_date <= end_date)
    
    query = query.order_by(Booking.created_at.desc())
    result = await db.execute(query)
    bookings = result.scalars().all()
    
    # Create CSV content
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        'Booking ID', 'PNR', 'Status', 'User Name', 'User Email', 'User Phone',
        'Vehicle Number', 'Vehicle Type', 'Source', 'Destination',
        'Departure Time', 'Arrival Time', 'Travel Date', 'Seat Class',
        'Seats', 'Total Price', 'Booking Date', 'Created At'
    ])
    
    # Write data
    for booking in bookings:
        # Get location names
        source_name = "Unknown"
        dest_name = "Unknown"
        
        if booking.schedule:
            source_query = select(Location).where(Location.id == booking.schedule.source_id)
            dest_query = select(Location).where(Location.id == booking.schedule.destination_id)
            
            source_result = await db.execute(source_query)
            dest_result = await db.execute(dest_query)
            
            source_location = source_result.scalar_one_or_none()
            dest_location = dest_result.scalar_one_or_none()
            
            source_name = source_location.name if source_location else "Unknown"
            dest_name = dest_location.name if dest_location else "Unknown"
        
        writer.writerow([
            booking.id,
            booking.pnr or '',
            booking.status,
            booking.user.name if booking.user else 'Unknown',
            booking.user.email if booking.user else 'Unknown',
            booking.user.phone if booking.user else 'Unknown',
            booking.vehicle.vehicle_number if booking.vehicle else 'Unknown',
            booking.vehicle.vehicle_type.value if booking.vehicle else 'Unknown',
            source_name,
            dest_name,
            str(booking.schedule.departure_time) if booking.schedule else '',
            str(booking.schedule.arrival_time) if booking.schedule else '',
            booking.travel_date.strftime('%Y-%m-%d') if booking.travel_date else '',
            booking.seat_class,
            ', '.join(map(str, booking.seats)) if booking.seats else '',
            float(booking.total_price),
            booking.booking_date.strftime('%Y-%m-%d %H:%M:%S') if booking.booking_date else '',
            booking.created_at.strftime('%Y-%m-%d %H:%M:%S') if booking.created_at else ''
        ])
    
    # Return CSV response
    csv_content = output.getvalue()
    output.close()
    
    filename = f"bookings_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
