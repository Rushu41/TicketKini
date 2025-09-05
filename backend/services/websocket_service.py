"""
WebSocket service for real-time notifications in TicketKini
Handles real-time push notifications to connected clients
"""
import json
import asyncio
from typing import Dict, List, Set, Optional, Any
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class NotificationWebSocketManager:
    def __init__(self):
        # Store active connections by user_id and role
        self.user_connections: Dict[int, Set[WebSocket]] = {}
        self.admin_connections: Set[WebSocket] = set()
        self.operator_connections: Set[WebSocket] = set()
        
        # Store connection metadata
        self.connection_info: Dict[WebSocket, Dict[str, Any]] = {}

    async def connect_user(self, websocket: WebSocket, user_id: int, role: str = "user"):
        """Connect a user websocket"""
        await websocket.accept()
        
        # Store connection info
        self.connection_info[websocket] = {
            "user_id": user_id,
            "role": role,
            "connected_at": datetime.utcnow(),
            "last_ping": datetime.utcnow()
        }
        
        # Add to appropriate connection pool
        if role == "admin":
            self.admin_connections.add(websocket)
        elif role == "operator":
            self.operator_connections.add(websocket)
        else:
            if user_id not in self.user_connections:
                self.user_connections[user_id] = set()
            self.user_connections[user_id].add(websocket)
        
        logger.info(f"WebSocket connected: user_id={user_id}, role={role}")
        
        # Send welcome message
        await self.send_to_connection(websocket, {
            "type": "connection_success",
            "message": "Connected to TicketKini notifications",
            "timestamp": datetime.utcnow().isoformat()
        })

    async def disconnect(self, websocket: WebSocket):
        """Disconnect a websocket"""
        if websocket not in self.connection_info:
            return
            
        connection_data = self.connection_info[websocket]
        user_id = connection_data.get("user_id")
        role = connection_data.get("role")
        
        # Remove from appropriate connection pool
        if role == "admin":
            self.admin_connections.discard(websocket)
        elif role == "operator":
            self.operator_connections.discard(websocket)
        else:
            if user_id in self.user_connections:
                self.user_connections[user_id].discard(websocket)
                if not self.user_connections[user_id]:
                    del self.user_connections[user_id]
        
        # Remove connection info
        del self.connection_info[websocket]
        
        logger.info(f"WebSocket disconnected: user_id={user_id}, role={role}")

    async def send_to_connection(self, websocket: WebSocket, data: Dict[str, Any]):
        """Send data to a specific connection"""
        try:
            await websocket.send_text(json.dumps(data, default=str))
        except Exception as e:
            logger.error(f"Failed to send message to websocket: {str(e)}")
            await self.disconnect(websocket)

    async def send_to_user(self, user_id: int, notification_data: Dict[str, Any]):
        """Send notification to specific user"""
        if user_id in self.user_connections:
            message = {
                "type": "notification",
                "data": notification_data,
                "timestamp": datetime.utcnow().isoformat()
            }
            
            # Send to all user's active connections
            disconnected = set()
            for websocket in self.user_connections[user_id]:
                try:
                    await self.send_to_connection(websocket, message)
                except:
                    disconnected.add(websocket)
            
            # Clean up disconnected websockets
            for websocket in disconnected:
                await self.disconnect(websocket)

    async def send_to_all_admins(self, notification_data: Dict[str, Any]):
        """Send notification to all connected admins"""
        message = {
            "type": "admin_notification", 
            "data": notification_data,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        disconnected = set()
        for websocket in self.admin_connections:
            try:
                await self.send_to_connection(websocket, message)
            except:
                disconnected.add(websocket)
        
        # Clean up disconnected websockets
        for websocket in disconnected:
            await self.disconnect(websocket)

    async def send_to_all_operators(self, notification_data: Dict[str, Any]):
        """Send notification to all connected operators"""
        message = {
            "type": "operator_notification",
            "data": notification_data,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        disconnected = set()
        for websocket in self.operator_connections:
            try:
                await self.send_to_connection(websocket, message)
            except:
                disconnected.add(websocket)
        
        # Clean up disconnected websockets
        for websocket in disconnected:
            await self.disconnect(websocket)

    async def broadcast_to_role(self, role: str, notification_data: Dict[str, Any]):
        """Broadcast notification to all users of a specific role"""
        if role == "admin":
            await self.send_to_all_admins(notification_data)
        elif role == "operator":
            await self.send_to_all_operators(notification_data)
        elif role == "user":
            await self.broadcast_to_all_users(notification_data)

    async def broadcast_to_all_users(self, notification_data: Dict[str, Any]):
        """Broadcast notification to all connected users"""
        message = {
            "type": "broadcast_notification",
            "data": notification_data,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        disconnected = set()
        for user_id, websockets in self.user_connections.items():
            for websocket in websockets:
                try:
                    await self.send_to_connection(websocket, message)
                except:
                    disconnected.add(websocket)
        
        # Clean up disconnected websockets
        for websocket in disconnected:
            await self.disconnect(websocket)

    async def send_typing_indicator(self, websocket: WebSocket, is_typing: bool):
        """Send typing indicator for chat/feedback"""
        connection_data = self.connection_info.get(websocket)
        if not connection_data:
            return
            
        message = {
            "type": "typing_indicator",
            "user_id": connection_data["user_id"],
            "is_typing": is_typing,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Send to admins if user is typing
        if connection_data["role"] == "user":
            for admin_ws in self.admin_connections:
                await self.send_to_connection(admin_ws, message)

    async def handle_ping(self, websocket: WebSocket):
        """Handle ping message to keep connection alive"""
        if websocket in self.connection_info:
            self.connection_info[websocket]["last_ping"] = datetime.utcnow()
            await self.send_to_connection(websocket, {
                "type": "pong",
                "timestamp": datetime.utcnow().isoformat()
            })

    async def cleanup_stale_connections(self):
        """Clean up stale connections (called periodically)"""
        current_time = datetime.utcnow()
        stale_connections = []
        
        for websocket, info in self.connection_info.items():
            # Consider connection stale if no ping in last 5 minutes
            if (current_time - info["last_ping"]).total_seconds() > 300:
                stale_connections.append(websocket)
        
        for websocket in stale_connections:
            await self.disconnect(websocket)

    def get_connection_stats(self) -> Dict[str, Any]:
        """Get connection statistics"""
        return {
            "total_connections": len(self.connection_info),
            "user_connections": len(self.user_connections),
            "admin_connections": len(self.admin_connections),
            "operator_connections": len(self.operator_connections),
            "active_users": list(self.user_connections.keys()),
            "connection_details": [
                {
                    "user_id": info["user_id"],
                    "role": info["role"],
                    "connected_at": info["connected_at"].isoformat(),
                    "last_ping": info["last_ping"].isoformat()
                }
                for info in self.connection_info.values()
            ]
        }

    async def send_system_message(self, message: str, target_role: str = "all"):
        """Send system message to specified role or all users"""
        system_notification = {
            "id": "system",
            "title": "System Message",
            "message": message,
            "type": "system_message",
            "priority": "medium",
            "created_at": datetime.utcnow().isoformat()
        }
        
        if target_role == "all":
            await self.broadcast_to_all_users(system_notification)
            await self.send_to_all_admins(system_notification)
            await self.send_to_all_operators(system_notification)
        else:
            await self.broadcast_to_role(target_role, system_notification)

# Global WebSocket manager instance
websocket_manager = NotificationWebSocketManager()

# Background task to cleanup stale connections
async def cleanup_stale_connections_task():
    """Background task to cleanup stale connections"""
    while True:
        try:
            await websocket_manager.cleanup_stale_connections()
            await asyncio.sleep(60)  # Run every minute
        except Exception as e:
            logger.error(f"Error in cleanup task: {str(e)}")
            await asyncio.sleep(60)
