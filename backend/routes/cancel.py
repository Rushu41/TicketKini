
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update
from datetime import datetime, timedelta
import asyncio
import logging
from typing import Optional

from backend.database.database import get_db
from backend.database.models.user import User
from backend.database.models.booking import Booking
from backend.database.models.payment import Payment
from backend.middleware.jwt_auth import get_current_user

router = APIRouter(prefix="/cancel", tags=["cancellation"])

logger = logging.getLogger(__name__)

@router.get("/ping")
async def cancel_router_ping():
    """Health check for cancel router mounting"""
    return {"ok": True, "router": "cancel"}

@router.post("/booking/{booking_id}")
async def cancel_booking(
    booking_id: int,
    reason: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Manually cancel a booking"""
    
    # Get the booking
    result = await db.execute(
        select(Booking).where(Booking.id == booking_id)
    )
    booking = result.scalar_one_or_none()
    
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found"
        )
    
    # Check if user owns the booking or is admin
    if booking.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to cancel this booking"
        )
    
    # Check if booking can be cancelled
    if booking.status not in ["PENDING", "CONFIRMED", "CART"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel booking with status: {booking.status}"
        )
    
    # Check cancellation policy (e.g., cannot cancel within 2 hours of departure)
    if booking.status == "CONFIRMED":
        # For confirmed bookings, check if it's too late to cancel
        # This would require checking the schedule/departure time
        # For now, we'll allow cancellation but could add time restrictions
        pass
    
    # Update booking status
    booking.status = "CANCELLED"
    booking.cancelled_at = datetime.utcnow()
    booking.cancellation_reason = reason
    
    # Get seat numbers for response
    cancelled_seats = booking.seats or []
    
    # If there was a payment, initiate refund process
    payment_result = await db.execute(
        select(Payment).where(
            and_(
                Payment.booking_id == booking_id,
                Payment.status == "COMPLETED"
            )
        )
    )
    payment = payment_result.scalar_one_or_none()
    
    refund_info = None
    if payment:
        # Create refund entry
        refund_amount = calculate_refund_amount(booking, payment)
        
        # In a real system, you'd integrate with payment gateway for refunds
        # For now, we'll just mark it as pending refund
        payment.refund_status = "PENDING"
        payment.refund_amount = refund_amount
        payment.refund_initiated_at = datetime.utcnow()
        
        refund_info = {
            "refund_amount": refund_amount,
            "original_amount": float(payment.amount),
            "refund_status": "PENDING",
            "estimated_refund_days": 3-7
        }
    
    await db.commit()
    
    # Log the cancellation
    logger.info(f"Booking {booking_id} cancelled by user {current_user.id}. Reason: {reason}")
    
    return {
        "message": f"Booking cancelled successfully. Seats {', '.join(map(str, cancelled_seats))} are now available for booking.",
        "booking_id": booking_id,
        "status": "CANCELLED",
        "cancelled_at": booking.cancelled_at,
        "freed_seats": cancelled_seats,
        "refund_info": refund_info
    }

def calculate_refund_amount(booking: Booking, payment: Payment) -> float:
    """Calculate refund amount based on cancellation policy"""
    
    # Simple cancellation policy:
    # - More than 24 hours before departure: 90% refund
    # - 12-24 hours before: 50% refund  
    # - Less than 12 hours: 10% refund (processing fee)
    
    # For this example, we'll return 90% since we don't have departure time logic
    # In a real system, you'd check the schedule/departure time
    
    hours_before_departure = 25  # Placeholder - would calculate from schedule
    
    if hours_before_departure > 24:
        refund_percentage = 0.90
    elif hours_before_departure > 12:
        refund_percentage = 0.50
    else:
        refund_percentage = 0.10
    
    # Convert Decimal to float to avoid type error
    return round(float(payment.amount) * refund_percentage, 2)

# Background task to auto-cancel expired bookings
async def auto_cancel_expired_bookings(db: AsyncSession):
    """Auto-cancel PENDING and CART bookings that have expired based on expires_at field"""
    
    try:
        current_time = datetime.utcnow()
        
        # Find expired PENDING and CART bookings using expires_at field
        result = await db.execute(
            select(Booking).where(
                and_(
                    Booking.status.in_(["PENDING", "CART"]),
                    Booking.expires_at < current_time
                )
            )
        )
        expired_bookings = result.scalars().all()
        
        cancelled_count = 0
        for booking in expired_bookings:
            booking.status = "EXPIRED"  # Use EXPIRED status, not CANCELLED
            booking.cancelled_at = current_time
            booking.cancellation_reason = "Auto-expired due to payment timeout"
            cancelled_count += 1
            booking.cancelled_at = current_time
            booking.cancellation_reason = "Auto-expired due to payment timeout"
            cancelled_count += 1
        
        if cancelled_count > 0:
            await db.commit()
            logger.info(f"Auto-expired {cancelled_count} bookings")
        
        return cancelled_count
        
    except Exception as e:
        logger.error(f"Error in auto_cancel_expired_bookings: {str(e)}")
        await db.rollback()
        return 0

@router.get("/expired-bookings")
async def get_expired_bookings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get list of expired PENDING bookings (for admin/debugging)"""
    
    # Only allow admins to see this
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    cutoff_time = datetime.utcnow() - timedelta(minutes=15)
    
    result = await db.execute(
        select(Booking).where(
            and_(
                Booking.status == "PENDING",
                Booking.created_at < cutoff_time
            )
        )
    )
    expired_bookings = result.scalars().all()
    
    return {
        "expired_bookings": [
            {
                "id": booking.id,
                "user_id": booking.user_id,
                "created_at": booking.created_at,
                "minutes_expired": int((datetime.utcnow() - booking.created_at).total_seconds() / 60)
            }
            for booking in expired_bookings
        ],
        "count": len(expired_bookings)
    }

@router.post("/run-auto-cancel")
async def run_auto_cancel_manually(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Manually trigger auto-cancellation (for admin/testing)"""
    
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    cancelled_count = await auto_cancel_expired_bookings(db)
    
    return {
        "message": f"Auto-cancellation completed",
        "cancelled_bookings": cancelled_count
    }

