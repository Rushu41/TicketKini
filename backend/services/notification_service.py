"""
Unified notification service for TicketKini
Orchestrates email and WebSocket delivery of notifications
"""
import asyncio
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select, and_, or_, desc, cast, String, func, text
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime, timedelta
from backend.database.models.notification import (
    Notification, NotificationTypeEnum, NotificationPriorityEnum,
    UserRoleEnum,
)
from backend.database.models.user import User
from backend.database.models.booking import Booking
from backend.database.models.schedule import Schedule
from backend.database.models.feedback import Feedback
from backend.services.email_service import email_service
from backend.services.websocket_service import websocket_manager
import logging

logger = logging.getLogger(__name__)


class NotificationService:
    def __init__(self, db_session: AsyncSession):
        self.db = db_session

    async def create_notification(
        self,
        user_id: Optional[int] = None,
        role: str = "user",
        title: str = "",
        message: str = "",
        notification_type: str = "announcement",
        priority: str = "medium",
        send_email: bool = False,
        action_url: Optional[str] = None,
        booking_id: Optional[int] = None,
        payment_id: Optional[int] = None,
        feedback_id: Optional[int] = None,
        expires_at: Optional[datetime] = None,
        is_system_wide: bool = False,
        auto_archive_after: Optional[datetime] = None,
    ) -> Notification:
        """Create a new notification"""
        try:
            # Normalize inputs and coerce to enum (case-insensitive)
            role_lc = (role or "user").lower()
            type_lc = (notification_type or "announcement").lower()
            # If tied to feedback, force a safe type to match enum-backed DBs
            if feedback_id is not None and type_lc == "announcement":
                type_lc = "user_feedback"
            priority_lc = (priority or "medium").lower()

            # Defensive mapping for legacy values
            try:
                role_enum = UserRoleEnum(role_lc)
            except ValueError:
                role_enum = UserRoleEnum.USER
            try:
                type_enum = NotificationTypeEnum(type_lc)
            except ValueError:
                # Fallback unknown types to generic announcement
                type_enum = NotificationTypeEnum.ANNOUNCEMENT
            try:
                priority_enum = NotificationPriorityEnum(priority_lc)
            except ValueError:
                priority_enum = NotificationPriorityEnum.MEDIUM

            notification = Notification(
                user_id=user_id,
                role=role_enum.value,
                title=title,
                message=message,
                type=type_enum.value,
                priority=priority_enum.value,
                send_email=send_email,
                action_url=action_url,
                booking_id=booking_id,
                payment_id=payment_id,
                feedback_id=feedback_id,
                expires_at=expires_at,
                is_system_wide=is_system_wide,
                auto_archive_after=auto_archive_after,
            )

            self.db.add(notification)
            await self.db.commit()
            await self.db.refresh(notification)

            # Send notification immediately
            await self.deliver_notification(notification)

            logger.info("Notification created: ID=%s, Type=%s", notification.id, notification_type)
            return notification
        except SQLAlchemyError as e:
            # Fallback for environments where notifications.type/priority/status are Postgres enums
            logger.warning("ORM insert failed, attempting enum-cast insert fallback: %s", e)
            await self.db.rollback()

            # Discover available enum labels from the database and choose valid ones dynamically
            async def get_enum_labels(enum_typename: str) -> List[str]:
                q = text(
                    """
                    SELECT e.enumlabel
                    FROM pg_enum e
                    JOIN pg_type t ON t.oid = e.enumtypid
                    WHERE t.typname = :name
                    ORDER BY e.enumsortorder
                    """
                )
                res = await self.db.execute(q, {"name": enum_typename})
                return [r[0] for r in res.fetchall()]

            def choose_label(desired: str, labels: List[str], fallbacks: List[str]) -> str:
                # Try exact, lowercase, uppercase, then fallback list, then first available
                desireds = [desired, desired.lower(), desired.upper()]
                for d in desireds:
                    if d in labels:
                        return d
                for fb in fallbacks:
                    if fb in labels:
                        return fb
                # Last resort: first label
                return labels[0] if labels else desired

            try:
                available_types = await get_enum_labels("notificationtypeenum")
                available_priorities = await get_enum_labels("notificationpriorityenum")
                available_statuses = await get_enum_labels("notificationstatusenum")
            except SQLAlchemyError as enum_err:
                logger.error("Failed to read enum labels; cannot fallback: %s", enum_err)
                raise e from enum_err

            chosen_type = choose_label(
                getattr(type_enum, "value", type_lc),
                available_types,
                ["user_feedback", "announcement", "system_alert", "booking_confirmation"]
            )
            chosen_priority = choose_label(
                getattr(priority_enum, "value", priority_lc),
                available_priorities,
                ["medium", "MEDIUM", "low", "LOW"]
            )
            chosen_status = choose_label(
                "unread",
                available_statuses,
                ["UNREAD", "read", "READ"]
            )

            # Prepare raw insert with enum casts using the chosen valid labels
            ins = text(
                """
                INSERT INTO notifications
                (user_id, role, title, message, type, priority, status,
                 booking_id, payment_id, feedback_id, action_url,
                 send_email, send_push, expires_at, is_system_wide, auto_archive_after)
                VALUES (
                    :user_id,
                    :role,
                    :title,
                    :message,
                    CAST(:type AS notificationtypeenum),
                    CAST(:priority AS notificationpriorityenum),
                    CAST(:status AS notificationstatusenum),
                    :booking_id,
                    :payment_id,
                    :feedback_id,
                    :action_url,
                    :send_email,
                    :send_push,
                    :expires_at,
                    :is_system_wide,
                    :auto_archive_after
                )
                RETURNING id
                """
            )

            params = {
                "user_id": user_id,
                "role": (role_lc if role_lc in ("user", "admin", "operator") else "user"),
                "title": title,
                "message": message,
                "type": chosen_type,
                "priority": chosen_priority,
                "status": chosen_status,
                "booking_id": booking_id,
                "payment_id": payment_id,
                "feedback_id": feedback_id,
                "action_url": action_url,
                "send_email": send_email,
                "send_push": True,
                "expires_at": expires_at,
                "is_system_wide": is_system_wide,
                "auto_archive_after": auto_archive_after,
            }

            res = await self.db.execute(ins, params)
            row = res.first()
            await self.db.commit()

            # Fetch full row as ORM object and deliver
            sel = await self.db.execute(select(Notification).where(Notification.id == row[0]))
            fallback_notif = sel.scalar_one()
            await self.deliver_notification(fallback_notif)
            logger.info(
                "Notification created via enum-cast fallback: ID=%s, Type=%s (chosen)",
                fallback_notif.id,
                chosen_type,
            )
            return fallback_notif

    async def deliver_notification(self, notification: Notification):
        """Deliver notification via WebSocket and email"""
        type_str = notification.type.value if hasattr(notification.type, "value") else str(notification.type)
        priority_str = notification.priority.value if hasattr(notification.priority, "value") else str(notification.priority)
        status_str = notification.status.value if hasattr(notification.status, "value") else str(notification.status)
        role_str = notification.role.value if hasattr(notification.role, "value") else str(notification.role)

        notification_data = {
            "id": notification.id,
            "title": notification.title,
            "message": notification.message,
            "type": type_str,
            "priority": priority_str,
            "status": status_str,
            "booking_id": getattr(notification, "booking_id", None),
            "payment_id": getattr(notification, "payment_id", None),
            "feedback_id": getattr(notification, "feedback_id", None),
            "action_url": notification.action_url,
            "created_at": notification.created_at.isoformat(),
            "expires_at": notification.expires_at.isoformat() if notification.expires_at else None,
        }

        # Send WebSocket notification
        if notification.is_system_wide:
            await websocket_manager.broadcast_to_role(role_str, notification_data)
        elif notification.user_id:
            await websocket_manager.send_to_user(notification.user_id, notification_data)

        # Send email notification
        if notification.send_email:
            await self.send_email_notification(notification)

        # Update delivery status
        notification.push_sent_at = datetime.utcnow()
        await self.db.commit()

    async def send_email_notification(self, notification: Notification):
        """Send notification via email"""
        try:
            if not notification.user_id:
                return

            result = await self.db.execute(select(User).where(User.id == notification.user_id))
            user = result.scalar_one_or_none()
            if not user or not user.email:
                return

            type_str = notification.type.value if hasattr(notification.type, "value") else str(notification.type)
            email_data = {
                "email": user.email,
                "user_name": user.name,
                "title": notification.title,
                "message": notification.message,
                "type": type_str,
                "action_url": notification.action_url,
            }

            if notification.booking_id:
                booking_result = await self.db.execute(
                    select(Booking).where(Booking.id == notification.booking_id)
                )
                booking = booking_result.scalar_one_or_none()
                if booking:
                    details: Dict[str, Any] = {"pnr": getattr(booking, "pnr", None)}
                    if getattr(booking, "travel_date", None):
                        details["travel_date"] = booking.travel_date.strftime("%Y-%m-%d")
                    if getattr(booking, "schedule_id", None):
                        sched_res = await self.db.execute(
                            select(Schedule).where(Schedule.id == booking.schedule_id)
                        )
                        schedule = sched_res.scalar_one_or_none()
                        if schedule:
                            details["departure_time"] = (
                                schedule.departure_time.strftime("%H:%M") if getattr(schedule, "departure_time", None) else None
                            )
                            details["route"] = getattr(schedule, "route_name", None)
                    email_data.update(details)

            success = await email_service.send_notification_email(email_data)
            if success:
                notification.email_sent_at = datetime.utcnow()
                await self.db.commit()
                logger.info("Email sent for notification %s", notification.id)
            else:
                logger.error("Failed to send email for notification %s", notification.id)
        except (SQLAlchemyError, AttributeError, TypeError, ValueError) as e:
            logger.error("Error sending email for notification %s: %s", notification.id, e)

    async def get_user_notifications(
        self,
        user_id: int,
        role: str = "user",
        status: Optional[str] = None,
        notification_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Notification]:
        """Get notifications for a specific user"""

        # Compare role case-insensitively to tolerate legacy uppercase values
        role_lc = (role or "user").lower()
        query = select(Notification).where(
            or_(
                and_(
                    Notification.user_id == user_id,
                    func.lower(cast(Notification.role, String)) == role_lc,
                ),
                and_(
                    Notification.is_system_wide == True,
                    func.lower(cast(Notification.role, String)) == role_lc,
                ),
            )
        )

        if status:
            query = query.where(cast(Notification.status, String) == status)
        if notification_type:
            query = query.where(cast(Notification.type, String) == notification_type)

        query = query.where(
            or_(Notification.expires_at.is_(None), Notification.expires_at > datetime.utcnow())
        )

        query = query.order_by(desc(Notification.created_at)).limit(limit).offset(offset)
        result = await self.db.execute(query)
        return result.scalars().all()

    async def mark_notification_as_read(self, notification_id: int, user_id: int) -> bool:
        """Mark a notification as read"""
        try:
            result = await self.db.execute(
                select(Notification).where(
                    and_(
                        Notification.id == notification_id,
                        or_(
                            Notification.user_id == user_id,
                            Notification.is_system_wide == True,
                        ),
                    )
                )
            )
            notification = result.scalar_one_or_none()
            if notification:
                notification.mark_as_read()
                await self.db.commit()
                return True
            return False
        except (SQLAlchemyError, ValueError) as e:
            logger.error("Failed to mark notification as read: %s", e)
            return False

    async def mark_all_as_read(self, user_id: int, role: str = "user") -> int:
        """Mark all notifications as read for a user"""
        try:
            notifications = await self.get_user_notifications(
                user_id=user_id, role=role, status="unread"
            )
            count = 0
            for notification in notifications:
                notification.mark_as_read()
                count += 1
            await self.db.commit()
            return count
        except (SQLAlchemyError, ValueError) as e:
            logger.error("Failed to mark all notifications as read: %s", e)
            return 0

    async def get_unread_count(self, user_id: int, role: str = "user") -> int:
        """Get count of unread notifications for a user"""
        try:
            res = await self.db.execute(
                select(Notification.id).where(
                    and_(
                        or_(
                            and_(
                                Notification.user_id == user_id,
                                func.lower(cast(Notification.role, String)) == (role or "user").lower(),
                            ),
                            and_(
                                Notification.is_system_wide == True,
                                func.lower(cast(Notification.role, String)) == (role or "user").lower(),
                            ),
                        ),
                        cast(Notification.status, String) == "unread",
                        or_(
                            Notification.expires_at.is_(None),
                            Notification.expires_at > datetime.utcnow(),
                        ),
                    )
                )
            )
            return len(res.scalars().all())
        except (SQLAlchemyError, ValueError) as e:
            logger.error("Failed to get unread count: %s", e)
            return 0

    async def create_booking_confirmation(self, user_id: int, booking_id: int) -> Notification:
        """Create booking confirmation notification"""
        result = await self.db.execute(select(Booking).where(Booking.id == booking_id))
        booking = result.scalar_one_or_none()
        if not booking:
            raise ValueError("Booking not found")
        return await self.create_notification(
            user_id=user_id,
            role="user",
            title="Booking Confirmed! 🎫",
            message=f"Your booking has been confirmed. PNR: {booking.pnr}. Have a safe journey!",
            notification_type="booking_confirmation",
            priority="high",
            send_email=True,
            booking_id=booking_id,
            action_url=f"/pages/my-bookings.html?booking_id={booking_id}",
        )

    async def create_trip_reminder(self, user_id: int, booking_id: int) -> Notification:
        """Create trip reminder notification (1 hour before arrival)"""
        result = await self.db.execute(select(Booking).where(Booking.id == booking_id))
        booking = result.scalar_one_or_none()
        if not booking:
            raise ValueError("Booking not found")

        route: Optional[str] = None
        arrival_time_str: Optional[str] = None
        try:
            sched_res = await self.db.execute(
                select(Schedule).where(Schedule.id == booking.schedule_id)
            )
            schedule = sched_res.scalar_one_or_none()
            if schedule and booking.travel_date and schedule.arrival_time:
                route = (
                    f"{getattr(booking, 'departure_location', 'Origin')} to "
                    f"{getattr(booking, 'arrival_location', 'Destination')}"
                )
                arrival_time_str = schedule.arrival_time.strftime("%H:%M")
        except AttributeError:
            pass
        if not route:
            route = (
                f"{getattr(booking, 'departure_location', 'Origin')} to "
                f"{getattr(booking, 'arrival_location', 'Destination')}"
            )

        auto_archive = datetime.utcnow() + timedelta(days=1)
        return await self.create_notification(
            user_id=user_id,
            role="user",
            title="Trip Reminder ⏰",
            message=(
                f"Your trip {route} is scheduled to arrive in about 1 hour"
                + (f" at {arrival_time_str}" if arrival_time_str else "")
                + ". Safe travels!"
            ),
            notification_type="trip_reminder",
            priority="high",
            send_email=True,
            booking_id=booking_id,
            action_url=f"/pages/my-bookings.html?booking_id={booking_id}",
            auto_archive_after=auto_archive,
        )

    async def create_payment_success(self, user_id: int, payment_id: int, amount: float) -> Notification:
        """Create payment success notification"""
        return await self.create_notification(
            user_id=user_id,
            role="user",
            title="Payment Successful ✅",
            message=f"Your payment of ৳{amount} has been processed successfully.",
            notification_type="payment_success",
            priority="high",
            send_email=True,
            payment_id=payment_id,
            action_url=f"/pages/confirmation.html?payment_id={payment_id}",
        )

    async def create_admin_feedback_alert(self, feedback_id: int) -> Notification:
        """Create feedback notification for admins"""
        result = await self.db.execute(
            select(Feedback).options(selectinload(Feedback.user)).where(Feedback.id == feedback_id)
        )
        feedback = result.scalar_one_or_none()
        if not feedback:
            raise ValueError("Feedback not found")
        return await self.create_notification(
            role="admin",
            title="New User Feedback 💬",
            message=f"New {feedback.rating}⭐ feedback from {feedback.user.name}. Review required.",
            notification_type="user_feedback",
            priority="medium",
            feedback_id=feedback_id,
            action_url=f"/admin/feedback/{feedback_id}",
            is_system_wide=True,
        )

    async def create_system_announcement(self, title: str, message: str, target_role: str = "user") -> Notification:
        """Create system-wide announcement"""
        return await self.create_notification(
            role=target_role,
            title=title,
            message=message,
            notification_type="announcement",
            priority="medium",
            is_system_wide=True,
        )

    async def broadcast_promotion(self, title: str, message: str, expires_hours: int = 24) -> Notification:
        """Broadcast promotional notification to all users"""
        expires_at = datetime.utcnow() + timedelta(hours=expires_hours)
        return await self.create_notification(
            role="user",
            title=title,
            message=message,
            notification_type="promotional",
            priority="low",
            send_email=True,
            expires_at=expires_at,
            is_system_wide=True,
        )

    async def cleanup_expired_notifications(self) -> int:
        """Clean up expired and auto-archive notifications"""
        try:
            current_time = datetime.utcnow()
            expired_result = await self.db.execute(
                select(Notification).where(
                    and_(
                        Notification.expires_at <= current_time,
                        cast(Notification.status, String) != "archived",
                    )
                )
            )
            expired_notifications = expired_result.scalars().all()

            auto_archive_result = await self.db.execute(
                select(Notification).where(
                    and_(
                        Notification.auto_archive_after <= current_time,
                        cast(Notification.status, String) != "archived",
                    )
                )
            )
            auto_archive_notifications = auto_archive_result.scalars().all()

            count = 0
            for notification in expired_notifications + auto_archive_notifications:
                notification.mark_as_archived()
                count += 1
            await self.db.commit()
            logger.info("Cleaned up %d expired/auto-archive notifications", count)
            return count
        except (SQLAlchemyError, ValueError) as e:
            logger.error("Failed to cleanup notifications: %s", e)
            return 0

    async def get_notification_analytics(self, days: int = 30) -> Dict[str, Any]:
        """Get notification analytics for admin dashboard"""
        try:
            start_date = datetime.utcnow() - timedelta(days=days)
            res = await self.db.execute(
                select(Notification).where(Notification.created_at >= start_date)
            )
            rows = res.scalars().all()
            total_sent = len(rows)
            by_type: Dict[str, int] = {}
            by_priority: Dict[str, int] = {}
            by_status: Dict[str, int] = {}
            email_sent = 0
            for n in rows:
                t = getattr(n.type, "value", str(n.type))
                p = getattr(n.priority, "value", str(n.priority))
                s = getattr(n.status, "value", str(n.status))
                by_type[t] = by_type.get(t, 0) + 1
                by_priority[p] = by_priority.get(p, 0) + 1
                by_status[s] = by_status.get(s, 0) + 1
                if n.email_sent_at:
                    email_sent += 1
            return {
                "period_days": days,
                "total_notifications": total_sent,
                "by_type": by_type,
                "by_priority": by_priority,
                "by_status": by_status,
                "email_delivery": {
                    "sent": email_sent,
                    "rate": f"{(email_sent/total_sent*100):.1f}%" if total_sent > 0 else "0%",
                },
            }
        except (SQLAlchemyError, ValueError) as e:
            logger.error("Failed to get notification analytics: %s", e)
            return {}

    async def create_arrival_reminder(
        self, user_id: int, booking_id: int, route: str, arrival_time_str: Optional[str]
    ) -> Notification:
        """Explicit arrival reminder creator used by the scheduler."""
        auto_archive = datetime.utcnow() + timedelta(days=1)
        return await self.create_notification(
            user_id=user_id,
            role="user",
            title="Arrival Reminder ⏰",
            message=(
                f"Your trip {route} is scheduled to arrive in about 1 hour"
                + (f" at {arrival_time_str}" if arrival_time_str else "")
                + "."
            ),
            notification_type="trip_reminder",
            priority="high",
            send_email=True,
            booking_id=booking_id,
            action_url=f"/pages/my-bookings.html?booking_id={booking_id}",
            auto_archive_after=auto_archive,
        )

    async def send_due_arrival_reminders(self, window_minutes: int = 5) -> int:
        """Find bookings arriving in ~1 hour and send reminders once."""
        try:
            now = datetime.utcnow()
            result = await self.db.execute(
                select(Booking, Schedule)
                .join(Schedule, Schedule.id == Booking.schedule_id)
                .where(and_(Booking.status == "CONFIRMED", Booking.travel_date.is_not(None)))
            )
            rows = result.all()
            sent = 0
            for booking, schedule in rows:
                try:
                    travel_date = booking.travel_date.date()
                    dep_dt = datetime.combine(travel_date, schedule.departure_time)
                    arr_dt = datetime.combine(travel_date, schedule.arrival_time)
                    if arr_dt <= dep_dt:
                        arr_dt = arr_dt + timedelta(days=1)
                    trigger_dt = arr_dt - timedelta(hours=1)
                    if trigger_dt <= now < (trigger_dt + timedelta(minutes=window_minutes)):
                        exist_q = await self.db.execute(
                            select(Notification)
                            .where(
                                and_(
                                    Notification.booking_id == booking.id,
                                    cast(Notification.type, String) == "trip_reminder",
                                )
                            )
                            .limit(1)
                        )
                        if exist_q.scalar_one_or_none():
                            continue
                        route = (
                            f"{getattr(booking, 'departure_location', 'Origin')} to "
                            f"{getattr(booking, 'arrival_location', 'Destination')}"
                        )
                        arrival_time_str = (
                            schedule.arrival_time.strftime("%H:%M") if schedule.arrival_time else None
                        )
                        await self.create_arrival_reminder(
                            booking.user_id, booking.id, route, arrival_time_str
                        )
                        sent += 1
                except (SQLAlchemyError, AttributeError, TypeError, ValueError) as inner_e:
                    logger.error(
                        "Failed processing arrival reminder for booking %s: %s",
                        getattr(booking, "id", "?"),
                        inner_e,
                    )
                    continue
            return sent
        except (SQLAlchemyError, ValueError) as e:
            logger.error("Error while sending due arrival reminders: %s", e)
            return 0


async def arrival_reminder_loop(poll_interval_seconds: int = 60, window_minutes: int = 5):
    """Background loop to periodically send arrival reminders."""
    from backend.database.database import SessionLocal

    while True:
        try:
            async with SessionLocal() as session:
                service = NotificationService(session)
                count = await service.send_due_arrival_reminders(window_minutes=window_minutes)
                if count:
                    logger.info("Arrival reminders sent: %d", count)
        except (SQLAlchemyError, OSError, RuntimeError) as e:
            logger.error("Arrival reminder loop error: %s", e)
        await asyncio.sleep(poll_interval_seconds)
