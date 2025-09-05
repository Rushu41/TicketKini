from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, case, text, cast, Float
from sqlalchemy.orm import joinedload, aliased
from datetime import datetime, date, time, timedelta
from typing import List, Optional

from backend.database.database import get_db
from backend.database.models.vehicle import Vehicle, VehicleTypeEnum
from backend.database.models.schedule import Schedule
from backend.database.models.location import Location
from backend.database.models.operator import Operator
from backend.database.models.booking import Booking
from backend.models.search import SearchRequest, SearchResponse, TripResult, SeatClass
from backend.models.vehicle import VehicleType
from backend.middleware.logger import log_search_action

router = APIRouter()

@router.get("/search", response_model=SearchResponse)
async def search_trips(
    source: str = Query(..., description="Source location code or name"),
    destination: str = Query(..., description="Destination location code or name"),
    travel_date: date = Query(..., description="Travel date (YYYY-MM-DD)"),
    vehicle_type: Optional[str] = Query(None, description="Vehicle type filter"),
    seat_class: Optional[str] = Query(None, description="Seat class filter"),
    operator_id: Optional[int] = Query(None, description="Operator filter"),
    min_price: Optional[float] = Query(None, ge=0, description="Minimum price filter"),
    max_price: Optional[float] = Query(None, ge=0, description="Maximum price filter"),
    departure_time_start: Optional[str] = Query(None, description="Earliest departure time (HH:MM)"),
    departure_time_end: Optional[str] = Query(None, description="Latest departure time (HH:MM)"),
    sort_by: str = Query("departure_time", description="Sort by: price, departure_time, duration, rating"),
    sort_order: str = Query("asc", description="Sort order: asc, desc"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(50, ge=1, le=1000, description="Results per page"),
    db: AsyncSession = Depends(get_db)
):
    """Search for available trips based on criteria"""
    # Defensive check for empty source/destination
    if not source or not source.strip() or not destination or not destination.strip():
        raise HTTPException(status_code=400, detail="Source and destination must be provided.")
    
    # Convert string vehicle_type to enum if provided
    vehicle_type_enum = None
    if vehicle_type:
        try:
            vehicle_type_enum = VehicleTypeEnum(vehicle_type.upper())
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid vehicle type '{vehicle_type}'. Valid options: bus, train, plane"
            )
    
    # Convert string seat_class to enum if provided
    seat_class_enum = None
    if seat_class:
        try:
            seat_class_enum = SeatClass(seat_class.upper())
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid seat class '{seat_class}'. Valid options: economy, business, first, premium_economy, sleeper, seater"
            )

    
    # Get source and destination location IDs
    source_location = await get_location_by_code_or_name(db, source)
    dest_location = await get_location_by_code_or_name(db, destination)
    
    if not source_location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source location '{source}' not found"
        )
    
    if not dest_location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Destination location '{destination}' not found"
        )
    
    # Validate that location types match vehicle type if specified
    if vehicle_type_enum:
        expected_location_type = None
        if vehicle_type_enum == VehicleTypeEnum.BUS:
            expected_location_type = "bus_station"
        elif vehicle_type_enum == VehicleTypeEnum.TRAIN:
            expected_location_type = "train_station"
        elif vehicle_type_enum == VehicleTypeEnum.PLANE:
            expected_location_type = "airport"
        
        if expected_location_type:
            if source_location.location_type != expected_location_type:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Source location '{source}' is not compatible with {vehicle_type_enum.value} travel. Expected {expected_location_type} but got {source_location.location_type}."
                )
            
            if dest_location.location_type != expected_location_type:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Destination location '{destination}' is not compatible with {vehicle_type_enum.value} travel. Expected {expected_location_type} but got {dest_location.location_type}."
                )
    
    # Debug logging
    print(f"Search request - source: {source} ({source_location.location_type}), destination: {destination} ({dest_location.location_type}), vehicle_type: {vehicle_type_enum}, date: {travel_date}")
    print(f"Source location ID: {source_location.id}, Destination location ID: {dest_location.id}")

    # Build base query
    SourceLoc = aliased(Location)
    DestLoc = aliased(Location)
    query = select(
        Schedule,
        Vehicle,
        Operator,
        SourceLoc,
        DestLoc
    ).select_from(
        Schedule
    ).join(
        Vehicle, Schedule.vehicle_id == Vehicle.id
    ).join(
        Operator, Vehicle.operator_id == Operator.id
    ).join(
        SourceLoc, Schedule.source_id == SourceLoc.id
    ).join(
        DestLoc, Schedule.destination_id == DestLoc.id
    ).where(
        and_(
            Schedule.source_id == source_location.id,
            Schedule.destination_id == dest_location.id,
            Schedule.is_active == 1,
            Vehicle.is_active == True
        )
    )

    
    
    # Add filter to hide past schedules for today's date
    # if travel_date == date.today():
    #     query = query.where(Schedule.arrival_time > datetime.now().time())
    
    # Apply filters
    if vehicle_type_enum is not None:
        query = query.where(Vehicle.vehicle_type == vehicle_type_enum)
    
    if operator_id is not None:
        query = query.where(Vehicle.operator_id == operator_id)
    
    if seat_class_enum is not None:
        query = query.where(Vehicle.class_prices.has_key(seat_class_enum.value))
    
    if min_price or max_price:
        price_conditions = []
        if min_price:
            if seat_class_enum:
                price_conditions.append(
                    cast(Vehicle.class_prices[seat_class_enum.value], Float) >= min_price
                )
            else:
                # Check minimum price across all classes
                price_conditions.append(
                    func.jsonb_path_query_array(
                        Vehicle.class_prices, '$.*'
                    ).op('?|')([str(min_price)])
                )
        
        if max_price:
            if seat_class_enum:
                price_conditions.append(
                    cast(Vehicle.class_prices[seat_class_enum.value], Float) <= max_price
                )
            else:
                # Check maximum price across all classes
                price_conditions.append(
                    func.jsonb_path_query_array(
                        Vehicle.class_prices, '$.*'
                    ).op('?|')([str(max_price)])
                )
        
        if price_conditions:
            query = query.where(and_(*price_conditions))
    
    # Time filters
    if departure_time_start:
        start_time = datetime.strptime(departure_time_start, "%H:%M").time()
        query = query.where(Schedule.departure_time >= start_time)
    
    if departure_time_end:
        end_time = datetime.strptime(departure_time_end, "%H:%M").time()
        query = query.where(Schedule.departure_time <= end_time)
    
    # Get total count for pagination
    count_query = select(func.count("*")).select_from(query.alias())
    total_result = await db.execute(count_query)
    total_count = total_result.scalar() or 0
    
    # Apply sorting
    if sort_by == "price":
        if seat_class_enum:
            sort_expr = cast(Vehicle.class_prices[seat_class_enum.value], Float)
        else:
            # Sort by minimum price across all classes
            sort_expr = func.jsonb_path_query_first(
                Vehicle.class_prices, 'min($.*)'
            )
    elif sort_by == "departure_time":
        sort_expr = Schedule.departure_time
    elif sort_by == "duration":
        sort_expr = Schedule.duration
    elif sort_by == "rating":
        sort_expr = Vehicle.avg_rating
    else:
        sort_expr = Schedule.departure_time
    
    if sort_order == "desc":
        sort_expr = sort_expr.desc()
    
    query = query.order_by(sort_expr)
    
    # Apply pagination
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)
    
    # Execute query
    result = await db.execute(query)
    rows = result.fetchall()
    
    # Debug the query results
    print(f"Found {len(rows)} schedule results for {source} -> {destination} (vehicle_type={vehicle_type_enum})")
    if len(rows) == 0:
        # Let's check if there are any schedules for these locations at all
        debug_query = select(Schedule).where(
            or_(
                Schedule.source_id == source_location.id,
                Schedule.destination_id == dest_location.id
            )
        )
        debug_result = await db.execute(debug_query)
        debug_schedules = debug_result.scalars().all()
        print(f"Total schedules involving either location: {len(debug_schedules)}")
        
        # Check schedules with exact source/destination match
        exact_query = select(Schedule).where(
            and_(
                Schedule.source_id == source_location.id,
                Schedule.destination_id == dest_location.id
            )
        )
        exact_result = await db.execute(exact_query)
        exact_schedules = exact_result.scalars().all()
        print(f"Schedules with exact source/destination match: {len(exact_schedules)}")
    
    # Process results
    trips = []
    for row in rows:
        schedule, vehicle, operator, source_loc, dest_loc = row
        
        available_seats = await get_available_seats(
            db, vehicle.id, travel_date, seat_class_enum
        )
        
        departure_datetime = datetime.combine(travel_date, schedule.departure_time)
        arrival_datetime = datetime.combine(travel_date, schedule.arrival_time)
        if arrival_datetime < departure_datetime: # next day arrival
            arrival_datetime += timedelta(days=1)

        duration_seconds = (arrival_datetime - departure_datetime).total_seconds()
        hours, remainder = divmod(duration_seconds, 3600)
        minutes, _ = divmod(remainder, 60)
        duration_str = f"{int(hours)}h {int(minutes)}m"

        # Fix: rating should be a float, not a dict
        avg_rating = vehicle.avg_rating
        if isinstance(avg_rating, dict):
            rating = avg_rating.get('overall', 0.0)
        else:
            rating = float(avg_rating) if avg_rating is not None else 0.0
        
        # Fix: Ensure class_prices uses schedule base_price as primary source
        # Use schedule's base_price as the economy price, fallback to vehicle class_prices
        base_price = float(schedule.base_price) if hasattr(schedule, 'base_price') and schedule.base_price else 500.0
        
        class_prices = vehicle.class_prices or {}
        if isinstance(class_prices, dict):
            # Convert all prices to float to avoid serialization issues
            class_prices = {k: float(v) if v is not None else base_price for k, v in class_prices.items()}
        else:
            class_prices = {}
        
        # Ensure there's always an economy price using the schedule's base price
        if 'economy' not in class_prices:
            class_prices['economy'] = base_price
        else:
            # Override economy price with schedule's base price if available
            class_prices['economy'] = base_price
        
        # Fix: Ensure vehicle_number is a string
        vehicle_number = str(vehicle.vehicle_number) if vehicle.vehicle_number else ""
        
        # Fix: Ensure operator_name is a string
        operator_name = str(operator.name) if operator.name else ""
        
        # Fix: Ensure location names are strings
        source_name = str(source_loc.name) if source_loc.name else ""
        destination_name = str(dest_loc.name) if dest_loc.name else ""
        
        # Fix: Ensure amenities is a list of strings
        amenities = getattr(vehicle, 'facilities', None) or []
        if not isinstance(amenities, list):
            amenities = []
        amenities = [str(item) for item in amenities if item is not None]
        
        trip = TripResult(
            id=schedule.id,
            vehicle_id=vehicle.id,
            vehicle_number=vehicle_number,
            vehicle_type=vehicle.vehicle_type.value,
            operator_name=operator_name,
            operator_id=operator.id,
            source_name=source_name,
            destination_name=destination_name,
            departure_time=schedule.departure_time,
            arrival_time=schedule.arrival_time,
            duration=duration_str,
            travel_date=travel_date,
            class_prices=class_prices,
            available_seats=available_seats,
            total_seats=vehicle.total_seats or 0,
            amenities=amenities,
            rating=rating,
            total_reviews=getattr(vehicle, 'total_reviews', 0) or 0
        )
        
        trips.append(trip)
    
    log_search_action(
        source=source,
        destination=destination,
        travel_date=travel_date,
        results_count=len(trips),
        filters_applied={
            "vehicle_type": vehicle_type_enum.value if vehicle_type_enum else None,
            "seat_class": seat_class_enum.value if seat_class_enum else None,
            "operator_id": operator_id,
            "price_range": [min_price, max_price],
            "time_range": [departure_time_start, departure_time_end]
        }
    )
    
    return SearchResponse(
        trips=trips,
        total_count=total_count,
        page=page,
        limit=limit,
        has_next=offset + limit < total_count,
        has_previous=page > 1,
        search_params={
            "source": source,
            "destination": destination,
            "travel_date": travel_date.isoformat(),
            "filters": {
                "vehicle_type": vehicle_type_enum.value if vehicle_type_enum else None,
                "seat_class": seat_class_enum.value if seat_class_enum else None,
                "operator_id": operator_id,
                "price_range": [min_price, max_price]
            }
        }
    )

