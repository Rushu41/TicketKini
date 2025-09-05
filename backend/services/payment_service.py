import logging
from datetime import datetime
from typing import Dict, Optional
import random
import string

from backend.models.payment import (
    PaymentMethod,
)

logger = logging.getLogger(__name__)

async def process_payment(
    payment_method: PaymentMethod,
    amount: float,
    payment_details: Dict,
    reference_id: str
) -> Dict:
    """
    Process payment through the appropriate payment gateway
    Args:
        payment_method: Payment method (card, bkash, etc.)
        amount: Payment amount
        payment_details: Payment method specific details
        reference_id: Unique reference ID for the transaction
    Returns:
        Dictionary with payment processing result
    """
    try:
        logger.info("Processing payment via %s for %s BDT, reference: %s", payment_method, amount, reference_id)
        
        # Validate payment details based on method
        if not validate_payment_details(payment_method, payment_details):
            return {
                "success": False,
                "error": "Invalid payment details",
                "transaction_id": None
            }
        
        # Simulate different payment gateway processing
        if payment_method == PaymentMethod.CARD:
            result = process_card_payment(amount, payment_details, reference_id)
        elif payment_method == PaymentMethod.BKASH:
            result = process_bkash_payment(amount, payment_details, reference_id)
        elif payment_method == PaymentMethod.NAGAD:
            result = process_nagad_payment(amount, payment_details, reference_id)
        elif payment_method == PaymentMethod.ROCKET:
            result = process_rocket_payment(amount, payment_details, reference_id)
        else:
            result = {
                "success": False,
                "error": "Payment method not supported",
                "transaction_id": None
            }
        
        logger.info("Payment processed: %s", result)
        return result
        
    except (ValueError, KeyError, RuntimeError, TypeError) as e:
        logger.error("Payment processing error: %s", str(e))
        return {
            "success": False,
            "error": str(e),
            "transaction_id": None
        }

def validate_payment_details(payment_method: PaymentMethod, details: Dict) -> bool:
    """Validate payment details based on payment method"""
    if payment_method == PaymentMethod.CARD:
        required_fields = {'card_number', 'expiry', 'cvv', 'card_holder'}
    elif payment_method in [PaymentMethod.BKASH, PaymentMethod.NAGAD, PaymentMethod.ROCKET]:
        required_fields = {'phone_number', 'pin'}
    else:
        return False
    
    return all(field in details for field in required_fields)

def process_card_payment(amount: float, details: Dict, reference_id: str) -> Dict:
    """Process card payment through simulated gateway"""
    # Simulate processing delay
    import time
    time.sleep(2)
    # touch args to avoid unused warnings in static checks
    _ = (amount, details.get("card_holder") if isinstance(details, dict) else details)
    
    # Simulate random failures (10% chance)
    if random.random() < 0.1:
        return {
            "success": False,
            "error": "Card declined",
            "transaction_id": None,
            "gateway_response": {
                "code": "DECLINED",
                "message": "Insufficient funds"
            }
        }
    
    # Simulate successful transaction
    transaction_id = f"CARD-{reference_id}-{generate_random_string(8)}"
    return {
        "success": True,
        "transaction_id": transaction_id,
        "gateway_transaction_id": f"GW-{transaction_id}",
        "gateway_response": {
            "code": "SUCCESS",
            "message": "Payment approved"
        }
    }

def process_bkash_payment(amount: float, details: Dict, reference_id: str) -> Dict:
    """Process bKash payment through simulated gateway"""
    # Simulate processing delay
    import time
    time.sleep(1.5)
    _ = (amount, details.get("phone_number") if isinstance(details, dict) else details)
    
    # Simulate random failures (5% chance)
    if random.random() < 0.05:
        return {
            "success": False,
            "error": "bKash payment failed",
            "transaction_id": None,
            "gateway_response": {
                "code": "FAILED",
                "message": "Invalid PIN"
            }
        }
    
    transaction_id = f"BKASH-{reference_id}-{generate_random_string(6)}"
    return {
        "success": True,
        "transaction_id": transaction_id,
        "gateway_transaction_id": f"GW-{transaction_id}",
        "gateway_response": {
            "code": "SUCCESS",
            "message": "Payment completed"
        }
    }

def process_nagad_payment(amount: float, details: Dict, reference_id: str) -> Dict:
    """Process Nagad payment through simulated gateway"""
    # Simulate processing delay
    import time
    time.sleep(1)
    _ = (amount, details)
    
    transaction_id = f"NAGAD-{reference_id}-{generate_random_string(6)}"
    return {
        "success": True,
        "transaction_id": transaction_id,
        "gateway_transaction_id": f"GW-{transaction_id}",
        "gateway_response": {
            "code": "SUCCESS",
            "message": "Payment completed"
        }
    }

