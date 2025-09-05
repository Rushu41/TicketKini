from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select, and_, desc, cast, String
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from datetime import datetime, timedelta

from backend.database.database import get_db
from backend.database.models.user import User
from backend.database.models.notification import (
    Notification,
    NotificationTypeEnum,
    NotificationPriorityEnum,
    NotificationStatusEnum,
)
from backend.middleware.jwt_auth import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])

# Notification models
from pydantic import BaseModel

class NotificationCreate(BaseModel):
    user_id: int
    title: str
    message: str
    type: NotificationTypeEnum
    priority: NotificationPriorityEnum = NotificationPriorityEnum.MEDIUM
    booking_id: Optional[int] = None
    payment_id: Optional[int] = None
    action_url: Optional[str] = None
    send_email: bool = False
    send_sms: bool = False
    send_push: bool = True

class NotificationUpdate(BaseModel):
    is_read: Optional[bool] = None
    read_at: Optional[datetime] = None

class NotificationOut(BaseModel):
    id: int
    title: str
    message: str
    type: str
    priority: str
    booking_id: Optional[int]
    payment_id: Optional[int]
    feedback_id: Optional[int]
    action_url: Optional[str]
    is_read: bool
    read_at: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True

@router.post("/", response_model=NotificationOut)
async def create_notification(
    notification_data: NotificationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new notification (Admin only)"""
    
    # Check admin permissions
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    # Create notification
    # Persist enum values as strings to match model columns
    db_notification = Notification(
        user_id=notification_data.user_id,
        title=notification_data.title,
        message=notification_data.message,
        type=notification_data.type.value,
        priority=notification_data.priority.value,
        booking_id=notification_data.booking_id,
        payment_id=notification_data.payment_id,
        action_url=notification_data.action_url,
        send_email=notification_data.send_email,
        send_push=notification_data.send_push
    )
    
    db.add(db_notification)
    await db.commit()
    await db.refresh(db_notification)
    
    return db_notification

@router.get("/my-notifications", response_model=List[NotificationOut])
async def get_user_notifications(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    unread_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get notifications for current user"""
    
    query = select(Notification).where(Notification.user_id == current_user.id)
    if unread_only:
        # Force string comparison to avoid PG enum type mismatch on varchar columns
        query = query.where(cast(Notification.status, String) == "unread")
    query = query.order_by(desc(Notification.created_at)).offset(skip).limit(limit)

    result = await db.execute(query)
    rows = result.scalars().all()

    # Normalize output for frontend expectations
    return [
        NotificationOut(
            id=n.id,
            title=n.title,
            message=n.message,
            type=n.type.value if hasattr(n.type, "value") else str(n.type),
            priority=n.priority.value if hasattr(n.priority, "value") else str(n.priority),
            booking_id=n.booking_id,
            payment_id=n.payment_id,
            feedback_id=n.feedback_id,
            action_url=n.action_url,
            is_read=(
                (n.status == NotificationStatusEnum.READ)
                if hasattr(n.status, "value") or isinstance(n.status, NotificationStatusEnum)
                else str(n.status).lower() == "read"
            ),
            read_at=n.read_at,
            created_at=n.created_at,
        )
        for n in rows
    ]

@router.get("/unread-count")
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get count of unread notifications for current user"""
    result = await db.execute(
        select(Notification.id).where(
            and_(
                Notification.user_id == current_user.id,
                cast(Notification.status, String) == "unread",
            )
        )
    )
    count = len(result.scalars().all())
    return {"unread_count": count}

@router.get("/unread")
async def get_unread_notifications(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return unread notifications and count for current user (frontend expects this shape)."""
    result = await db.execute(
        select(Notification)
        .where(
            and_(
                Notification.user_id == current_user.id,
                cast(Notification.status, String) == "unread",
            )
        )
        .order_by(desc(Notification.created_at))
        .limit(limit)
    )
    rows = result.scalars().all()
    # Count total unread
    count_res = await db.execute(
        select(Notification.id).where(
            and_(
                Notification.user_id == current_user.id,
                cast(Notification.status, String) == "unread",
            )
        )
    )
    count = len(count_res.scalars().all())
    items = [
        {
            "id": n.id,
            "title": n.title,
            "message": n.message,
            "type": n.type.value if hasattr(n.type, "value") else str(n.type),
            "priority": n.priority.value if hasattr(n.priority, "value") else str(n.priority),
            "booking_id": n.booking_id,
            "payment_id": n.payment_id,
            "feedback_id": n.feedback_id,
            "action_url": n.action_url,
            "status": (n.status.value if hasattr(n.status, "value") else str(n.status)),
            "created_at": n.created_at,
            "expires_at": n.expires_at,
        }
        for n in rows
    ]
    return {"notifications": items, "count": count}

@router.put("/{notification_id}/mark-read", response_model=NotificationOut)
async def mark_notification_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark a notification as read"""
    # Get the notification
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.id == notification_id,
                Notification.user_id == current_user.id,
            )
        )
    )
    n = result.scalar_one_or_none()
    if not n:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )
    # Mark as read via model helper
    n.mark_as_read()
    await db.commit()
    await db.refresh(n)
    return NotificationOut(
        id=n.id,
        title=n.title,
        message=n.message,
        type=n.type.value if hasattr(n.type, "value") else str(n.type),
        priority=n.priority.value if hasattr(n.priority, "value") else str(n.priority),
        booking_id=n.booking_id,
        payment_id=n.payment_id,
        action_url=n.action_url,
        is_read=(
            (n.status == NotificationStatusEnum.READ)
            if hasattr(n.status, "value") or isinstance(n.status, NotificationStatusEnum)
            else str(n.status).lower() == "read"
        ),
        read_at=n.read_at,
        created_at=n.created_at,
    )

@router.put("/mark-all-read")
async def mark_all_notifications_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark all notifications as read for current user"""
    # Fetch unread notifications and mark them as read
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.user_id == current_user.id,
                cast(Notification.status, String) == "unread",
            )
        )
    )
    rows = result.scalars().all()
    for n in rows:
        n.mark_as_read()
    await db.commit()
    return {"message": "All notifications marked as read", "updated": len(rows)}

