from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, and_, desc, text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import datetime
import logging

from backend.database.database import get_db
from backend.database.models.user import User
from backend.database.models.feedback import Feedback, FeedbackTypeEnum
from backend.database.models.booking import Booking
# Assuming Vehicle model exists for context, though not directly used in this file.
 
from backend.models.feedback import FeedbackCreate, FeedbackUpdate
from backend.middleware.jwt_auth import get_current_user
from backend.services.notification_service import NotificationService
from backend.services.email_service import email_service

router = APIRouter(prefix="/feedback", tags=["feedback"])

def serialize_feedback(f: Feedback) -> dict:
    return {
        "id": f.id,
        "user_id": f.user_id,
        "vehicle_id": getattr(f, 'vehicle_id', None),
        "booking_id": getattr(f, 'booking_id', None),
        "rating": getattr(f, 'rating', None),
        "comment": f.comment or f.message,
        "type": getattr(f, 'type', None),  # stored as string
        "admin_response": getattr(f, 'admin_response', None),
    "is_approved": getattr(f, 'is_approved', False),
        "created_at": getattr(f, 'created_at', None),
        "updated_at": getattr(f, 'updated_at', None),
    }

# Helper function for consistent counting using SELECT and len()
async def count_records(db: AsyncSession, model, *conditions):
    """
    Helper function to count records by selecting IDs and using len().
    """
    query = select(model.id) 
    for condition in conditions:
        query = query.where(condition)
    
    result = await db.execute(query)
    records = result.scalars().all()
    return len(records)

# Alternative count function with pagination support
async def count_and_paginate(db: AsyncSession, base_query, skip: int = 0, limit: int = 10):
    """
    Helper function to get both count and paginated results.
    """
    # Get all records for counting
    all_records_result = await db.execute(base_query)
    all_records = all_records_result.scalars().all()
    total_count = len(all_records)
    
    # Get paginated results
    paginated_query = base_query.offset(skip).limit(limit)
    result = await db.execute(paginated_query)
    items = result.scalars().all()
    
    return items, total_count