def process_rocket_payment(amount: float, details: Dict, reference_id: str) -> Dict:
    """Process Rocket payment through simulated gateway"""
    # Simulate processing delay
    import time
    time.sleep(1.2)
    _ = (amount, details)
    
    # Simulate random failures (7% chance)
    if random.random() < 0.07:
        return {
            "success": False,
            "error": "Rocket payment failed",
            "transaction_id": None,
            "gateway_response": {
                "code": "FAILED",
                "message": "Transaction timeout"
            }
        }
    
    transaction_id = f"ROCKET-{reference_id}-{generate_random_string(6)}"
    return {
        "success": True,
        "transaction_id": transaction_id,
        "gateway_transaction_id": f"GW-{transaction_id}",
        "gateway_response": {
            "code": "SUCCESS",
            "message": "Payment completed"
        }
    }

async def process_refund_gateway(
    original_transaction_id: str,
    refund_amount: float,
    reason: str
) -> Dict:
    """
    Process refund through payment gateway
    Args:
        original_transaction_id: Original payment transaction ID
        refund_amount: Amount to refund
        reason: Reason for refund
    Returns:
        Dictionary with refund processing result
    """
    try:
        logger.info("Processing refund for transaction %s, amount: %s, reason: %s", original_transaction_id, refund_amount, reason)
        
        # Simulate processing delay
        import time
        time.sleep(2.5)
        
        # Simulate random failures (15% chance)
        if random.random() < 0.15:
            return {
                "success": False,
                "error": "Refund processing failed",
                "refund_transaction_id": None
            }
        
        # Simulate successful refund
        refund_id = f"REF-{original_transaction_id}-{generate_random_string(6)}"
        return {
            "success": True,
            "refund_transaction_id": refund_id,
            "gateway_response": {
                "code": "REFUNDED",
                "message": "Refund processed"
            }
        }
        
    except (ValueError, KeyError, RuntimeError, TypeError) as e:
        logger.error("Refund processing error: %s", str(e))
        return {
            "success": False,
            "error": str(e),
            "refund_transaction_id": None
        }

def calculate_discount(
    original_amount: float,
    coupon_type: str,
    discount_value: float,
    max_discount: Optional[float] = None
) -> float:
    """
    Calculate discount amount based on coupon type
    Args:
        original_amount: Original amount before discount
        coupon_type: 'PERCENTAGE' or 'FIXED'
        discount_value: Discount percentage or fixed amount
        max_discount: Maximum discount amount (for percentage coupons)
    Returns:
        Calculated discount amount
    """
    if coupon_type == "PERCENTAGE":
        discount = (original_amount * discount_value) / 100
        if max_discount is not None:
            discount = min(discount, max_discount)
    else:
        discount = min(discount_value, original_amount)
    
    return round(discount, 2)

def generate_pnr() -> str:
    """
    Generate a unique PNR (Passenger Name Record) for bookings
    Format: 6 alphanumeric characters, uppercase
    Example: 'A1B2C3'
    """
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choice(chars) for _ in range(6))

async def send_confirmation_email(
    user_email: str,
    booking,
    payment
) -> bool:
    """
    Send booking confirmation email to user
    Args:
        user_email: User's email address
        booking: Booking details
        payment: Payment details
    Returns:
        True if email was sent successfully
    """
    try:
        # In a real implementation, this would connect to an email service
        # booking/payment can be ORM objects or dicts; normalize id safely
        b_id = getattr(booking, 'id', None) or (booking.get('id') if isinstance(booking, dict) else None)
        p_id = getattr(payment, 'id', None) or (payment.get('id') if isinstance(payment, dict) else None)
        logger.info("Sending confirmation email to %s for booking %s (payment %s)", user_email, b_id, p_id)

        # Simulate email sending delay
        import time
        time.sleep(1)

        logger.info("Email sent to %s successfully", user_email)
        return True
    except (RuntimeError, OSError, ValueError, TypeError) as e:
        logger.error("Failed to send email to %s: %s", user_email, str(e))
        return False

async def send_confirmation_sms(
    phone_number: str,
    pnr: str,
    travel_date: datetime
) -> bool:
    """
    Send booking confirmation SMS to user
    Args:
        phone_number: User's phone number
        pnr: Booking PNR
        travel_date: Travel date
    Returns:
        True if SMS was sent successfully
    """
    try:
        # In a real implementation, this would connect to an SMS gateway
        logger.info("Sending SMS to %s with PNR %s for travel date %s", phone_number, pnr, travel_date)
        
        # Simulate SMS sending delay
        import time
        time.sleep(0.5)
        
        logger.info("SMS sent to %s successfully", phone_number)
        return True
    except (RuntimeError, OSError, ValueError, TypeError) as e:
        logger.error("Failed to send SMS to %s: %s", phone_number, str(e))
        return False

def generate_random_string(length: int = 8) -> str:
    """Generate a random alphanumeric string"""
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(length))