@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a notification"""
    
    # Get the notification
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.id == notification_id,
                Notification.user_id == current_user.id
            )
        )
    )
    notification = result.scalar_one_or_none()
    
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    await db.delete(notification)
    await db.commit()
    
    return {"message": "Notification deleted successfully"}

# Admin endpoints for managing all notifications
@router.get("/admin/all")
async def get_all_notifications_admin(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user_id: Optional[int] = None,
    notification_type: Optional[str] = None,
    priority: Optional[str] = None,
    is_read: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all notifications (Admin only)"""
    
    # Check admin permissions
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    # Build query with filters
    query = select(Notification)
    conditions = []
    
    if user_id:
        conditions.append(Notification.user_id == user_id)
    
    if notification_type:
        # Compare against stored string values
        if notification_type in {e.value for e in NotificationTypeEnum}:
            conditions.append(cast(Notification.type, String) == notification_type)
    
    if priority:
        if priority in {e.value for e in NotificationPriorityEnum}:
            conditions.append(cast(Notification.priority, String) == priority)
    
    if is_read is not None:
        conditions.append(
            cast(Notification.status, String) == ("read" if is_read else "unread")
        )
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # Get total count
    count_query = select(Notification.id)
    if conditions:
        count_query = count_query.where(and_(*conditions))
    count_result = await db.execute(count_query)
    total_count = len(count_result.scalars().all())
    
    # Order by latest first and apply pagination
    query = query.order_by(desc(Notification.created_at)).offset(skip).limit(limit)
    
    result = await db.execute(query)
    rows = result.scalars().all()
    
    return {
        "notifications": [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "type": n.type.value if hasattr(n.type, "value") else str(n.type),
                "priority": n.priority.value if hasattr(n.priority, "value") else str(n.priority),
                "booking_id": n.booking_id,
                "payment_id": n.payment_id,
                "feedback_id": n.feedback_id,
                "action_url": n.action_url,
                "is_read": (
                    (n.status == NotificationStatusEnum.READ)
                    if hasattr(n.status, "value") or isinstance(n.status, NotificationStatusEnum)
                    else str(n.status).lower() == "read"
                ),
                "read_at": n.read_at,
                "created_at": n.created_at,
            }
            for n in rows
        ],
        "total": total_count,
        "skip": skip,
        "limit": limit,
        "has_more": total_count > skip + len(rows)
    }

@router.post("/admin/broadcast")
async def broadcast_notification(
    title: str,
    message: str,
    notification_type: NotificationTypeEnum = NotificationTypeEnum.SYSTEM_ALERT,
    priority: NotificationPriorityEnum = NotificationPriorityEnum.MEDIUM,
    user_ids: Optional[List[int]] = None,
    all_users: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Broadcast notification to multiple users (Admin only)"""
    
    # Check admin permissions
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    target_user_ids = []
    
    if all_users:
        # Get all user IDs
        result = await db.execute(select(User.id).where(User.is_active == True))
        target_user_ids = [row[0] for row in result.fetchall()]
    elif user_ids:
        target_user_ids = user_ids
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must specify either user_ids or all_users=True"
        )
    
    # Create notifications for all target users
    notifications = []
    for user_id in target_user_ids:
        notification = Notification(
            user_id=user_id,
            title=title,
            message=message,
            type=notification_type.value,
            priority=priority.value,
            send_push=True
        )
        notifications.append(notification)
    
    db.add_all(notifications)
    await db.commit()
    
    return {
        "message": f"Notification broadcasted to {len(notifications)} users",
        "notification_count": len(notifications)
    }

@router.get("/admin/analytics")
async def get_notification_analytics(
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get notification analytics (Admin only)"""
    
    # Check admin permissions
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    # Calculate date range
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days)
    
    # Fetch notifications in range and compute analytics in Python (avoids DB dialect issues)
    base_res = await db.execute(select(Notification).where(Notification.created_at >= start_date))
    nrows = base_res.scalars().all()
    total_notifications = len(nrows)

    # Notifications by type
    notifications_by_type = {}
    for n in nrows:
        key = n.type.value if hasattr(n.type, "value") else str(n.type)
        notifications_by_type[key] = notifications_by_type.get(key, 0) + 1

    # Read vs unread using status
    read_stats = {True: 0, False: 0}
    for n in nrows:
        is_read = (
            (n.status == NotificationStatusEnum.READ)
            if hasattr(n.status, "value") or isinstance(n.status, NotificationStatusEnum)
            else str(n.status).lower() == "read"
        )
        read_stats[is_read] += 1

    # Daily counts
    daily_map = {}
    for n in nrows:
        day = n.created_at.date().isoformat()
        daily_map[day] = daily_map.get(day, 0) + 1
    daily_stats = [{"date": d, "count": c} for d, c in sorted(daily_map.items())]
    
    return {
        "total_notifications": total_notifications,
        "notifications_by_type": notifications_by_type,
        "read_stats": {
            "read": read_stats.get(True, 0),
            "unread": read_stats.get(False, 0)
        },
        "daily_stats": daily_stats,
        "period_days": days
    }
