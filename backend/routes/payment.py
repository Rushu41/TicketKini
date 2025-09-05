from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete, update
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime, timedelta
import logging

from backend.database.database import get_db
from backend.database.models.user import User
from backend.database.models.booking import Booking
from backend.database.models.payment import Payment, PaymentStatusEnum, PaymentMethodEnum
from backend.database.models.coupon import Coupon, CouponType
from backend.models.payment import (
    PaymentResponse, 
    RefundRequest, 
    RefundResponse,
    PaymentCreate,
    PaymentMethod
)
from backend.models.booking import BookingStatus
from backend.middleware.jwt_auth import get_current_user
from backend.services.payment_service import (
    process_payment, 
    generate_pnr,
    send_confirmation_sms,
    send_confirmation_email, 
    process_refund_gateway
)
from backend.middleware.logger import log_user_action
from backend.services.notification_service import NotificationService

router = APIRouter()
logger = logging.getLogger(__name__)

async def _compute_user_total_bookings(db: AsyncSession, user_id: int) -> int:
    """Count total confirmed/completed bookings for user"""
    bookings_count_q = select(Booking.id).where(
        and_(
            Booking.user_id == user_id,
            Booking.status.in_(["CONFIRMED", "COMPLETED"])
        )
    )
    result = await db.execute(bookings_count_q)
    total_bookings = len(result.scalars().all())
    return total_bookings

async def _compute_user_total_tickets(db: AsyncSession, user_id: int) -> int:
    """Sum total seats (tickets) across user's confirmed/completed bookings"""
    bookings_q = select(Booking).where(
        and_(
            Booking.user_id == user_id,
            Booking.status.in_(["CONFIRMED", "COMPLETED"])
        )
    )
    result = await db.execute(bookings_q)
    bookings = result.scalars().all()
    total_tickets = 0
    for b in bookings:
        try:
            total_tickets += len(b.seats or [])
        except (TypeError, AttributeError) as e:
            logger.warning("Failed to count seats for booking id=%s: %s", getattr(b, "id", None), e)
    return total_tickets

async def _get_auto_discount(db: AsyncSession, user_id: int, order_amount: float) -> dict:
    """Determine automatic discount based on user's booking history.
    Silver and Gold Pass System:
    - First booking (0 bookings so far): 5% (FIRSTTIME5)
    - Gold Pass (40+ bookings): 8% (GOLD40)
    - Silver Pass (20+ bookings): 5% (SILVER20)
    Returns dict with percent, code, amount, reason.
    """
    total_bookings = await _compute_user_total_bookings(db, user_id)
    percent = 0.0
    code = None
    reason = None

    if total_bookings == 0:
        percent = 5.0
        code = "FIRSTTIME5"
        reason = "First-time booking discount"
    elif total_bookings >= 40:
        percent = 8.0
        code = "GOLD40"
        reason = "Gold Pass member discount (40+ bookings)"
    elif total_bookings >= 20:
        percent = 5.0
        code = "SILVER20"
        reason = "Silver Pass member discount (20+ bookings)"

    amount = round((order_amount * percent) / 100.0, 2) if percent > 0 else 0.0
    return {"percent": percent, "code": code, "amount": amount, "reason": reason, "bookings": total_bookings}