@router.post("/")
@router.post("")
async def create_feedback(
    feedback_data: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create feedback for a transport/trip"""
    # Resolve booking either by booking_id or transport_id
    booking = None
    if feedback_data.booking_id:
        booking_result = await db.execute(
            select(Booking).where(
                and_(
                    Booking.id == feedback_data.booking_id,
                    Booking.user_id == current_user.id,
                    Booking.status.in_(["CONFIRMED", "COMPLETED"])  # allow completed too
                )
            )
        )
        booking = booking_result.scalar_one_or_none()
        if not booking:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid booking reference for feedback"
            )
    elif feedback_data.transport_id:
        booking_result = await db.execute(
            select(Booking).where(
                and_(
                    Booking.user_id == current_user.id,
                    Booking.transport_id == feedback_data.transport_id,
                    Booking.status.in_(["CONFIRMED", "COMPLETED"])
                )
            )
        )
        booking = booking_result.scalar_one_or_none()
        if not booking:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You can only provide feedback for trips you have booked"
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="transport_id or booking_id is required"
        )

    # Enforce one feedback per booking
    existing_feedback_result = await db.execute(
        select(Feedback.id).where(
            and_(
                Feedback.user_id == current_user.id,
                Feedback.booking_id == booking.id
            )
        )
    )
    if existing_feedback_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already provided feedback for this booking"
        )

    # Validate rating (1-5)
    if not (1 <= feedback_data.rating <= 5):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rating must be between 1 and 5"
        )

    # Create feedback mapped to DB model
    db_feedback = Feedback(
        user_id=current_user.id,
        vehicle_id=booking.transport_id,
        booking_id=booking.id,
        rating=feedback_data.rating,
        comment=feedback_data.comment,
        message=feedback_data.comment,
        type=FeedbackTypeEnum.TRIP_REVIEW.value,
        is_anonymous=getattr(feedback_data, 'is_anonymous', False),
    is_approved=True
    )

    db.add(db_feedback)
    # Flush to get generated primary key without triggering a full refresh
    await db.flush()
    # Prepare a minimal response dict using in-memory values
    resp = {
        "id": db_feedback.id,
        "user_id": current_user.id,
        "vehicle_id": booking.transport_id,
        "booking_id": booking.id,
        "rating": feedback_data.rating,
    "comment": feedback_data.comment
    }
    await db.commit()
    return {"success": True, "data": resp}

@router.get("/transport/{transport_id}")
async def get_transport_feedback(
    transport_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=50),
    rating_filter: Optional[int] = Query(None, ge=1, le=5),
    db: AsyncSession = Depends(get_db)
):
    """Get all feedback for a specific transport"""
    
    query = select(Feedback).where(Feedback.vehicle_id == transport_id)
    
    if rating_filter:
        query = query.where(Feedback.rating == rating_filter)
    
    query = query.order_by(desc(Feedback.created_at)).offset(skip).limit(limit)
    
    result = await db.execute(query)
    feedback_list = result.scalars().all()
    return {"success": True, "data": [serialize_feedback(f) for f in feedback_list]}

@router.get("/transport/{transport_id}/stats")
async def get_transport_feedback_stats(
    transport_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get feedback statistics for a transport"""
    
    # Get all feedback for average calculation
    all_feedback_result = await db.execute(
        select(Feedback.rating).where(Feedback.vehicle_id == transport_id)
    )
    all_ratings = all_feedback_result.scalars().all()
    
    # Calculate average rating manually
    avg_rating = sum(all_ratings) / len(all_ratings) if all_ratings else 0
    
    # Total feedback count - Using the helper function
    total_feedback = await count_records(db, Feedback, Feedback.vehicle_id == transport_id)
    
    # Rating distribution - Using the helper function
    rating_distribution = {}
    for rating in range(1, 6):
        count = await count_records(
            db, 
            Feedback, 
            Feedback.vehicle_id == transport_id,
            Feedback.rating == rating
        )
        rating_distribution[f"{rating}_star"] = count
    
    # Recent feedback (last 5)
    recent_feedback_result = await db.execute(
        select(Feedback)
    .where(Feedback.vehicle_id == transport_id)
    .order_by(desc(Feedback.created_at))
        .limit(5)
    )
    recent_feedback = recent_feedback_result.scalars().all()
    
    return {
        "transport_id": transport_id,
        "average_rating": round(avg_rating, 2),
        "total_feedback": total_feedback,
        "rating_distribution": rating_distribution,
    "recent_feedback": [serialize_feedback(f) for f in recent_feedback]
    }

@router.get("/public")
async def get_public_feedback(
    limit: int = Query(10, ge=1, le=50),
    featured_first: bool = True,
    db: AsyncSession = Depends(get_db)
):
    """Public testimonials for homepage: include user display name when not anonymous.
    Placed before dynamic routes to avoid path conflicts like '/{feedback_id}'.
    """
    base = (
        select(
            Feedback.id.label("id"),
            Feedback.rating.label("rating"),
            Feedback.comment.label("comment"),
            Feedback.message.label("message"),
            Feedback.created_at.label("created_at"),
            Feedback.is_anonymous.label("is_anonymous"),
            User.name.label("user_name"),
        )
        .where(Feedback.is_approved == True)
        .join(User, User.id == Feedback.user_id)
        .limit(limit)
    )
    base = base.order_by(desc(Feedback.rating), desc(Feedback.created_at)) if featured_first else base.order_by(desc(Feedback.created_at))
    res = await db.execute(base)
    rows = res.mappings().all()
    items = []
    for r in rows:
        name = r.get("user_name") or "Happy Traveler"
        if r.get("is_anonymous"):
            name = "Anonymous"
        items.append({
            "id": r["id"],
            "rating": r["rating"],
            "comment": r["comment"] or r["message"],
            "created_at": r["created_at"],
            "user_name": name,
        })

    # Graceful fallback: if no approved testimonials exist yet, surface recent positive public feedback
    if not items:
        fallback_q = (
            select(
                Feedback.id.label("id"),
                Feedback.rating.label("rating"),
                Feedback.comment.label("comment"),
                Feedback.message.label("message"),
                Feedback.created_at.label("created_at"),
                Feedback.is_anonymous.label("is_anonymous"),
                User.name.label("user_name"),
            )
            .where(
                and_(
                    Feedback.rating.is_not(None),
                    Feedback.rating >= 4,
                    (Feedback.comment.is_not(None) | Feedback.message.is_not(None))
                )
            )
            .join(User, User.id == Feedback.user_id)
            .order_by(desc(Feedback.created_at))
            .limit(limit)
        )
        fallback_res = await db.execute(fallback_q)
        rows = fallback_res.mappings().all()
        for r in rows:
            name = r.get("user_name") or "Happy Traveler"
            if r.get("is_anonymous"):
                name = "Anonymous"
            items.append({
                "id": r["id"],
                "rating": r["rating"],
                "comment": r["comment"] or r["message"],
                "created_at": r["created_at"],
                "user_name": name,
            })

    return {"success": True, "data": items}

@router.get("/user/my-feedback")
async def get_user_feedback(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get current user's feedback history"""
    
    result = await db.execute(
        select(Feedback)
        .where(Feedback.user_id == current_user.id)
    .order_by(desc(Feedback.created_at))
        .offset(skip)
        .limit(limit)
    )
    feedback_list = result.scalars().all()
    return {"success": True, "data": [serialize_feedback(f) for f in feedback_list]}

@router.put("/{feedback_id}")
async def update_feedback(
    feedback_id: int,
    feedback_update: FeedbackUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update user's own feedback"""
    
    result = await db.execute(
        select(Feedback).where(Feedback.id == feedback_id)
    )
    feedback = result.scalar_one_or_none()
    
    if not feedback:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feedback not found"
        )
    
    # Check if user owns this feedback
    if feedback.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own feedback"
        )
    
    # Check if feedback is not too old (e.g., can only edit within 7 days)
    days_since_feedback = (datetime.utcnow() - feedback.created_at).days
    if days_since_feedback > 7:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit feedback older than 7 days"
        )
    
    # Update feedback
    # Only allow user-editable fields
    allowed_fields = {"rating", "comment", "feedback_type", "is_anonymous"}
    update_data = feedback_update.model_dump(exclude_unset=True)

    # Guard against attempts to change restricted fields like admin_response or status
    disallowed = set(update_data.keys()) - allowed_fields
    if disallowed:
        # Silently ignore restricted fields to be resilient with older clients
        for k in list(disallowed):
            update_data.pop(k, None)

    # Apply validated updates
    for field, value in update_data.items():
        if field == "rating" and value is not None:
            if not (1 <= value <= 5):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Rating must be between 1 and 5"
                )
        setattr(feedback, field, value)
    
    feedback.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(feedback)
    return {"success": True, "data": serialize_feedback(feedback)}

