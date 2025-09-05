import { apiService } from './api.ts';

/**
 * User-side notification service for real-time notifications
 * Handles WebSocket connections, browser notifications, and toast notifications
 */

interface NotificationData {
    id: number;
    title: string;
    message: string;
    type: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    action_url?: string;
    created_at: string;
    expires_at?: string;
    status: 'unread' | 'read' | 'archived';
    data?: any;
}

interface ToastOptions {
    duration?: number;
    type?: 'info' | 'success' | 'warning' | 'error';
    position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
    dismissible?: boolean;
}

class UserNotificationService {
    private ws: WebSocket | null = null;
    private isConnected = false;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private pingInterval: number | null = null;
    private userId: number | null = null;

    /**
     * Format timestamp for display (GMT+6 Bangladesh time)
     */
    private formatTime(dateString: string): string {
        // Parse the date string and convert to Bangladesh time (GMT+6)
        const date = new Date(dateString);
        
        // Get current time in Bangladesh (GMT+6)
        const now = new Date();
        const bangladeshNow = new Date(now.getTime() + (6 * 60 * 60 * 1000));
        const bangladeshDate = new Date(date.getTime() + (6 * 60 * 60 * 1000));
        
        const diff = bangladeshNow.getTime() - bangladeshDate.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ago`;
        if (hours > 0) return `${hours}h ago`;
        if (minutes > 0) return `${minutes}m ago`;
        return 'Just now';
    }

    private role: string = 'user';
    private reconnectDelay = 1000;
    private notificationCache: NotificationData[] = [];
    private unreadCount = 0;
    private toastContainer: HTMLElement | null = null;
    private notificationPermission: NotificationPermission = 'default';

    constructor() {
        this.createToastContainer();
        this.requestBrowserNotificationPermission();
    }

    /**
     * Initialize the notification service with user credentials
     */
    public async initialize(): Promise<void> {
        try {
            const userData = localStorage.getItem('user');
            if (userData) {
                const user = JSON.parse(userData);
                this.userId = user.id;
                this.role = user.role || 'user';
                await this.connect();
                await this.loadUnreadNotifications();
            }
        } catch (error) {
            console.warn('Failed to initialize notification service:', error);
        }
    }

    /**
     * Connect to WebSocket server
     */
    private async connect(): Promise<void> {
        if (!this.userId) return;

        try {
            const protocol = (window.location.protocol === 'https:' || (localStorage.getItem('api_base_url') || '').startsWith('https')) ? 'wss:' : 'ws:';
            const apiBase = localStorage.getItem('api_base_url');
            const host = apiBase ? new URL(apiBase).host : (window.location.host || 'ticketkini.onrender.com');
            const wsUrl = `${protocol}//${host}/ws/notifications/${this.userId}?role=${this.role}`;
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('🔗 User notification WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
                this.startPingInterval();
                this.showToast('Connected to notification service', { type: 'success', duration: 3000 });
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onclose = () => {
                console.log('🔌 User notification WebSocket disconnected');
                this.isConnected = false;
                this.stopPingInterval();
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('❌ User notification WebSocket error:', error);
            };

        } catch (error) {
            console.error('Failed to connect notification WebSocket:', error);
            this.attemptReconnect();
        }
    }

    /**
     * Handle incoming WebSocket messages
     */
    private handleMessage(data: any): void {
        switch (data.type) {
            case 'notification':
                this.handleNewNotification(data.data);
                break;
            case 'pong':
                // Handle pong response
                break;
            case 'error':
                console.error('WebSocket error:', data.message);
                this.showToast(`Notification error: ${data.message}`, { type: 'error' });
                break;
            case 'unread_count':
                this.updateUnreadCount(data.count);
                break;
            default:
                console.log('Unknown message type:', data);
        }
    }

    /**
     * Handle new notification received via WebSocket
     */
    private handleNewNotification(notification: NotificationData): void {
        this.notificationCache.unshift(notification);
        this.unreadCount++;
        
        // Show browser notification
        this.showBrowserNotification(notification);
        
        // Show toast notification
        this.showNotificationToast(notification);
        
        // Update notification dropdown if present
        this.updateNotificationDropdown();
        
        // Update unread count badge
        this.updateUnreadCountDisplay();
        
        // Trigger custom event for other components
        this.dispatchNotificationEvent(notification);
    }

    /**
     * Show browser notification
     */
    private showBrowserNotification(notification: NotificationData): void {
        if (this.notificationPermission === 'granted') {
            const options: NotificationOptions = {
                body: notification.message,
                icon: '/favicon.ico',
                tag: notification.id.toString(),
                badge: '/favicon.ico',
                requireInteraction: notification.priority === 'urgent',
            };

            const browserNotification = new Notification(notification.title, options);
            
            browserNotification.onclick = () => {
                // Handle notification click
                if (notification.action_url) {
                    window.location.href = notification.action_url;
                }
                this.markAsRead(notification.id);
                browserNotification.close();
            };

            // Auto-close notification after 5 seconds unless urgent
            if (notification.priority !== 'urgent') {
                setTimeout(() => browserNotification.close(), 5000);
            }
        }
    }