@router.post("/", response_model=PaymentResponse)
async def process_booking_payment(
    payment_request: PaymentCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Process payment for a booking"""
    
    # Cache user primitives early to avoid any lazy attribute refresh later
    user_id = int(current_user.id)
    user_email = getattr(current_user, 'email', None)
    user_phone = getattr(current_user, 'phone', None)

    # Get booking details
    booking_query = select(Booking).where(Booking.id == payment_request.booking_id)
    booking_result = await db.execute(booking_query)
    booking = booking_result.scalar_one_or_none()
    
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found"
        )
    
    # Cache booking id early to use after commits
    booking_id_cached = int(booking.id) if booking else None

    # Verify booking ownership
    if booking.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Check if booking is still valid
    if booking.status not in [BookingStatus.CART, BookingStatus.PENDING]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot pay for booking with status: {booking.status}"
        )
    
    # If booking is in CART status, we need to check availability again and move to PENDING
    if booking.status == BookingStatus.CART:
        # Check if seats are still available
        from backend.services.booking_service import BookingService
        booking_service = BookingService(db)
        
        # Check availability for the seats
        availability = await booking_service.check_availability(
            booking.schedule_id,
            booking.seats,
            booking.seat_class,
            booking.travel_date.strftime("%Y-%m-%d") if booking.travel_date else None
        )
        
        if not availability["available"]:
            # Seats are no longer available, return to cart status
            booking.status = BookingStatus.CART
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Seats are no longer available: {availability['message']}. Please select different seats."
            )
        
        # Move booking to PENDING status to block the seats during payment
        booking.status = BookingStatus.PENDING
        # Update booking amount in case of price changes
        booking.total_price = availability["total_price"]
    await db.commit()
    logger.info("Booking %s moved from CART to PENDING status", booking_id_cached)
    
    # Check if payment already exists for this booking
    existing_payment_query = select(Payment).where(Payment.booking_id == booking.id)
    existing_payment_result = await db.execute(existing_payment_query)
    existing_payment = existing_payment_result.scalar_one_or_none()
    
    if existing_payment:
        if existing_payment.status == PaymentStatusEnum.COMPLETED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment already completed for this booking"
            )
        elif existing_payment.status == PaymentStatusEnum.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment is already being processed for this booking"
            )
        elif existing_payment.status == PaymentStatusEnum.FAILED:
            # Delete the failed payment record to allow retry
            await db.execute(
                delete(Payment).where(Payment.id == existing_payment.id)
            )
            await db.commit()
    
    # Check if booking has expired
    if booking.expires_at and booking.expires_at < datetime.now():
        # Auto-expire the booking
        booking.status = BookingStatus.EXPIRED
        booking.cancelled_at = datetime.now()
        await db.commit()
        
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Booking has expired. Please create a new booking."
        )
    
    # Calculate final amount (coupon only)
    original_amount = float(booking.total_price)
    discount_amount = 0.0
    final_amount = original_amount
    coupon_applied = None
    coupon_percent = None
    
    # If coupon code provided AND user opted to apply, validate and apply
    if payment_request.coupon_code and getattr(payment_request, "apply_coupon", True):
        # Check for Silver/Gold pass codes first
        coupon_upper = payment_request.coupon_code.upper()
        total_bookings = await _compute_user_total_bookings(db, user_id)
        
        if coupon_upper in ["SILVER20", "SILVERPASS"] and total_bookings >= 20:
            # Silver Pass discount
            discount_amount = round((original_amount * 5) / 100, 2)  # 5% discount
            final_amount = max(0.0, original_amount - discount_amount)
            coupon_applied = payment_request.coupon_code
            coupon_percent = 5.0
        elif coupon_upper in ["GOLD40", "GOLDPASS"] and total_bookings >= 40:
            # Gold Pass discount
            discount_amount = round((original_amount * 8) / 100, 2)  # 8% discount
            final_amount = max(0.0, original_amount - discount_amount)
            coupon_applied = payment_request.coupon_code
            coupon_percent = 8.0
        elif coupon_upper in ["SILVER20", "SILVERPASS", "GOLD40", "GOLDPASS"]:
            # User doesn't have enough bookings for the pass
            required_bookings = 20 if "SILVER" in coupon_upper else 40
            pass_type = "Silver" if "SILVER" in coupon_upper else "Gold"
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{pass_type} Pass requires {required_bookings} bookings. You have {total_bookings} bookings."
            )
        else:
            # Regular coupon
            coupon_result = await apply_coupon(
                db, payment_request.coupon_code, original_amount, user_id
            )
            if coupon_result["valid"]:
                discount_amount = float(coupon_result["discount_amount"])  # type: ignore
                final_amount = max(0.0, original_amount - discount_amount)
                coupon_applied = payment_request.coupon_code
                coupon_percent = None  # Unknown exact percent for fixed coupons
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=coupon_result["error"]
                )
    
    # Create payment record
    # Map API payment method to database enum
    payment_method_mapping = {
        "CARD": PaymentMethodEnum.CARD,
        "BKASH": PaymentMethodEnum.BKASH,
        "NAGAD": PaymentMethodEnum.NAGAD,
        "ROCKET": PaymentMethodEnum.ROCKET,
        "UPAY": PaymentMethodEnum.UPAY,
        "BANK_TRANSFER": PaymentMethodEnum.BANK_TRANSFER,
        "CASH": PaymentMethodEnum.CASH
    }
    
    try:
        # payment_request.payment_method may already be an Enum (PaymentMethod); handle both cases
        if isinstance(payment_request.payment_method, PaymentMethod):
            method_key = payment_request.payment_method.value
        else:
            method_key = str(payment_request.payment_method).upper()

        payment_method_enum = payment_method_mapping.get(method_key)
        if not payment_method_enum:
            raise ValueError(f"Invalid payment method: {payment_request.payment_method}")
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        ) from e
    
    payment = Payment(
        booking_id=booking.id,
        user_id=user_id,
        amount=original_amount,  # Use original amount
        discount_amount=discount_amount,
        final_amount=final_amount,  # Use final amount after discount
        method=payment_method_enum,
        status=PaymentStatusEnum.PENDING,
        coupon_code=coupon_applied,
        coupon_discount_percent=coupon_percent
    )
    
    db.add(payment)
    # Cache primary key to avoid touching ORM after rollbacks/commits
    payment_id = None
    
    try:
        await db.flush()  # Get payment ID
        payment_id = payment.id
    except (ValueError, TypeError) as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create payment record: {str(e)}"
        ) from e
    
    try:
        # Process payment through payment gateway
        logger.info("Processing payment for booking %s, amount: %s, method: %s", booking.id, final_amount, payment_request.payment_method)
        logger.info("Payment details: %s", payment_request.payment_details)
        
        # Convert string payment method to PaymentMethod enum for the service
        try:
            # Normalize to PaymentMethod enum for service layer
            service_payment_method = payment_request.payment_method if isinstance(payment_request.payment_method, PaymentMethod) else PaymentMethod(str(payment_request.payment_method).upper())
            logger.info("Converted payment method: %s", service_payment_method)
        except (ValueError, AttributeError) as enum_error:
            logger.error("Invalid payment method: %s, error: %s", payment_request.payment_method, enum_error)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid payment method: {payment_request.payment_method}"
            ) from enum_error
        
        payment_details = payment_request.payment_details or {}
        
        # Map frontend field names to backend field names for mobile payments
        if service_payment_method in [PaymentMethod.BKASH, PaymentMethod.NAGAD, PaymentMethod.ROCKET]:
            if 'mobile_number' in payment_details:
                payment_details['phone_number'] = payment_details.pop('mobile_number')
            if 'transaction_id' in payment_details and not payment_details['transaction_id']:
                # Use a default PIN if transaction_id is empty (for mobile wallets, this acts as PIN)
                payment_details['pin'] = "1234"
            elif 'transaction_id' in payment_details:
                payment_details['pin'] = payment_details.pop('transaction_id')
        
        # Provide default payment details for testing if not provided
        if not payment_details:
            if service_payment_method == PaymentMethod.CARD:
                payment_details = {
                    "card_number": "4111111111111111",
                    "expiry": "12/25",
                    "cvv": "123",
                    "card_holder": "Test User"
                }
            elif service_payment_method in [PaymentMethod.BKASH, PaymentMethod.NAGAD, PaymentMethod.ROCKET]:
                payment_details = {
                    "phone_number": user_phone,
                    "pin": "1234"
                }
            else:
                payment_details = {}

        logger.info("Payment details being sent: %s", payment_details)

        payment_result = await process_payment(
            payment_method=service_payment_method,
            amount=final_amount,
            payment_details=payment_details,
            reference_id=f"TicketKini-{booking.id}-{payment.id}"
        )

        logger.info("Payment result: %s", payment_result)

        if payment_result["success"]:
            # Payment successful
            payment.status = PaymentStatusEnum.COMPLETED
            payment.transaction_id = payment_result["transaction_id"]
            payment.gateway_response = str(payment_result.get("gateway_response", ""))
            payment.payment_time = datetime.now()
            # Cache values to avoid post-commit lazy refresh
            trans_id = payment.transaction_id
            final_amt_logged = float(payment.final_amount)
            
            # Update booking status
            booking.status = BookingStatus.CONFIRMED
            try:
                booking.pnr = generate_pnr()
            except (ValueError, RuntimeError) as pnr_error:
                logger.error("Failed to generate PNR: %s", str(pnr_error))
                # Generate a simple PNR as fallback
                import random
                booking.pnr = f"TK{random.randint(100000, 999999)}"
            booking.confirmed_at = datetime.now()
            booking.updated_at = datetime.now()
            
            # Cache booking primitives needed after commit
            booking_pnr_cached = str(booking.pnr)
            travel_date_cached = booking.travel_date
            try:
                await db.commit()
                logger.info("Payment successful for booking %s, PNR: %s", booking_id_cached, booking_pnr_cached)
            except SQLAlchemyError as commit_error:
                logger.error("Failed to commit successful payment: %s", str(commit_error))
                await db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to save payment confirmation"
                ) from commit_error
            
            # Background tasks for notifications
            background_tasks.add_task(
                send_confirmation_email,
                user_email=user_email,
                booking={"id": booking_id_cached, "pnr": booking_pnr_cached},
                payment={"id": payment_id, "transaction_id": trans_id}
            )
            
            background_tasks.add_task(
                send_confirmation_sms,
                phone_number=user_phone,
                pnr=booking_pnr_cached,
                travel_date=travel_date_cached
            )

            # Create in-app notifications (booking confirmation and payment success)
            try:
                notif = NotificationService(db)
                # Booking confirmation (no email from NotificationService to avoid greenlet issues)
                await notif.create_notification(
                    user_id=user_id,
                    role="user",
                    title="Booking Confirmed! 🎫",
                    message=f"Your booking has been confirmed. PNR: {booking_pnr_cached}. Have a safe journey!",
                    notification_type="booking_confirmation",
                    priority="high",
                    send_email=False,
                    booking_id=booking_id_cached,
                    action_url=f"/pages/my-bookings.html?booking_id={booking_id_cached}",
                )
                # Payment success (no email from NotificationService)
                await notif.create_notification(
                    user_id=user_id,
                    role="user",
                    title="Payment Successful ✅",
                    message=f"Your payment of ৳{final_amt_logged} has been processed successfully.",
                    notification_type="payment_success",
                    priority="high",
                    send_email=False,
                    payment_id=payment_id,
                    action_url=f"/pages/confirmation.html?payment_id={payment_id}",
                )
            except (SQLAlchemyError, ValueError, RuntimeError) as notif_error:
                logger.error("Failed to create notifications: %s", str(notif_error))
            
            # Log successful payment
            log_user_action(
                user_id=user_id,
                action="PAYMENT_COMPLETED",
                details={
                    "booking_id": booking_id_cached,
                    "payment_id": payment_id,
                    "amount": final_amt_logged,
                    "method": payment_request.payment_method,
                    "pnr": booking_pnr_cached,
                    "discount_amount": discount_amount,
                    "coupon_code": coupon_applied
                }
            )
            
            return PaymentResponse(
                success=True,
                id=payment_id,
                transaction_id=trans_id,
                gateway_transaction_id=trans_id,  # Use same transaction_id
                message="Payment completed successfully",
                payment_url=None
            )
            
        else:
            # Payment failed
            payment.status = PaymentStatusEnum.FAILED
            payment.gateway_response = str(payment_result.get("error", "Payment processing failed"))
            failed_msg = payment.gateway_response
            await db.commit()
            
            # Log failed payment
            log_user_action(
                user_id=user_id,
                action="PAYMENT_FAILED",
                details={
                    "booking_id": booking_id_cached,
                    "payment_id": payment_id,
                    "amount": final_amount,
                    "method": payment_request.payment_method,
                    "error": failed_msg
                }
            )
            
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Payment failed: {payment.gateway_response}"
            )
            
    except HTTPException as http_error:
        # Roll back any pending transaction and log
        await db.rollback()
        logger.error("HTTP error in payment processing: %s", http_error.detail)
        
        # Best-effort: mark payment as FAILED via direct UPDATE to avoid touching ORM instance
        if payment_id is not None:
            try:
                await db.execute(
                    update(Payment)
                    .where(Payment.id == payment_id)
                    .values(
                        status=PaymentStatusEnum.FAILED,
                        gateway_response=str(http_error.detail),
                        updated_at=datetime.now(),
                    )
                )
                await db.commit()
            except SQLAlchemyError as commit_error:
                logger.error("Failed to update payment status: %s", str(commit_error))
        
        raise http_error
        
    except (ValueError, TypeError, RuntimeError, SQLAlchemyError) as e:
        # Handle unexpected errors
        await db.rollback()
        logger.error("Payment processing error: %s", str(e))
        logger.error("Error type: %s", type(e))
        import traceback
        logger.error("Traceback: %s", traceback.format_exc())
        
        # Best-effort: mark payment as FAILED via direct UPDATE (safe even if row doesn't exist)
        if payment_id is not None:
            try:
                await db.execute(
                    update(Payment)
                    .where(Payment.id == payment_id)
                    .values(
                        status=PaymentStatusEnum.FAILED,
                        gateway_response=str(e),
                        updated_at=datetime.now(),
                    )
                )
                await db.commit()
            except SQLAlchemyError as commit_error:
                logger.error("Failed to update payment status: %s", str(commit_error))
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Payment processing error: {str(e)}"
        ) from e

@router.post("/verify-coupon")
async def verify_coupon(
    coupon_code: str,
    booking_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Verify and calculate coupon discount"""
    
    # Get booking details
    booking_query = select(Booking).where(Booking.id == booking_id)
    booking_result = await db.execute(booking_query)
    booking = booking_result.scalar_one_or_none()
    
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found"
        )
    
    # Verify booking ownership
    if booking.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Check for Silver/Gold pass eligibility
    total_bookings = await _compute_user_total_bookings(db, current_user.id)
    
    # Handle special pass codes
    coupon_upper = coupon_code.upper()
    if coupon_upper in ["SILVER20", "SILVERPASS"]:
        if total_bookings >= 20:
            discount_amount = round((float(booking.total_price) * 5) / 100, 2)  # 5% discount
            return {
                "valid": True,
                "discount_amount": discount_amount,
                "final_amount": max(0, float(booking.total_price) - discount_amount),
                "coupon_type": "SILVER_PASS",
                "message": f"Silver Pass discount applied! You have {total_bookings} bookings.",
                "pass_tier": "Silver"
            }
        else:
            remaining = 20 - total_bookings
            return {
                "valid": False,
                "error": f"Silver Pass requires 20 bookings. You have {total_bookings} bookings. {remaining} more needed."
            }
    
    elif coupon_upper in ["GOLD40", "GOLDPASS"]:
        if total_bookings >= 40:
            discount_amount = round((float(booking.total_price) * 8) / 100, 2)  # 8% discount
            return {
                "valid": True,
                "discount_amount": discount_amount,
                "final_amount": max(0, float(booking.total_price) - discount_amount),
                "coupon_type": "GOLD_PASS",
                "message": f"Gold Pass discount applied! You have {total_bookings} bookings.",
                "pass_tier": "Gold"
            }
        else:
            remaining = 40 - total_bookings
            return {
                "valid": False,
                "error": f"Gold Pass requires 40 bookings. You have {total_bookings} bookings. {remaining} more needed."
            }
    
    # Apply regular coupon
    coupon_result = await apply_coupon(
        db, coupon_code, float(booking.total_price), current_user.id
    )
    
    if coupon_result["valid"]:
        return {
            "valid": True,
            "discount_amount": coupon_result["discount_amount"],
            "final_amount": float(booking.total_price) - coupon_result["discount_amount"],
            "coupon_type": coupon_result["coupon_type"],
            "message": "Coupon applied successfully"
        }
    else:
        return {
            "valid": False,
            "error": coupon_result["error"]
        }