async def get_location_by_code_or_name(db: AsyncSession, identifier: str) -> Optional[Location]:
    # Try exact code match first
    query = select(Location).where(func.lower(Location.code) == identifier.lower())
    result = await db.execute(query)
    location = result.scalar_one_or_none()
    if location:
        return location
    # Fallback to ilike on name
    query = select(Location).where(Location.name.ilike(f"%{identifier}%"))
    result = await db.execute(query)
    return result.scalar_one_or_none()

async def get_available_seats(
    db: AsyncSession, 
    vehicle_id: int, 
    travel_date: date, 
    seat_class: Optional[SeatClass] = None
) -> dict:
    """Get available seats count by class for a vehicle on specific date"""
    
    vehicle_query = select(Vehicle).where(Vehicle.id == vehicle_id)
    vehicle_result = await db.execute(vehicle_query)
    vehicle = vehicle_result.scalar_one_or_none()
    
    if not vehicle:
        return {}
    
    booked_seats_query = select(Booking.seats).where(
        and_(
            Booking.transport_id == vehicle_id,
            func.date(Booking.travel_date) == travel_date,
            Booking.status.in_(["PENDING", "CONFIRMED"])
        )
    )
    booked_result = await db.execute(booked_seats_query)
    booked_bookings = booked_result.scalars().all()
    
    booked_seats = []
    for booking_seats in booked_bookings:
        if booking_seats:
            booked_seats.extend(booking_seats)
    
    seat_map = vehicle.seat_map or {}
    available_by_class = {}
    
    if seat_map and "classes" in seat_map:
        for class_name, seat_numbers in seat_map["classes"].items():
            # Only filter by seat class if a specific class is requested AND it matches
            if seat_class and class_name.upper() != seat_class.value.upper():
                continue
                
            total_class_seats = len(seat_numbers)
            booked_class_seats = len([s for s in booked_seats if s in seat_numbers])
            available_class_seats = total_class_seats - booked_class_seats
            
            available_by_class[class_name] = {
                "total": total_class_seats,
                "booked": booked_class_seats,
                "available": available_class_seats,
                "seat_numbers": [s for s in seat_numbers if s not in booked_seats]
            }
    
    return available_by_class

