"""
Email notification service for TicketKini
Handles email delivery for notifications and feedback responses
"""
import smtplib
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import os
from typing import List, Optional, Dict, Any
from jinja2 import Environment, FileSystemLoader
from backend.config import settings
import logging

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.smtp_server = getattr(settings, 'SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = getattr(settings, 'SMTP_PORT', 587)
        self.email_user = getattr(settings, 'EMAIL_USER', '')
        self.email_password = getattr(settings, 'EMAIL_PASSWORD', '')
        self.from_email = getattr(settings, 'FROM_EMAIL', self.email_user)
        self.company_name = "TicketKini"
        
        # Setup Jinja2 environment for email templates
        template_dir = os.path.join(os.path.dirname(__file__), '..', 'templates', 'email')
        self.jinja_env = Environment(
            loader=FileSystemLoader(template_dir) if os.path.exists(template_dir) else None
        )

    async def send_email(self, 
                        to_email: str, 
                        subject: str, 
                        html_content: str = None,
                        text_content: str = None,
                        attachments: List[str] = None) -> bool:
        """Send email with HTML and text content"""
        try:
            # Create message
            msg = MIMEMultipart('alternative')
            msg['From'] = f"{self.company_name} <{self.from_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject

            # Add text content
            if text_content:
                text_part = MIMEText(text_content, 'plain', 'utf-8')
                msg.attach(text_part)

            # Add HTML content
            if html_content:
                html_part = MIMEText(html_content, 'html', 'utf-8')
                msg.attach(html_part)

            # Add attachments if any
            if attachments:
                for file_path in attachments:
                    if os.path.exists(file_path):
                        self._attach_file(msg, file_path)

            # Send email
            await self._send_smtp(msg)
            logger.info(f"Email sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False

    async def _send_smtp(self, msg: MIMEMultipart):
        """Send email using SMTP in a thread to avoid blocking"""
        def _send():
            with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                server.starttls()
                server.login(self.email_user, self.email_password)
                server.send_message(msg)

        # Run in thread to avoid blocking
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _send)

    def _attach_file(self, msg: MIMEMultipart, file_path: str):
        """Attach file to email message"""
        try:
            with open(file_path, "rb") as attachment:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(attachment.read())
                encoders.encode_base64(part)
                filename = os.path.basename(file_path)
                part.add_header(
                    'Content-Disposition',
                    f'attachment; filename= {filename}'
                )
                msg.attach(part)
        except Exception as e:
            logger.error(f"Failed to attach file {file_path}: {str(e)}")

    def render_template(self, template_name: str, **kwargs) -> tuple:
        """Render email template and return HTML and text content"""
        try:
            if self.jinja_env:
                template = self.jinja_env.get_template(f"{template_name}.html")
                html_content = template.render(**kwargs)
                
                # Try to get text version
                try:
                    text_template = self.jinja_env.get_template(f"{template_name}.txt")
                    text_content = text_template.render(**kwargs)
                except:
                    # Generate simple text version from HTML if no text template
                    import re
                    text_content = re.sub('<[^<]+?>', '', html_content)
                    text_content = re.sub(r'\n\s*\n', '\n\n', text_content.strip())
                
                return html_content, text_content
            else:
                # Fallback to simple formatting
                return self._generate_simple_template(template_name, **kwargs)
                
        except Exception as e:
            logger.error(f"Failed to render template {template_name}: {str(e)}")
            return self._generate_simple_template(template_name, **kwargs)

    def _generate_simple_template(self, template_name: str, **kwargs) -> tuple:
        """Generate simple email template when Jinja2 templates are not available"""
        user_name = kwargs.get('user_name') or 'Valued Customer'
        pnr = kwargs.get('pnr') or 'N/A'
        route = kwargs.get('route') or 'N/A'
        travel_date = kwargs.get('travel_date') or 'N/A'
        departure_time = kwargs.get('departure_time') or 'N/A'
        boarding_point = kwargs.get('boarding_point') or 'N/A'
        title = kwargs.get('title') or 'Notification'
        message = kwargs.get('message') or 'You have received a new notification.'
        original_message = kwargs.get('original_message') or 'N/A'
        admin_response = kwargs.get('admin_response') or 'N/A'

        if template_name == 'booking_confirmation':
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">🎫 Booking Confirmed!</h2>
                    <p>Dear {user_name},</p>
                    <p>Your booking has been confirmed successfully.</p>
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <strong>Booking Details:</strong><br>
                        PNR: <strong>{pnr}</strong><br>
                        Route: {route}<br>
                        Date: {travel_date}<br>
                        Time: {departure_time}
                    </div>
                    <p>Please arrive at the boarding point 30 minutes before departure.</p>
                    <p>Have a safe journey!</p>
                    <p>Best regards,<br>Team {self.company_name}</p>
                </div>
            </body>
            </html>
            """
            text_content = f"""
            🎫 Booking Confirmed!
            
            Dear {user_name},
            
            Your booking has been confirmed successfully.
            
            Booking Details:
            PNR: {pnr}
            Route: {route}
            Date: {travel_date}
            Time: {departure_time}
            
            Please arrive at the boarding point 30 minutes before departure.
            Have a safe journey!
            
            Best regards,
            Team {self.company_name}
            """
        elif template_name == 'trip_reminder':
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #f59e0b;">⏰ Trip Reminder</h2>
                    <p>Dear {user_name},</p>
                    <p>This is a reminder that your trip is scheduled to depart in 2 hours.</p>
                    <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <strong>Trip Details:</strong><br>
                        PNR: <strong>{pnr}</strong><br>
                        Route: {route}<br>
                        Departure: {departure_time}<br>
                        Boarding Point: {boarding_point}
                    </div>
                    <p style="color: #dc2626;"><strong>Important:</strong> Please arrive 30 minutes before departure time.</p>
                    <p>Safe travels!</p>
                    <p>Best regards,<br>Team {self.company_name}</p>
                </div>
            </body>
            </html>
            """
            text_content = f"""
            ⏰ Trip Reminder
            
            Dear {user_name},
            
            This is a reminder that your trip is scheduled to depart in 2 hours.
            
            Trip Details:
            PNR: {pnr}
            Route: {route}
            Departure: {departure_time}
            Boarding Point: {boarding_point}
            
            Important: Please arrive 30 minutes before departure time.
            
            Safe travels!
            
            Best regards,
            Team {self.company_name}
            """
        elif template_name == 'feedback_response':
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #059669;">💬 Response to Your Feedback</h2>
                    <p>Dear {user_name},</p>
                    <p>Thank you for your feedback. We have reviewed your submission and would like to respond:</p>
                    <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <strong>Your Feedback:</strong><br>
                        {original_message}
                    </div>
                    <div style="background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <strong>Our Response:</strong><br>
                        {admin_response}
                    </div>
                    <p>We value your input and strive to provide the best service possible.</p>
                    <p>Best regards,<br>Team {self.company_name}</p>
                </div>
            </body>
            </html>
            """
            text_content = f"""
            💬 Response to Your Feedback
            
            Dear {user_name},
            
            Thank you for your feedback. We have reviewed your submission and would like to respond:
            
            Your Feedback:
            {original_message}
            
            Our Response:
            {admin_response}
            
            We value your input and strive to provide the best service possible.
            
            Best regards,
            Team {self.company_name}
            """
        else:
            # Generic template
            html_content = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">{title}</h2>
                    <p>Dear {user_name},</p>
                    <p>{message}</p>
                    <p>Best regards,<br>Team {self.company_name}</p>
                </div>
            </body>
            </html>
            """
            text_content = f"""
            {title}
            
            Dear {user_name},
            
            {message}
            
            Best regards,
            Team {self.company_name}
            """

        return html_content, text_content

    async def send_notification_email(self, notification_data: Dict[str, Any]) -> bool:
        """Send notification via email"""
        try:
            template_name = self._get_template_name(notification_data.get('type'))
            html_content, text_content = self.render_template(template_name, **notification_data)
            
            return await self.send_email(
                to_email=notification_data['email'],
                subject=(notification_data.get('title') or 'Notification'),
                html_content=html_content,
                text_content=text_content
            )
        except Exception as e:
            logger.error(f"Failed to send notification email: {str(e)}")
            return False

    async def send_feedback_response_email(self, feedback_data: Dict[str, Any]) -> bool:
        """Send feedback response via email"""
        try:
            html_content, text_content = self.render_template(
                'feedback_response', 
                **feedback_data
            )
            
            return await self.send_email(
                to_email=feedback_data['email'],
                subject=f"Response to your feedback - {feedback_data.get('title', 'Feedback')}",
                html_content=html_content,
                text_content=text_content
            )
        except Exception as e:
            logger.error(f"Failed to send feedback response email: {str(e)}")
            return False

    def _get_template_name(self, notification_type: str) -> str:
        """Map notification type to template name"""
        template_mapping = {
            'booking_confirmation': 'booking_confirmation',
            'payment_success': 'payment_success',
            'booking_cancellation': 'booking_cancellation',
            'trip_reminder': 'trip_reminder',
            'schedule_change': 'schedule_change',
            'refund_processed': 'refund_processed',
            'promotional': 'promotional',
            'reward_earned': 'reward_earned',
            'user_feedback': 'feedback_response',
            'generic_notification': 'notification'
        }
        
        return template_mapping.get(notification_type, 'notification')

# Global email service instance
email_service = EmailService()
