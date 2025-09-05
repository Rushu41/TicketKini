from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.config import settings

def setup_cors(app: FastAPI) -> None:
    """Setup CORS middleware for the FastAPI application"""
    
    # Extended origins for development
    allowed_origins = [
        "http://localhost:3000",    # React dev server
        "http://localhost:5173",    # Vite default
        "http://127.0.0.1:5173",    # Vite default (127.0.0.1)
        "http://localhost:8080",    # Vue dev server  
        "http://127.0.0.1:8080",    # Local Vue
        "http://localhost:5500",    # Live Server extension
        "http://127.0.0.1:5500",    # Local Live Server
        "http://localhost:8000",    # Local development
        "http://127.0.0.1:8000",    # Local backend
        "http://localhost:3001",    # Alternative frontend port
        "http://127.0.0.1:3001",    # Alternative frontend port
        "file://",                  # Local file protocol
        "null",                     # Some browsers send Origin: null for file:// pages
        # Deployed frontend/backends
        "https://dbms-project-ljy4.onrender.com",
    ]
    
    # Add origins from settings
    if hasattr(settings, 'CORS_ORIGINS') and settings.CORS_ORIGINS:
        if isinstance(settings.CORS_ORIGINS, str):
            # Parse comma-separated string
            cors_origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(',') if origin.strip()]
            allowed_origins.extend(cors_origins)
        else:
            # Already a list
            allowed_origins.extend(settings.CORS_ORIGINS)
    
    app.add_middleware(
        CORSMiddleware,
        # Keep a conservative explicit list, but also allow any origin via regex for portability
        allow_origins=allowed_origins,
        allow_origin_regex=r".*",  # Accept requests from any origin, including file:// (null)
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=[
            "Accept",
            "Accept-Language",
            "Content-Language",
            "Content-Type",
            "Authorization",
            "X-Requested-With",
            "X-CSRF-Token",
        ],
        expose_headers=["X-Total-Count"],
        max_age=3600,  # Cache preflight requests for 1 hour
    )