@router.get("/search/locations", response_model=List[dict])
async def search_locations(
    query: Optional[str] = Query(None, description="Search term for locations"),
    location_type: Optional[str] = Query(None, description="Filter by location type (bus_station, train_station, airport, terminal)"),
    vehicle_type: Optional[str] = Query(None, description="Filter by vehicle type (bus, train, plane)"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results"),
    db: AsyncSession = Depends(get_db)
):
    """Search for locations by name, code, or type"""
    
    # Start building the query
    search_query = select(Location).where(Location.is_active == True)
    
    # Map vehicle types to location types
    if vehicle_type:
        if vehicle_type.lower() == 'bus':
            location_type = 'bus_station'
        elif vehicle_type.lower() == 'train':
            location_type = 'train_station'
        elif vehicle_type.lower() == 'plane':
            location_type = 'airport'
    
    # Apply location type filter
    if location_type:
        search_query = search_query.where(Location.location_type == location_type)
    
    # Apply search query filter if provided
    if query and len(query.strip()) >= 2:
        search_query = search_query.where(
            or_(
                Location.name.ilike(f"%{query.strip()}%"),
                Location.code.ilike(f"%{query.strip()}%"),
                Location.city.ilike(f"%{query.strip()}%")
            )
        )
    
    # Order by major hubs first, then by name
    search_query = search_query.order_by(
        Location.is_major_hub.desc(),
        Location.name.asc()
    ).limit(limit)
    
    result = await db.execute(search_query)
    locations = result.scalars().all()
    
    # Debug logging
    print(f"Location search - query: '{query}', vehicle_type: {vehicle_type}, location_type: {location_type}, found: {len(locations)} locations")
    
    return [
        {
            "id": loc.id,
            "name": str(loc.name) if loc.name else "",
            "code": str(loc.code) if loc.code else "",
            "city": str(loc.city) if loc.city else "",
            "location_type": str(loc.location_type) if loc.location_type else "",
            "full_name": f"{str(loc.name) if loc.name else ''}, {str(loc.city) if loc.city else ''}",
            "is_major_hub": bool(loc.is_major_hub) if loc.is_major_hub is not None else False
        }
        for loc in locations
    ]

@router.get("/search/operators", response_model=List[dict])
async def get_operators(
    source: Optional[str] = Query(None, description="Source location filter"),
    destination: Optional[str] = Query(None, description="Destination location filter"),
    vehicle_type: Optional[VehicleTypeEnum] = Query(None, description="Vehicle type filter"),
    db: AsyncSession = Depends(get_db)
):
    """Get list of operators with optional filters"""
    
    query = select(Operator).distinct()
    
    if source or destination or vehicle_type:
        query = query.join(Vehicle, Operator.id == Vehicle.operator_id)
        query = query.join(Schedule, Vehicle.id == Schedule.vehicle_id)
        
        if source:
            source_loc = await get_location_by_code_or_name(db, source)
            if source_loc:
                query = query.where(Schedule.source_id == source_loc.id)
        
        if destination:
            dest_loc = await get_location_by_code_or_name(db, destination)
            if dest_loc:
                query = query.where(Schedule.destination_id == dest_loc.id)
        
        if vehicle_type:
            query = query.where(Vehicle.vehicle_type == vehicle_type)
    
    query = query.where(Operator.is_active == True)
    result = await db.execute(query)
    operators = result.scalars().all()
    
    return [
        {
            "id": op.id,
            "name": str(op.name) if op.name else "",
            "rating": float(op.avg_rating) if op.avg_rating is not None else 0.0,
            "total_vehicles": 0
        }
        for op in operators
    ]

@router.get("/search/popular-routes", response_model=List[dict])
async def get_popular_routes(
    limit: int = Query(10, ge=1, le=20, description="Number of popular routes"),
    db: AsyncSession = Depends(get_db)
):
    """Get popular routes based on booking frequency"""
    
    return [
        {"source": {"name": "Dhaka"}, "destination": {"name": "Chittagong"}},
        {"source": {"name": "Chittagong"}, "destination": {"name": "Dhaka"}},
        {"source": {"name": "Dhaka"}, "destination": {"name": "Sylhet"}},
    ]


@router.get("/search/filters", response_model=dict)
async def get_search_filters(
    source: Optional[str] = Query(None, description="Source location"),
    destination: Optional[str] = Query(None, description="Destination location"),
    travel_date: Optional[date] = Query(None, description="Travel date"),
    db: AsyncSession = Depends(get_db)
):
    """Get available filter options for search results"""
    
    base_query = select(Vehicle, Schedule, Operator).join(
        Schedule, Vehicle.id == Schedule.vehicle_id
    ).join(
        Operator, Vehicle.operator_id == Operator.id
    ).where(
        and_(
            Vehicle.is_active == True,
            Schedule.is_active == 1
        )
    )
    
    if source:
        source_loc = await get_location_by_code_or_name(db, source)
        if source_loc:
            base_query = base_query.where(Schedule.source_id == source_loc.id)
    
    if destination:
        dest_loc = await get_location_by_code_or_name(db, destination)
        if dest_loc:
            base_query = base_query.where(Schedule.destination_id == dest_loc.id)
    
    result = await db.execute(base_query)
    rows = result.fetchall()
    
    vehicle_types = set()
    operators = {}
    seat_classes = set()
    price_range = {"min": float('inf'), "max": 0}
    
    for vehicle, schedule, operator in rows:
        # Ensure vehicle_type is properly serialized
        vehicle_type_value = vehicle.vehicle_type.value if hasattr(vehicle.vehicle_type, 'value') else str(vehicle.vehicle_type)
        vehicle_types.add(vehicle_type_value)
        
        # Ensure operator info is properly serialized
        operator_name = str(operator.name) if operator.name else ""
        operators[operator.id] = operator_name
        
        class_prices = getattr(vehicle, "class_prices", None)
        if class_prices is not None and isinstance(class_prices, dict):
            for class_name, price in class_prices.items():
                class_name_str = str(class_name) if class_name else ""
                seat_classes.add(class_name_str)
                try:
                    price_val = float(price) if price is not None else 0.0
                    price_range["min"] = min(price_range["min"], price_val)
                    price_range["max"] = max(price_range["max"], price_val)
                except (ValueError, TypeError):
                    # Skip invalid price values
                    pass
    
    if price_range["min"] == float('inf'):
        price_range = {"min": 0, "max": 0}
    
    return {
        "vehicle_types": list(vehicle_types),
        "operators": [{"id": k, "name": v} for k, v in operators.items()],
        "seat_classes": list(seat_classes),
        "price_range": price_range,
        "departure_times": [
            {"label": "Early Morning", "range": "06:00-10:00"},
            {"label": "Morning", "range": "10:00-14:00"},
            {"label": "Afternoon", "range": "14:00-18:00"},
            {"label": "Evening", "range": "18:00-22:00"},
            {"label": "Night", "range": "22:00-06:00"}
        ]
    }

@router.get("/debug/database")
async def debug_database(db: AsyncSession = Depends(get_db)):
    """Debug endpoint to check database contents"""
    
    # Check locations count
    locations_query = select(func.count(Location.id))
    locations_result = await db.execute(locations_query)
    locations_count = locations_result.scalar()
    
    # Check vehicles count  
    vehicles_query = select(func.count(Vehicle.id))
    vehicles_result = await db.execute(vehicles_query)
    vehicles_count = vehicles_result.scalar()
    
    # Check schedules count
    schedules_query = select(func.count(Schedule.id))
    schedules_result = await db.execute(schedules_query)
    schedules_count = schedules_result.scalar()
    
    return {
        "database_stats": {
            "locations_count": locations_count,
            "vehicles_count": vehicles_count,
            "schedules_count": schedules_count
        }
    }

@router.get("/search/seats/{vehicle_id}", response_model=dict)
async def get_seat_map(
    vehicle_id: int,
    travel_date: date = Query(..., description="Travel date (YYYY-MM-DD)"),
    schedule_id: Optional[int] = Query(None, description="Schedule ID for specific trip"),
    db: AsyncSession = Depends(get_db)
):
    """Get seat map and availability for a specific vehicle and date.

    Also returns schedule/operator/route metadata when schedule_id is provided so the
    booking page can render trip information without making extra requests.
    """

    # Add debugging information
    print(f"DEBUG: get_seat_map called with vehicle_id={vehicle_id}, travel_date={travel_date}, schedule_id={schedule_id}")

    # Get vehicle details
    vehicle_query = select(Vehicle).where(Vehicle.id == vehicle_id)
    vehicle_result = await db.execute(vehicle_query)
    vehicle = vehicle_result.scalar_one_or_none()

    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle with ID {vehicle_id} not found"
        )

    print(f"DEBUG: Found vehicle {vehicle.id} ({vehicle.vehicle_number}) with {vehicle.total_seats} seats")

    # If schedule_id is provided, load schedule + operator + location names
    schedule_meta: dict | None = None
    schedule_base_price: float = 500.0  # Default fallback price
    if schedule_id:
        SourceLoc = aliased(Location)
        DestLoc = aliased(Location)
        sched_q = (
            select(Schedule, Operator, SourceLoc, DestLoc)
            .join(Vehicle, Schedule.vehicle_id == Vehicle.id)
            .join(Operator, Vehicle.operator_id == Operator.id)
            .join(SourceLoc, Schedule.source_id == SourceLoc.id)
            .join(DestLoc, Schedule.destination_id == DestLoc.id)
            .where(and_(Schedule.id == schedule_id, Vehicle.id == vehicle_id))
        )
        sched_res = await db.execute(sched_q)
        row = sched_res.first()
        if row:
            schedule, operator, src, dst = row
            # Extract the base price from the schedule
            schedule_base_price = float(schedule.base_price) if hasattr(schedule, 'base_price') and schedule.base_price else 500.0
            print(f"DEBUG: Using schedule base price: {schedule_base_price}")
            
            # Compute duration with rollover if arrival is next day
            departure_dt = datetime.combine(travel_date, schedule.departure_time)
            arrival_dt = datetime.combine(travel_date, schedule.arrival_time)
            if arrival_dt < departure_dt:
                arrival_dt += timedelta(days=1)
            dur_seconds = (arrival_dt - departure_dt).total_seconds()
            h, rem = divmod(dur_seconds, 3600)
            m, _ = divmod(rem, 60)
            schedule_meta = {
                "operator_name": str(operator.name) if getattr(operator, "name", None) else "",
                "source_name": str(src.name) if getattr(src, "name", None) else "",
                "destination_name": str(dst.name) if getattr(dst, "name", None) else "",
                # Leave these as time objects for FastAPI to serialize as HH:MM:SS
                "departure_time": schedule.departure_time,
                "arrival_time": schedule.arrival_time,
                "duration": f"{int(h)}h {int(m)}m",
            }
            print(f"DEBUG: Found schedule {schedule.id} for route {src.name} -> {dst.name}")

    # Get booked seats for this vehicle/schedule on the travel date
    booked_seats_query = select(Booking.seats, Booking.status, Booking.id, Booking.travel_date).where(
        and_(
            (Booking.schedule_id == schedule_id) if schedule_id else (Booking.transport_id == vehicle_id),
            func.date(Booking.travel_date) == travel_date,
            Booking.status.in_(["PENDING", "CONFIRMED"]),
        )
    )
    booked_result = await db.execute(booked_seats_query)
    booked_bookings = booked_result.all()

    print(f"DEBUG: Found {len(booked_bookings)} active bookings for vehicle {vehicle_id} on {travel_date}")

    # Flatten booked seats
    booked_seats: list[int] = []
    for booking_seats, booking_status, booking_id, booking_travel_date in booked_bookings:
        if booking_seats:
            print(f"DEBUG: Booking {booking_id} (status={booking_status}, travel_date={booking_travel_date}) has seats: {booking_seats}")
            booked_seats.extend(booking_seats)

    print(f"DEBUG: Total booked seats: {len(booked_seats)} - {sorted(booked_seats)}")

    # Get seat map structure
    seat_map = vehicle.seat_map or {}

    # Process seat availability and class info
    seat_availability: dict = {}
    class_info: dict = {}

    if seat_map and "classes" in seat_map:
        for class_name, seat_numbers in seat_map["classes"].items():
            available_nums = [s for s in seat_numbers if s not in booked_seats]

            seat_availability[class_name] = {
                "total_seats": len(seat_numbers),
                "available_seats": len(available_nums),
                "booked_seats": len(seat_numbers) - len(available_nums),
                "seat_numbers": seat_numbers,
                "available_seat_numbers": available_nums,
                "booked_seat_numbers": [s for s in seat_numbers if s in booked_seats],
            }

            # Price for this class - use schedule base price for economy, vehicle class prices for others
            class_prices = vehicle.class_prices or {}
            if class_name.lower() == 'economy':
                # Always use schedule base price for economy class
                price = schedule_base_price
            else:
                # Use vehicle class price for other classes, fallback to schedule base price
                price = class_prices.get(class_name, schedule_base_price)
            
            class_info[class_name] = {
                "price": float(price) if price is not None else schedule_base_price,
                "available": len(available_nums) > 0,
            }
            
            print(f"DEBUG: Class {class_name}: {len(available_nums)} available, {len(seat_numbers) - len(available_nums)} booked, price: {price}")

    # Get vehicle layout if available
    layout = seat_map.get("layout", {})

    base_response = {
        "vehicle_id": vehicle_id,
        "vehicle_number": vehicle.vehicle_number,
        "vehicle_name": vehicle.vehicle_name,
        "vehicle_type": vehicle.vehicle_type,
        "total_seats": vehicle.total_seats,
        "vehicle_seat_map": seat_map,
        "seat_map": {
            "classes": seat_availability,
            "layout": layout,
        },
        "class_info": class_info,
        "travel_date": travel_date.isoformat(),
        "debug_info": {
            "query_travel_date": travel_date.isoformat(),
            "current_date": datetime.now().date().isoformat(),
            "total_bookings_found": len(booked_bookings),
            "total_booked_seats": len(booked_seats),
            "schedule_id_provided": schedule_id is not None
        }
    }

    # Add schedule metadata if available
    if schedule_meta:
        base_response.update(schedule_meta)

    print(f"DEBUG: Returning seat map response with {len(booked_seats)} booked seats out of {vehicle.total_seats} total seats")
    return base_response