@router.get("/user-pass-status")
async def get_user_pass_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user's current pass status and eligibility"""
    
    total_bookings = await _compute_user_total_bookings(db, current_user.id)
    
    # Determine current pass tier
    if total_bookings >= 40:
        current_tier = "Gold"
        discount_rate = "8%"
        coupon_codes = ["GOLD40", "GOLDPASS"]
    elif total_bookings >= 20:
        current_tier = "Silver"
        discount_rate = "5%"
        coupon_codes = ["SILVER20", "SILVERPASS"]
    else:
        current_tier = "Standard"
        discount_rate = "0%"
        coupon_codes = []
    
    # Calculate progress to next tier
    if total_bookings < 20:
        next_tier = "Silver"
        progress_current = total_bookings
        progress_target = 20
        progress_percentage = (total_bookings / 20) * 100
    elif total_bookings < 40:
        next_tier = "Gold"
        progress_current = total_bookings
        progress_target = 40
        progress_percentage = (total_bookings / 40) * 100
    else:
        next_tier = None
        progress_current = total_bookings
        progress_target = total_bookings
        progress_percentage = 100
    
    return {
        "current_tier": current_tier,
        "total_bookings": total_bookings,
        "discount_rate": discount_rate,
        "available_coupon_codes": coupon_codes,
        "next_tier": {
            "name": next_tier,
            "current_progress": progress_current,
            "target": progress_target,
            "percentage": round(progress_percentage, 1),
            "remaining": max(0, progress_target - progress_current) if next_tier else 0
        },
        "tier_benefits": {
            "Standard": {
                "discount": "0%",
                "description": "Basic booking privileges"
            },
            "Silver": {
                "discount": "5%",
                "description": "5% discount on all bookings (20+ bookings required)",
                "coupon_codes": ["SILVER20", "SILVERPASS"]
            },
            "Gold": {
                "discount": "8%",
                "description": "8% discount on all bookings (40+ bookings required)",
                "coupon_codes": ["GOLD40", "GOLDPASS"]
            }
        }
    }



