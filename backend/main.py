from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager
import uvicorn
import asyncio
import logging

from backend.routes import auth, booking, search, payment, admin, cancel, feedback, seat_availability, notification
from backend.middleware.cors import setup_cors
from backend.middleware.logger import LoggerMiddleware
from backend.database.init_db import init_db
from backend.services.websocket_service import websocket_manager, cleanup_stale_connections_task
from backend.services.notification_service import arrival_reminder_loop

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    
    # Start background tasks
    cleanup_task = asyncio.create_task(cleanup_stale_connections_task())
    arrival_reminder_task = asyncio.create_task(arrival_reminder_loop())
    
    yield
    
    # Shutdown
    cleanup_task.cancel()
    arrival_reminder_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        logger.info("Cleanup task cancelled")
    try:
        await arrival_reminder_task
    except asyncio.CancelledError:
        logger.info("Arrival reminder task cancelled")

def create_app() -> FastAPI:
    """App factory to create and configure FastAPI instance"""
    
    app = FastAPI(
        title="TicketKini API",
        description="Full-Stack Travel Booking System",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan
    )
    
    # Setup CORS middleware
    setup_cors(app)
    
    # Add custom logger middleware
    app.add_middleware(LoggerMiddleware)
    
    # Include routers with prefixes
    app.include_router(auth.router, prefix="/auth", tags=["auth"])
    app.include_router(booking.router, prefix="/booking", tags=["booking"])
    app.include_router(search.router, tags=["search"])
    app.include_router(payment.router, prefix="/payment", tags=["payment"])
    app.include_router(admin.router, tags=["admin"])  # Remove prefix since it's defined in router
    # cancel.router already defines prefix="/cancel"; don't add it again here
    app.include_router(cancel.router, tags=["cancel"])
    # feedback.router already declares prefix; include without extra prefix
    app.include_router(feedback.router, tags=["feedback"])
    # notification.router already declares prefix; include without adding extra prefix
    app.include_router(notification.router, tags=["notifications"])
    app.include_router(seat_availability.router, tags=["seat-availability"])
    
    # WebSocket endpoint for real-time notifications
    @app.websocket("/ws/notifications/{user_id}")
    async def websocket_endpoint(websocket: WebSocket, user_id: int, role: str = "user"):
        await websocket_manager.connect_user(websocket, user_id, role)
        try:
            while True:
                # Listen for client messages
                data = await websocket.receive_json()
                
                # Handle different message types
                if data.get("type") == "ping":
                    await websocket_manager.handle_ping(websocket)
                elif data.get("type") == "typing":
                    await websocket_manager.send_typing_indicator(websocket, data.get("is_typing", False))
                    
        except WebSocketDisconnect:
            await websocket_manager.disconnect(websocket)
        except Exception as e:
            logger.error("WebSocket error: %s", str(e))
            await websocket_manager.disconnect(websocket)
    
    # WebSocket stats endpoint for admin
    @app.get("/admin/websocket-stats")
    async def get_websocket_stats():
        return websocket_manager.get_connection_stats()
    
    @app.get("/")
    async def root():
        return {"message": "TicketKini API is running!"}
    
    @app.get("/health")
    async def health_check():
        return {"status": "healthy"}
    
    return app


# Create app instance
app = create_app()

if __name__ == "__main__":
    uvicorn.run(
    "backend.main:app",
        host="127.0.0.1",
        port=8000,
    reload=True
    )
