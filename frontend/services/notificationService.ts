/**
 * Enhanced notification service for real-time notifications and email integration
 * Handles WebSocket connections, browser notifications, and notification management
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
}

interface ConnectionStats {
    total_connections: number;
    user_connections: number;
    admin_connections: number;
    operator_connections: number;
}

type NotificationEventType = 'newNotification' | 'connectionStatus' | 'unreadCountUpdate';

class NotificationService {
    private ws: WebSocket | null = null;
    private userId: number;
    private role: string;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000; // Start with 1 second
    private isConnected = false;
    private eventListeners: Map<NotificationEventType, Function[]> = new Map();
    private pingInterval: number | null = null;
    private notificationCache: NotificationData[] = [];
    private unreadCount = 0;

    constructor(userId: number, role: string = 'user') {
        this.userId = userId;
        this.role = role;
        this.initializeEventListeners();
    }

    private initializeEventListeners(): void {
        this.eventListeners.set('newNotification', []);
        this.eventListeners.set('connectionStatus', []);
        this.eventListeners.set('unreadCountUpdate', []);
    }

    public addEventListener(event: NotificationEventType, callback: Function): void {
        const listeners = this.eventListeners.get(event) || [];
        listeners.push(callback);
        this.eventListeners.set(event, listeners);
    }

    public removeEventListener(event: NotificationEventType, callback: Function): void {
        const listeners = this.eventListeners.get(event) || [];
        const index = listeners.indexOf(callback);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    }

    private emit(event: NotificationEventType, data?: any): void {
        const listeners = this.eventListeners.get(event) || [];
        listeners.forEach(callback => callback(data));
    }

    public async connect(): Promise<void> {
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/notifications/${this.userId}?role=${this.role}`;
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('🔗 WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
                this.emit('connectionStatus', { connected: true });
                
                // Start ping interval
                this.startPingInterval();
                
                // Load initial notifications
                this.loadNotifications();
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
                console.log('🔌 WebSocket disconnected');
                this.isConnected = false;
                this.emit('connectionStatus', { connected: false });
                this.stopPingInterval();
                this.attemptReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
                this.emit('connectionStatus', { connected: false, error });
            };

        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
            this.attemptReconnect();
        }
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener(this.notifications));
    }

    public getUnreadCount(): number {
        return this.notifications.filter(n => !n.is_read).length;
    }

    public async markAsRead(notificationId: number): Promise<void> {
        try {
            const response = await fetch(`/notifications/${notificationId}/mark-read`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                }
            });

            if (response.ok) {
                this.notifications = this.notifications.filter(n => n.id !== notificationId);
                this.notifyListeners();
            }
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    }

    public async markAllAsRead(): Promise<void> {
        try {
            const response = await fetch('/notifications/mark-all-read', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
                }
            });

            if (response.ok) {
                this.notifications = [];
                this.notifyListeners();
            }
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
        }
    }

    public showNotification(notification: any): void {
        // Show browser notification if supported
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(notification.title, {
                body: notification.message,
                icon: '/favicon.ico',
                tag: notification.id.toString()
            });
        }

        // Add to notifications list
        this.notifications.unshift(notification);
        this.notifyListeners();
    }

    public async requestPermission(): Promise<void> {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    }
}

export default NotificationService;
