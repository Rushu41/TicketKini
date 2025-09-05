from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
import time
import logging
from typing import Callable
import json

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger("ticketkini")

def get_logger(name: str = "ticketkini"):
    """Get a configured logger instance"""
    return logging.getLogger(name)

class LoggerMiddleware(BaseHTTPMiddleware):
    """Custom logging middleware to log all requests and responses"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        
        # Extract request info
        method = request.method
        url = str(request.url)
        path = request.url.path
        query_params = dict(request.query_params)
        client_ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        
        # Log request
        logger.info(f"Request: {method} {path} from {client_ip}")
        
        # Process request
        try:
            response = await call_next(request)
            process_time = time.time() - start_time
            
            # Log response
            status_code = response.status_code
            logger.info(
                f"Response: {method} {path} - "
                f"Status: {status_code} - "
                f"Time: {process_time:.3f}s"
            )
            
            # Add custom headers
            response.headers["X-Process-Time"] = str(process_time)
            
            # Log slow requests (>2 seconds)
            if process_time > 2:
                logger.warning(
                    f"Slow request detected: {method} {path} - "
                    f"Time: {process_time:.3f}s"
                )
            
            # Log errors
            if status_code >= 400:
                logger.error(
                    f"Error response: {method} {path} - "
                    f"Status: {status_code} - "
                    f"IP: {client_ip} - "
                    f"User-Agent: {user_agent}"
                )
            
            return response
            
        except Exception as e:
            process_time = time.time() - start_time
            logger.error(
                f"Request failed: {method} {path} - "
                f"Error: {str(e)} - "
                f"Time: {process_time:.3f}s"
            )
            raise

def log_user_action(user_id: int, action: str, details: dict = None):
    """Log user actions for audit trail"""
    log_data = {
        "user_id": user_id,
        "action": action,
        "timestamp": time.time(),
        "details": details or {}
    }
    
    logger.info(f"User Action: {json.dumps(log_data)}")

def log_booking_event(booking_id: int, event: str, user_id: int = None, details: dict = None):
    """Log booking-related events"""
    log_data = {
        "booking_id": booking_id,
        "event": event,
        "user_id": user_id,
        "timestamp": time.time(),
        "details": details or {}
    }
    
    logger.info(f"Booking Event: {json.dumps(log_data)}")

def log_payment_event(payment_id: int, event: str, amount: float = None, user_id: int = None):
    """Log payment-related events"""
    log_data = {
        "payment_id": payment_id,
        "event": event,
        "amount": amount,
        "user_id": user_id,
        "timestamp": time.time()
    }
    
    logger.info(f"Payment Event: {json.dumps(log_data)}")

from datetime import datetime, date
from typing import Optional

def log_search_action(
    source: str,
    destination: str,
    travel_date: date,
    results_count: int,
    filters_applied: dict = None,
    user_id: Optional[int] = None,
    client_ip: Optional[str] = None
):
    """Log search actions"""
    log_data = {
        "event": "search",
        "timestamp": datetime.now().isoformat(),
        "source": source,
        "destination": destination,
        "travel_date": travel_date.isoformat() if isinstance(travel_date, date) else travel_date,
        "results_count": results_count,
        "filters_applied": filters_applied or {},
        "user_id": user_id,
        "client_ip": client_ip
    }
    
    logger.info(f"Search Action: {json.dumps(log_data)}")