    /**
     * Show toast notification
     */
    private showNotificationToast(notification: NotificationData): void {
        const typeMap = {
            'booking_confirmation': 'success',
            'payment_success': 'success',
            'booking_cancellation': 'warning',
            'schedule_change': 'warning',
            'refund_processed': 'success',
            'promotional': 'info',
            'system_alert': 'error',
            'reminder': 'info'
        };

        const toastType = typeMap[notification.type as keyof typeof typeMap] || 'info';
        const duration = notification.priority === 'urgent' ? 10000 : 5000;

        this.showToast(
            `${notification.title}: ${notification.message}`,
            { 
                type: toastType as ToastOptions['type'], 
                duration,
                dismissible: true 
            }
        );
    }

    /**
     * Create toast notification
     */
    public showToast(message: string, options: ToastOptions = {}): void {
        const {
            duration = 5000,
            type = 'info',
            position = 'top-right',
            dismissible = true
        } = options;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type} toast-${position}`;
        
        const iconMap = {
            info: 'fas fa-info-circle',
            success: 'fas fa-check-circle',
            warning: 'fas fa-exclamation-triangle',
            error: 'fas fa-times-circle'
        };

        toast.innerHTML = `
            <div class="toast-content">
                <i class="${iconMap[type]}"></i>
                <span class="toast-message">${message}</span>
                ${dismissible ? '<button class="toast-close" onclick="this.closest(\'.toast\').remove()"><i class="fas fa-times"></i></button>' : ''}
            </div>
        `;

        // Add toast styles if not already present
        this.ensureToastStyles();

        this.toastContainer?.appendChild(toast);

        // Auto-remove toast
        if (duration > 0) {
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, duration);
        }

        // Add animation
        requestAnimationFrame(() => {
            toast.classList.add('toast-show');
        });
    }

    /**
     * Create toast container
     */
    private createToastContainer(): void {
        if (!this.toastContainer) {
            this.toastContainer = document.createElement('div');
            this.toastContainer.id = 'toast-container';
            this.toastContainer.className = 'toast-container';
            document.body.appendChild(this.toastContainer);
        }
    }

    /**
     * Ensure toast styles are present
     */
    private ensureToastStyles(): void {
        if (!document.getElementById('toast-styles')) {
            const styles = document.createElement('style');
            styles.id = 'toast-styles';
            styles.textContent = `
                .toast-container {
                    position: fixed;
                    z-index: 10000;
                    pointer-events: none;
                }

                .toast {
                    position: relative;
                    margin: 10px;
                    padding: 16px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    max-width: 400px;
                    pointer-events: auto;
                    opacity: 0;
                    transform: translateX(100%);
                    transition: all 0.3s ease;
                }

                .toast-show {
                    opacity: 1;
                    transform: translateX(0);
                }

                .toast-top-right {
                    top: 20px;
                    right: 20px;
                }

                .toast-top-left {
                    top: 20px;
                    left: 20px;
                }

                .toast-bottom-right {
                    bottom: 20px;
                    right: 20px;
                }

                .toast-bottom-left {
                    bottom: 20px;
                    left: 20px;
                }

                .toast-info {
                    background: rgba(59, 130, 246, 0.9);
                    color: white;
                    border-color: rgba(59, 130, 246, 0.3);
                }

                .toast-success {
                    background: rgba(34, 197, 94, 0.9);
                    color: white;
                    border-color: rgba(34, 197, 94, 0.3);
                }

                .toast-warning {
                    background: rgba(251, 191, 36, 0.9);
                    color: white;
                    border-color: rgba(251, 191, 36, 0.3);
                }

                .toast-error {
                    background: rgba(239, 68, 68, 0.9);
                    color: white;
                    border-color: rgba(239, 68, 68, 0.3);
                }

