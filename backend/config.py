from pydantic_settings import BaseSettings
from pydantic import field_validator
from dotenv import load_dotenv
import os
from typing import List
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

load_dotenv()

class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # Environment
    DEBUG: bool = False
    ENVIRONMENT: str = "production"
    
    # Database
    DATABASE_URL: str = "postgresql://travelsync_user:ELSEg2AEI5WFKD7WvkUOxIaqxhI4qv6F@dpg-d2hmgf3e5dus73eph5b0-a.singapore-postgres.render.com/travelsync"
    
    # JWT Configuration
    JWT_SECRET_KEY: str = "iy76tD7Kh-3B0QqL8dZX9UcDkqvlWnGxfMNcL2k5uNQ"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # CORS
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:8080,http://127.0.0.1:8080"
    
    # Booking
    BOOKING_EXPIRY_MINUTES: int = 30000  # Increased from 15 to 30 minutes
    
    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100
    
    # Payment
    PAYMENT_GATEWAY_URL: str = "https://sandbox.payment-gateway.com"
    PAYMENT_API_KEY: str = "your_payment_api_key"
    
    # Admin credentials
    ADMIN_EMAIL: str = "admin@travelsync.com"
    ADMIN_PASSWORD: str = "TravelSync@Admin123!"
    
    # Email Configuration
    SMTP_SERVER: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    EMAIL_USER: str = os.getenv("EMAIL_USER", "")
    EMAIL_PASSWORD: str = os.getenv("EMAIL_PASSWORD", "")
    FROM_EMAIL: str = os.getenv("FROM_EMAIL", "noreply@ticketkini.com")
    
    # Notification Settings
    NOTIFICATION_EMAIL_ENABLED: bool = True
    NOTIFICATION_CLEANUP_DAYS: int = 30
    NOTIFICATION_MAX_RETRIES: int = 3
    
    # WebSocket Settings  
    WEBSOCKET_PING_INTERVAL: int = 30
    WEBSOCKET_HEARTBEAT_TIMEOUT: int = 60
    
    # Normalize DB URL: accept plain Render external URL (postgresql://) and convert to asyncpg with SSL
    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        if not v:
            return v
        s = v.strip()
        # Normalize legacy postgres scheme
        if s.startswith("postgres://"):
            s = "postgresql://" + s[len("postgres://"):]
        # Ensure async driver
        if s.startswith("postgresql://"):
            s = "postgresql+asyncpg://" + s[len("postgresql://"):]
        # For non-local hosts, ensure ssl=true and drop unsupported sslmode
        try:
            parsed = urlparse(s)
            qs = dict(parse_qsl(parsed.query))
            host = (parsed.hostname or "").lower()
            # Remove sslmode (asyncpg doesn't accept it)
            if "sslmode" in qs:
                qs.pop("sslmode", None)
            # Add ssl=true for known managed hosts (e.g., Render) if not present
            managed_hosts = ("render.com", "aws.amazon.com", "azure.com")
            if host and any(h in host for h in managed_hosts):
                if "ssl" not in qs:
                    qs["ssl"] = "true"
            new_query = urlencode(qs)
            s = urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment))
        except Exception:
            # Fall back to original if parsing fails
            return s
        return s

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"  # Allow extra fields from environment variables

# Global settings instance
settings = Settings()