@router.post("/refund", response_model=RefundResponse)
async def process_refund(
    refund_request: RefundRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Process refund for a cancelled booking"""
    
    # Get payment details
    payment_query = select(Payment).where(Payment.id == refund_request.payment_id)
    payment_result = await db.execute(payment_query)
    payment = payment_result.scalar_one_or_none()
    
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found"
        )
    
    # Verify payment ownership or admin access
    if payment.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Check if payment is eligible for refund
    if payment.status != PaymentStatusEnum.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only completed payments can be refunded"
        )
    
    # Get associated booking
    booking_query = select(Booking).where(Booking.id == payment.booking_id)
    booking_result = await db.execute(booking_query)
    booking = booking_result.scalar_one_or_none()
    
    if not booking or booking.status != BookingStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Booking must be cancelled to process refund"
        )
    
    # Calculate refund amount based on cancellation policy
    refund_amount = calculate_refund_amount(
        original_amount=float(payment.final_amount),  # Use final_amount
        booking_date=booking.travel_date,
        cancellation_date=booking.cancelled_at or datetime.now()
    )
    
    if refund_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No refund amount due based on cancellation policy"
        )
    
    # Process refund through payment gateway
    try:
        refund_result = await process_refund_gateway(
            original_transaction_id=payment.transaction_id,
            refund_amount=refund_amount,
            reason=refund_request.reason
        )
        
        if refund_result["success"]:
            # Create refund record
            payment.refund_amount = refund_amount
            payment.refunded_at = datetime.now()
            
            await db.commit()
            
            # Log refund
            log_user_action(
                user_id=current_user.id,
                action="REFUND_PROCESSED",
                details={
                    "payment_id": payment.id,
                    "booking_id": booking.id,
                    "refund_amount": refund_amount,
                    "reason": refund_request.reason
                }
            )
            
            return RefundResponse(
                success=True,
                refund_id=refund_result.get("refund_transaction_id", ""),
                refund_amount=refund_amount,
                message="Refund processed successfully",
                estimated_days=3
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Refund processing failed: {refund_result.get('error')}"
            )
            
    except (ValueError, RuntimeError, TypeError, SQLAlchemyError) as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Refund processing error"
        ) from e

@router.get("/history")
async def get_payment_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get payment history for current user"""
    
    payments_query = select(Payment).where(Payment.user_id == current_user.id)
    payments_result = await db.execute(payments_query)
    payments = payments_result.scalars().all()
    
    return [
        {
            "id": payment.id,
            "booking_id": payment.booking_id,
            "amount": float(payment.final_amount),
            "payment_method": payment.method.value,
            "status": payment.status.value,
            "transaction_id": payment.transaction_id,
            "created_at": payment.created_at.isoformat() if payment.created_at else None
        }
        for payment in payments
    ]

@router.get("/{payment_id}")
async def get_payment_details(
    payment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get payment details by ID"""
    
    payment_query = select(Payment).where(Payment.id == payment_id)
    payment_result = await db.execute(payment_query)
    payment = payment_result.scalar_one_or_none()
    
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found"
        )
    
    # Verify payment ownership or admin access
    if payment.user_id != current_user.id and not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return {
        "id": payment.id,
        "booking_id": payment.booking_id,
        "user_id": payment.user_id,
        "amount": float(payment.amount),
        "final_amount": float(payment.final_amount),
        "discount_amount": float(payment.discount_amount) if payment.discount_amount else 0.0,
        "coupon_code": payment.coupon_code,
        "payment_method": payment.method.value,
        "status": payment.status.value,
        "transaction_id": payment.transaction_id,
        "gateway_response": payment.gateway_response,
        "created_at": payment.created_at.isoformat() if payment.created_at else None,
        "payment_time": payment.payment_time.isoformat() if payment.payment_time else None,
        "updated_at": payment.updated_at.isoformat() if payment.updated_at else None
    }

async def apply_coupon(
    db: AsyncSession, 
    coupon_code: str, 
    booking_amount: float, 
    user_id: int
) -> dict:
    """Apply and validate coupon code using Coupon model fields"""
    
    # Get coupon details
    coupon_query = select(Coupon).where(Coupon.code == coupon_code.upper())
    coupon_result = await db.execute(coupon_query)
    coupon = coupon_result.scalar_one_or_none()
    
    if not coupon:
        # Attempt to seed known default coupons on-the-fly (helps dev/test envs)
        seeded = await _seed_default_coupon_if_known(db, coupon_code)
        if seeded:
            # Re-fetch after seeding
            coupon_result = await db.execute(coupon_query)
            coupon = coupon_result.scalar_one_or_none()
        if not coupon:
            return {"valid": False, "error": "Invalid coupon code"}
    
    # Validate active/valid window and global usage
    is_valid, reason = coupon.is_valid
    if not is_valid:
        return {"valid": False, "error": reason}
    
    # Minimum order value
    if coupon.min_order_value and booking_amount < coupon.min_order_value:
        return {
            "valid": False, 
            "error": f"Minimum booking amount of ৳{coupon.min_order_value} required"
        }
    
    # Per-user usage limit
    if coupon.user_usage_limit:
        user_usage_query = select(Payment).where(
            and_(
                Payment.user_id == user_id,
                Payment.coupon_code == coupon.code,
                Payment.status == PaymentStatusEnum.COMPLETED
            )
        )
        user_usage_result = await db.execute(user_usage_query)
        user_usage_count = len(user_usage_result.scalars().all())
        
        if user_usage_count >= coupon.user_usage_limit:
            return {"valid": False, "error": "You have already used this coupon"}
    
    # Calculate discount via model utility
    discount_amount, msg = coupon.calculate_discount(booking_amount)
    
    if discount_amount <= 0:
        return {"valid": False, "error": msg}
    
    # Update global usage count (optimistic; final commit on payment success is elsewhere)
    # Note: Not incrementing here to avoid race conditions; rely on payment completion to record usage
    
    return {
        "valid": True,
        "discount_amount": float(discount_amount),
        "coupon_type": coupon.coupon_type.value
    }

async def _seed_default_coupon_if_known(db: AsyncSession, code: str) -> bool:
    """Create a default coupon record for known codes if missing.
    Returns True if a coupon was created; False otherwise.
    """
    try:
        key = code.strip().upper()
        # Check again if exists to avoid duplicates
        exists_q = select(Coupon).where(Coupon.code == key)
        exists_res = await db.execute(exists_q)
        if exists_res.scalar_one_or_none():
            return False

        if key == "WELCOME10":
            coupon = Coupon(
                code="WELCOME10",
                name="Welcome Discount",
                description="10% off on your first booking",
                coupon_type=CouponType.FIRST_TIME,
                discount_percent=10.0,
                min_order_value=500.0,
                max_discount=200.0,
                user_usage_limit=1,
                usage_limit=1000,
                valid_until=datetime.utcnow() + timedelta(days=365)
            )
        elif key == "SUMMER25":
            coupon = Coupon(
                code="SUMMER25",
                name="Summer Special",
                description="25% off on all bookings",
                coupon_type=CouponType.SEASONAL,
                discount_percent=25.0,
                min_order_value=1000.0,
                max_discount=500.0,
                usage_limit=500,
                valid_until=datetime.utcnow() + timedelta(days=90)
            )
        elif key == "FIXED100":
            coupon = Coupon(
                code="FIXED100",
                name="Fixed Discount",
                description="৳100 off on bookings above ৳1000",
                coupon_type=CouponType.FIXED_AMOUNT,
                discount_amount=100.0,
                min_order_value=1000.0,
                usage_limit=200,
                valid_until=datetime.utcnow() + timedelta(days=30)
            )
        else:
            return False

        db.add(coupon)
        await db.commit()
        return True
    except SQLAlchemyError:
        # Don't block the main flow on seed failure
        await db.rollback()
        return False

def calculate_refund_amount(
    original_amount: float, 
    booking_date: datetime, 
    cancellation_date: datetime
) -> float:
    """Calculate refund amount based on cancellation policy"""
    
    # Calculate hours before departure
    hours_before = (booking_date - cancellation_date).total_seconds() / 3600
    
    # Define cancellation policy
    if hours_before >= 48:  # 48+ hours before
        refund_percentage = 0.90  # 90% refund (10% cancellation fee)
    elif hours_before >= 24:  # 24-48 hours before
        refund_percentage = 0.75  # 75% refund (25% cancellation fee)
    elif hours_before >= 12:  # 12-24 hours before
        refund_percentage = 0.50  # 50% refund (50% cancellation fee)
    elif hours_before >= 4:   # 4-12 hours before
        refund_percentage = 0.25  # 25% refund (75% cancellation fee)
    else:  # Less than 4 hours before
        refund_percentage = 0.00  # No refund
    
    # Calculate refund amount
    refund_amount = original_amount * refund_percentage
    
    # Minimum refund amount (service fee coverage)
    min_refund = 50.0  # Minimum ৳50 processing fee
    if refund_amount > 0 and refund_amount < min_refund:
        refund_amount = 0.0
    
    return round(refund_amount, 2)