                .toast-content {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .toast-message {
                    flex: 1;
                    font-size: 14px;
                    font-weight: 500;
                }

                .toast-close {
                    background: none;
                    border: none;
                    color: currentColor;
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                    opacity: 0.7;
                    transition: opacity 0.2s;
                }

                .toast-close:hover {
                    opacity: 1;
                }
            `;
            document.head.appendChild(styles);
        }
    }

    /**
     * Request browser notification permission
     */
    private async requestBrowserNotificationPermission(): Promise<void> {
        if ('Notification' in window) {
            this.notificationPermission = Notification.permission;
            
            if (this.notificationPermission === 'default') {
                this.notificationPermission = await Notification.requestPermission();
            }
        }
    }

    /**
     * Start ping interval to keep connection alive
     */
    private startPingInterval(): void {
        this.pingInterval = window.setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000); // Ping every 30 seconds
    }

    /**
     * Stop ping interval
     */
    private stopPingInterval(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    /**
     * Attempt to reconnect WebSocket
     */
    private attemptReconnect(): void {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            setTimeout(() => {
                this.connect();
            }, this.reconnectDelay);
            
            // Exponential backoff
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
        } else {
            console.error('Max reconnection attempts reached');
            this.showToast('Connection lost. Please refresh the page.', { type: 'error', duration: 0 });
        }
    }

    /**
     * Load unread notifications from server
     */
    private async loadUnreadNotifications(): Promise<void> {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) return;

            const resp = await apiService.getUserNotifications();
            if (resp.success) {
                const data = resp.data as any;
                this.notificationCache = data.notifications || [];
                this.unreadCount = data.count || 0;
                this.updateUnreadCountDisplay();
                this.updateNotificationDropdown();
            }
        } catch (error) {
            console.error('Failed to load unread notifications:', error);
        }
    }

    /**
     * Mark notification as read
     */
    public async markAsRead(notificationId: number): Promise<void> {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) return;

            const response = await fetch(`/api/notifications/${notificationId}/read`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                // Remove from cache
                this.notificationCache = this.notificationCache.filter(n => n.id !== notificationId);
                this.unreadCount = Math.max(0, this.unreadCount - 1);
                this.updateUnreadCountDisplay();
                this.updateNotificationDropdown();
            }
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    }

    /**
     * Mark all notifications as read
     */
    public async markAllAsRead(): Promise<void> {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) return;

            const response = await fetch('/api/notifications/mark-all-read', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                this.notificationCache = [];
                this.unreadCount = 0;
                this.updateUnreadCountDisplay();
                this.updateNotificationDropdown();
            }
        } catch (error) {
            console.error('Failed to mark all notifications as read:', error);
        }
    }

    /**
     * Update unread count in UI
     */
    private updateUnreadCount(count: number): void {
        this.unreadCount = count;
        this.updateUnreadCountDisplay();
    }

    /**
     * Update unread count display
     */
    private updateUnreadCountDisplay(): void {
        const badge = document.getElementById('notification-badge');
        if (badge) {
            if (this.unreadCount > 0) {
                badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount.toString();
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    /**
     * Update notification dropdown
     */
    private updateNotificationDropdown(): void {
        const dropdown = document.getElementById('notification-dropdown');
        if (!dropdown) return;

        const list = dropdown.querySelector('.notification-list');
        if (!list) return;

        if (this.notificationCache.length === 0) {
            list.innerHTML = `
                <div class="notification-empty">
                    <i class="fas fa-bell-slash"></i>
                    <p>No new notifications</p>
                </div>
            `;
            return;
        }

        list.innerHTML = this.notificationCache
            .slice(0, 10) // Show only latest 10
            .map(notification => `
                <div class="notification-item" data-id="${notification.id}">
                    <div class="notification-icon">
                        <i class="fas ${this.getNotificationIcon(notification.type)}"></i>
                    </div>
                    <div class="notification-content">
                        <div class="notification-title">${notification.title}</div>
                        <div class="notification-message">${notification.message}</div>
                        <div class="notification-time">${this.formatTime(notification.created_at)}</div>
                    </div>
                    <button class="notification-dismiss" onclick="userNotificationService.markAsRead(${notification.id})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');
    }

    /**
     * Get notification icon based on type
     */
    private getNotificationIcon(type: string): string {
        const iconMap: { [key: string]: string } = {
            'booking_confirmation': 'fa-check-circle',
            'payment_success': 'fa-credit-card',
            'booking_cancellation': 'fa-times-circle',
            'schedule_change': 'fa-clock',
            'refund_processed': 'fa-money-bill-wave',
            'promotional': 'fa-tags',
            'system_alert': 'fa-exclamation-triangle',
            'reminder': 'fa-bell'
        };
        return iconMap[type] || 'fa-info-circle';
    }

    /**
     * Dispatch custom notification event
     */
    private dispatchNotificationEvent(notification: NotificationData): void {
        const event = new CustomEvent('newNotification', {
            detail: notification
        });
        window.dispatchEvent(event);
    }

    /**
     * Disconnect WebSocket
     */
    public disconnect(): void {
        this.stopPingInterval();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
    }

    /**
     * Get connection status
     */
    public isConnectedToServer(): boolean {
        return this.isConnected;
    }

    /**
     * Get unread notification count
     */
    public getUnreadCount(): number {
        return this.unreadCount;
    }

    /**
     * Get cached notifications
     */
    public getCachedNotifications(): NotificationData[] {
        return [...this.notificationCache];
    }
}

// Create global instance
declare global {
    interface Window {
        userNotificationService: UserNotificationService;
    }
}

const userNotificationService = new UserNotificationService();
window.userNotificationService = userNotificationService;

export default userNotificationService;