@router.delete("/{feedback_id}")
async def delete_feedback(
    feedback_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete feedback (user's own or admin)"""
    
    result = await db.execute(
        select(Feedback).where(Feedback.id == feedback_id)
    )
    feedback = result.scalar_one_or_none()
    
    if not feedback:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feedback not found"
        )
    
    # Check permissions (own feedback or admin)
    if feedback.user_id != current_user.id and not getattr(current_user, 'is_admin', False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this feedback"
        )
    
    await db.delete(feedback)
    await db.commit()
    
    return {"message": "Feedback deleted successfully"}

@router.get("/admin/all")
async def get_all_feedback_admin(
    skip: int = Query(0, ge=0),
    limit: int = Query(10000, ge=1, le=50000),  # Increased default limit to show all feedback
    transport_id: Optional[int] = None,
    user_id: Optional[int] = None,
    rating: Optional[int] = Query(None, ge=1, le=5),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all feedback for admin with filtering options"""
    
    # Check admin permissions
    if not getattr(current_user, 'is_admin', False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    # Build query with filters
    query = select(Feedback)
    conditions = []
    
    if transport_id:
        conditions.append(Feedback.vehicle_id == transport_id)
    
    if user_id:
        conditions.append(Feedback.user_id == user_id)
    
    if rating:
        conditions.append(Feedback.rating == rating)

    if conditions:
        query = query.where(and_(*conditions))
    
    # Get total count for pagination - Using helper function
    total_count = await count_records(db, Feedback, *conditions)
        
    # Order by latest first and apply pagination
    query = query.order_by(desc(Feedback.created_at)).offset(skip).limit(limit)
    
    result = await db.execute(query)
    feedback_list = result.scalars().all()
    return {
        "feedback": [serialize_feedback(f) for f in feedback_list],
        "total": total_count,
        "skip": skip,
        "limit": limit,
        "has_more": total_count > skip + len(feedback_list)
    }

@router.get("/admin/analytics")
async def get_feedback_analytics(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get feedback analytics for admin dashboard"""
    
    # Check admin permissions
    if not getattr(current_user, 'is_admin', False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    # Overall statistics - Using helper function
    total_feedback = await count_records(db, Feedback)
    
    # Get all ratings for average calculation
    all_ratings_result = await db.execute(select(Feedback.rating))
    all_ratings = all_ratings_result.scalars().all()
    avg_rating = sum(all_ratings) / len(all_ratings) if all_ratings else 0
    
    # Rating distribution - Using helper function
    rating_stats = {}
    for rating in range(1, 6):
        count = await count_records(db, Feedback, Feedback.rating == rating)
        rating_stats[f"{rating}_star"] = count
    
    # Recent feedback trends (last 30 days)
    thirty_days_ago = datetime.utcnow().replace(day=1)  # Simplified for demo
    recent_feedback_count = await count_records(
        db, Feedback, Feedback.created_at >= thirty_days_ago
    )
    
    # Top rated transports - Manual aggregation
    # Get all feedback grouped by transport_id
    all_feedback_result = await db.execute(
        select(Feedback.vehicle_id, Feedback.rating)
    )
    all_feedback_data = all_feedback_result.all()
    
    # Group by transport_id and calculate stats
    transport_stats = {}
    for vehicle_id, rating in all_feedback_data:
        if vehicle_id not in transport_stats:
            transport_stats[vehicle_id] = {'ratings': [], 'count': 0}
        transport_stats[vehicle_id]['ratings'].append(rating)
        transport_stats[vehicle_id]['count'] += 1
    
    # Calculate averages and filter transports with at least 5 reviews
    top_rated_transports = []
    low_rated_transports = []
    
    for vehicle_id, stats in transport_stats.items():
        if stats['count'] >= 5:  # At least 5 reviews
            avg_rating = sum(stats['ratings']) / len(stats['ratings'])
            transport_data = {
                "transport_id": vehicle_id,
                "average_rating": round(avg_rating, 2),
                "feedback_count": stats['count']
            }
            top_rated_transports.append(transport_data)
            low_rated_transports.append(transport_data)
    
    # Sort for top and bottom rated
    top_rated_transports.sort(key=lambda x: x['average_rating'], reverse=True)
    low_rated_transports.sort(key=lambda x: x['average_rating'])
    
    return {
        "total_feedback": total_feedback,
        "average_rating": round(avg_rating, 2),
        "rating_distribution": rating_stats,
        "recent_feedback_count": recent_feedback_count,
        "top_rated_transports": top_rated_transports[:10],
        "needs_attention": low_rated_transports[:10]
    }

# New endpoints to support general feedback submission and publication/response

from pydantic import BaseModel, Field

class GeneralFeedbackCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str = Field(..., min_length=3, max_length=2000)
    feedback_type: Optional[str] = None
    is_anonymous: bool = False

def map_feedback_type(s: Optional[str]) -> FeedbackTypeEnum:
    if not s:
        return FeedbackTypeEnum.GENERAL
    v = s.strip().lower()
    mapping = {
        "trip_review": FeedbackTypeEnum.TRIP_REVIEW,
        "service": FeedbackTypeEnum.SERVICE_COMPLAINT,
        "complaint": FeedbackTypeEnum.SERVICE_COMPLAINT,
        "suggestion": FeedbackTypeEnum.SUGGESTION,
        "compliment": FeedbackTypeEnum.COMPLIMENT,
        "technical": FeedbackTypeEnum.TECHNICAL_ISSUE,
        "technical_issue": FeedbackTypeEnum.TECHNICAL_ISSUE,
        "refund": FeedbackTypeEnum.REFUND_REQUEST,
        "booking": FeedbackTypeEnum.GENERAL,
        "vehicle": FeedbackTypeEnum.GENERAL,
        "driver": FeedbackTypeEnum.GENERAL,
        "app": FeedbackTypeEnum.GENERAL,
        "general": FeedbackTypeEnum.GENERAL,
    }
    return mapping.get(v, FeedbackTypeEnum.GENERAL)

@router.post("/submit")
async def submit_general_feedback(
    payload: GeneralFeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Submit general feedback not tied to a specific booking."""
    if not (1 <= payload.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    fb = Feedback(
        user_id=current_user.id,
        message=payload.comment,
        comment=payload.comment,
        rating=payload.rating,
        type=map_feedback_type(payload.feedback_type).value,
        is_anonymous=payload.is_anonymous,
    is_approved=True
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return {"success": True, "id": fb.id}

class VisibilityUpdate(BaseModel):
    is_approved: Optional[bool] = None

@router.put("/admin/{feedback_id}/visibility")
async def update_feedback_visibility(
    feedback_id: int,
    update: VisibilityUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not getattr(current_user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin access required")

    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    fb = result.scalar_one_or_none()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")

    data = update.model_dump(exclude_unset=True)
    if 'is_approved' in data:
        fb.is_approved = data['is_approved']

    await db.commit()
    await db.refresh(fb)
    return {"success": True, "id": fb.id, "is_approved": fb.is_approved}

class AdminRespond(BaseModel):
    response: str = Field(..., min_length=1, max_length=2000)

@router.get("/{feedback_id}")
async def get_feedback_details(
    feedback_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a single feedback including admin response.
    Allowed for the feedback owner or admins.
    """
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    fb = result.scalar_one_or_none()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")
    if fb.user_id != current_user.id and not getattr(current_user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Not authorized to view this feedback")

    return {
        "success": True,
        "data": {
            "id": fb.id,
            "user_id": fb.user_id,
            "booking_id": getattr(fb, 'booking_id', None),
            "vehicle_id": getattr(fb, 'vehicle_id', None),
            "rating": getattr(fb, 'rating', None),
            "comment": fb.comment or fb.message,
            "admin_response": getattr(fb, 'admin_response', None),
            "created_at": getattr(fb, 'created_at', None),
            "responded_at": getattr(fb, 'responded_at', None),
            "responded_by": getattr(fb, 'responded_by', None),
        }
    }

@router.post("/{feedback_id}/respond")
async def respond_to_feedback(
    feedback_id: int,
    payload: AdminRespond,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not getattr(current_user, 'is_admin', False):
        raise HTTPException(status_code=403, detail="Admin access required")
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    fb = result.scalar_one_or_none()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback not found")
    # Enforce single admin reply
    if (fb.admin_response or "").strip():
        raise HTTPException(status_code=400, detail="Feedback already has an admin response")
    fb.add_admin_response(current_user.id, payload.response)
    await db.commit()

    # Notify the feedback owner via in-app notification and email
    try:
        # In-app notification: show the full admin_response content in message
        full_response = (fb.admin_response or "").strip()
        notif_svc = NotificationService(db)
        await notif_svc.create_notification(
            user_id=fb.user_id,
            role="user",
            title="Response to Your Feedback",
            message=(full_response if full_response else "An admin has responded to your feedback. Tap to view."),
            notification_type="user_feedback",
            priority="medium",
            send_email=True,
            feedback_id=fb.id,
            action_url=f"/feedback/{fb.id}"
        )
    except Exception as e:
        # Log but don't block the API response
        logging.getLogger(__name__).error("Failed to send feedback response notification: %s", e)

    # Also send a detailed feedback response email
    try:
        # Get user email
        user_res = await db.execute(select(User).where(User.id == fb.user_id))
        fb_user = user_res.scalar_one_or_none()
        if fb_user and getattr(fb_user, 'email', None):
            # Create a background task for email sending to avoid blocking
            import asyncio
            asyncio.create_task(email_service.send_feedback_response_email({
                'email': fb_user.email,
                'user_name': getattr(fb_user, 'name', 'Valued Customer'),
                'original_message': fb.message or fb.comment or '',
                'admin_response': fb.admin_response or ''
            }))
    except Exception as e:
        logging.getLogger(__name__).error("Failed to send feedback response email: %s", e)

    return {"success": True}

 

# Alternative utility functions without func.count()

async def count_with_batch_processing(db: AsyncSession, model, condition, batch_size: int = 1000):
    """
    Count records in batches for very large datasets to avoid memory issues.
    """
    total_count = 0
    offset = 0
    
    while True:
        result = await db.execute(
            select(model.id)
            .where(condition)
            .offset(offset)
            .limit(batch_size)
        )
        batch = result.scalars().all()
        
        if not batch:
            break
            
        total_count += len(batch)
        offset += batch_size
        
        if len(batch) < batch_size:
            break
    
    return total_count

async def count_with_raw_sql(db: AsyncSession, table_name: str, where_clause: str = None, params: dict = None):
    """
    Count using raw SQL if needed (should be a last resort).
    """
    query = f"SELECT COUNT(*) FROM {table_name}"
    if where_clause:
        query += f" WHERE {where_clause}"
    
    result = await db.execute(text(query), params or {})
    return result.scalar_one()

async def count_exists_check(db: AsyncSession, model, *conditions):
    """
    Check if at least one record exists that matches the conditions.
    """
    exists_query = select(model.id).where(and_(*conditions)).limit(1)
    result = await db.execute(exists_query)
    return result.scalar_one_or_none() is not None

async def manual_count_by_fetching_ids(db: AsyncSession, model, *conditions):
    """
    Alternative counting method by fetching all IDs and using len().
    More memory efficient than fetching full records.
    """
    query = select(model.id)
    for condition in conditions:
        query = query.where(condition)
    
    result = await db.execute(query)
    ids = result.scalars().all()
    return len(ids)