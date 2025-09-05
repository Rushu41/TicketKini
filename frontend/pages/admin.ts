import { apiService } from '../services/api.ts';
import Utils from '../services/utils.ts';

interface DashboardStats {
    totalBookings: number;
    totalRevenue: number;
    activeUsers: number;
    activeTrips: number;
    totalVehicles?: number;
    totalOperators?: number;
    recentBookings?: number;
    completedBookings?: number;
    cancelledBookings?: number;
    avgRating?: number;
    revenueGrowth?: number;
    userGrowth?: number;
    popularRoutes?: Array<{route: string, count: number}>;
    monthlyRevenue?: Array<{month: string, revenue: number}>;
    vehicleUtilization?: Array<{vehicle_type: string, utilization: number}>;
    bookingStatusStats?: Record<string, number>;
    vehicleTypeStats?: Record<string, number>;
    lastUpdated?: string;
}

interface BookingData {
    id: number;
    pnr: string;
    user_name: string;
    user_id?: number;
    route: string;
    status: string;
    total_price: number;
    booking_date: string;
    vehicle_number?: string;
    operator_name?: string;
    source?: string;
    destination?: string;
    travel_date?: string;
    expires_at?: string;
    seats?: string | string[];
    seat_class?: string;
    created_at?: string;
    updated_at?: string;
    user?: {
        id: number;
        name: string;
        email: string;
        phone?: string;
    };
    vehicle?: {
        id: number;
        vehicle_number: string;
        vehicle_type: string;
        total_seats: number;
    };
    schedule?: {
        departure_time: string;
        arrival_time: string;
        duration?: string;
    };
    passenger_details?: Array<{
        name: string;
        age: number;
        gender: string;
        seat_number: string;
    }>;
    payments?: Array<{
        id: number;
        amount: number;
        payment_method: string;
        status: string;
        transaction_id?: string;
    }>;
}

interface VehicleData {
    id: number;
    vehicle_number: string;
    vehicle_name?: string;
    vehicle_type: string;
    operator_id: number;
    operator_name?: string;
    total_seats: number;
    seat_map?: any;
    class_prices?: any;
    facilities?: string[];
    is_active?: boolean;
    avg_rating?: { overall?: number };
    status?: string;
    created_at?: string;
}

interface ScheduleData {
    id: number;
    vehicle_id: number;
    vehicle_number?: string;
    vehicle_type?: string;
    operator_name?: string;
    source_id: number;
    source_name?: string;
    destination_id: number;
    destination_name?: string;
    departure_time: string;
    arrival_time: string;
    duration?: string;
    frequency?: string;
    is_active?: boolean;
    created_at?: string;
}

interface OperatorData {
    id: number;
    name: string;
    contact_email: string;
    contact_phone: string;
    is_active: boolean;
}

interface LocationData {
    id: number;
    name: string;
    city: string;
    location_type: string;
    is_major_hub: boolean;
}

interface UserData {
    id: number;
    name: string;
    email: string;
    phone: string;
    total_bookings?: number;
    is_admin: boolean;
    created_at: string;
}

interface FeedbackItem {
    id: number;
    rating?: number;
    comment?: string;
    message?: string;
    created_at?: string;
    is_approved?: boolean;
}

class AdminDashboard {
    private currentSection: string = 'dashboard';
    private charts: { [key: string]: any } = {};
    private dashboardStats: DashboardStats = {
        totalBookings: 0,
        totalRevenue: 0,
        activeUsers: 0,
        activeTrips: 0
    };

    // Data storage
    private bookingsData: BookingData[] = [];
    private vehiclesData: VehicleData[] = [];
    private schedulesData: ScheduleData[] = [];
    private operatorsData: OperatorData[] = [];
    private locationsData: LocationData[] = [];
    private usersData: UserData[] = [];
    private allBookingsData: BookingData[] = [];
    private feedbackData: FeedbackItem[] = [];
    private bookingsByUser: Record<number, BookingData[]> = {};

    constructor() {
        this.init();
    }

    private async init(): Promise<void> {
        try {
            // Check admin authentication
            await this.checkAdminAccess();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Load initial data
            await this.loadAllData();
            
            // Initialize charts
            this.initializeCharts();
            
            // Set initial section
            this.showSection('dashboard');
            
            // Setup automatic refresh every 10 seconds for faster updates
            setInterval(() => {
                this.refreshData();
            }, 10000);
            
            console.log('Admin dashboard initialized successfully with auto-refresh');
        } catch (error) {
            console.error('Failed to initialize admin dashboard:', error);
            Utils.showNotification('Failed to initialize admin dashboard', 'error');
        }
    }

    // removed unused redirectToLogin (was not referenced)

    private setupEventListeners(): void {
        // Sidebar navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = (e.currentTarget as HTMLElement).dataset.section;
                if (section) {
                    this.showSection(section);
                }
            });
        });

        // Sidebar toggle for mobile
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => this.toggleSidebar());
        }

        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshData());
        }

        // Logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }

        // Close sidebar on outside click (mobile)
        document.addEventListener('click', (e) => {
            const sidebar = document.getElementById('sidebar');
            const sidebarToggle = document.getElementById('sidebarToggle');
            
            if (window.innerWidth <= 768 && 
                sidebar && 
                !sidebar.contains(e.target as Node) && 
                e.target !== sidebarToggle) {
                sidebar.classList.remove('mobile-open');
            }
        });

        // Form handlers
        const addVehicleForm = document.getElementById('addVehicleForm');
        if (addVehicleForm) {
            addVehicleForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(addVehicleForm as HTMLFormElement);
                this.handleAddVehicle(formData);
            });

            // Live seat map preview handlers
            const capacityInput = document.getElementById('capacity') as HTMLInputElement | null;
            const layoutSelect = document.getElementById('seatLayoutSelect') as HTMLSelectElement | null;
            const preview = document.getElementById('seatMapPreview');
            const updatePreview = () => {
                if (!capacityInput || !layoutSelect || !preview) return;
                const total = parseInt(capacityInput.value || '0', 10);
                const layout = (layoutSelect.value || '2-2').trim();
                if (!total || total <= 0) {
                    preview.innerHTML = '<div class="text-gray-400 text-sm">Enter a valid capacity to preview the seat map…</div>';
                    return;
                }
                const seatMap = this.generateSeatMapByLayout(total, layout);
                preview.innerHTML = this.renderSeatMapPreview(seatMap, layout);
            };
            capacityInput?.addEventListener('input', updatePreview);
            layoutSelect?.addEventListener('change', updatePreview);
            // Initial preview
            setTimeout(updatePreview, 0);
        }

        const addScheduleForm = document.getElementById('addScheduleForm');
        if (addScheduleForm) {
            addScheduleForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(addScheduleForm as HTMLFormElement);
                this.handleAddSchedule(formData);
            });
        }

        // Edit schedule form submission
        const editScheduleForm = document.getElementById('editScheduleForm');
        if (editScheduleForm) {
            editScheduleForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(editScheduleForm as HTMLFormElement);
                this.handleEditSchedule(formData);
            });
        }

        // Edit vehicle form submission
        const editVehicleForm = document.getElementById('editVehicleForm');
        if (editVehicleForm) {
            editVehicleForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(editVehicleForm as HTMLFormElement);
                const vehicleId = (editVehicleForm as any).vehicleId;
                if (vehicleId) {
                    this.handleEditVehicle(formData, vehicleId);
                }
            });
        }

        // Modal close on overlay click
        document.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).classList.contains('modal-overlay')) {
                this.hideAddVehicleForm();
                this.hideAddScheduleForm();
                this.hideEditVehicleForm();
                (window as any).hideEditScheduleForm();
            }
        });

        // Price validation removed since pricing is now handled at schedule level
    }

    // Price validation removed since pricing is now handled at schedule level

    private toggleSidebar(): void {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.toggle('mobile-open');
        }
    }

    private showSection(section: string): void {
        // Update current section
        this.currentSection = section;

        // Hide all sections
        document.querySelectorAll('.section-content').forEach(el => {
            el.classList.add('hidden');
        });

        // Show target section
        const targetSection = document.getElementById(`${section}Section`);
        if (targetSection) {
            targetSection.classList.remove('hidden');
        }

        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeNavItem = document.querySelector(`[data-section="${section}"]`);
        if (activeNavItem) {
            activeNavItem.classList.add('active');
        }

        // Update page title
        this.updatePageTitle(section);

        // Load section-specific data
        this.loadSectionData(section);
    }

    private updatePageTitle(section: string): void {
        const titleMap: { [key: string]: { title: string; subtitle: string } } = {
            dashboard: { title: 'Dashboard', subtitle: 'Overview of system performance' },
            vehicles: { title: 'Vehicle Management', subtitle: 'Manage fleet and vehicle information' },
            schedules: { title: 'Schedule Management', subtitle: 'Manage routes and timetables' },
            users: { title: 'User Management', subtitle: 'Manage customer accounts' },
            bookings: { title: 'Booking Management', subtitle: 'Monitor and manage reservations' },
            analytics: { title: 'Analytics', subtitle: 'Detailed reports and insights' },
            settings: { title: 'Settings', subtitle: 'System configuration' }
        };

        const titleInfo = titleMap[section] || { title: 'Dashboard', subtitle: 'System overview' };
        
        const pageTitle = document.getElementById('pageTitle');
        const pageSubtitle = document.getElementById('pageSubtitle');
        
        if (pageTitle) pageTitle.textContent = titleInfo.title;
        if (pageSubtitle) pageSubtitle.textContent = titleInfo.subtitle;
    }

    private async loadDashboardData(): Promise<void> {
        try {
            // Load dashboard statistics
            await this.loadStats();
            
            // Load recent bookings
            await this.loadRecentBookings();
            
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            Utils.showNotification('Error loading dashboard data', 'error');
        }
    }

    private async loadStats(): Promise<void> {
        try {
            console.log('Loading dashboard stats...');
            const response = await apiService.getAdminStats();
            console.log('Stats API response:', response);
            
            if (response.success && response.data) {
                // Map the response data to our dashboard stats
                this.dashboardStats = {
                    totalBookings: response.data.totalBookings || 0,
                    totalRevenue: response.data.totalRevenue || 0,
                    activeUsers: response.data.activeUsers || 0,
                    activeTrips: response.data.activeTrips || 0,
                    totalVehicles: response.data.totalVehicles || 0,
                    totalOperators: response.data.totalOperators || 0,
                    recentBookings: response.data.recentBookings || 0,
                    avgRating: response.data.avgRating || 4.5,
                    revenueGrowth: response.data.revenueGrowth || 0,
                    userGrowth: response.data.userGrowth || 0,
                    completedBookings: response.data.completedBookings || 0,
                    cancelledBookings: response.data.cancelledBookings || 0,
                    monthlyRevenue: response.data.monthlyRevenue || [],
                    popularRoutes: response.data.popularRoutes || [],
                    vehicleUtilization: response.data.vehicleUtilization || [],
                    bookingStatusStats: response.data.bookingStatusStats || {},
                    vehicleTypeStats: response.data.vehicleTypeStats || {},
                    lastUpdated: response.data.lastUpdated
                };
                console.log('Dashboard stats loaded successfully:', this.dashboardStats);
            } else {
                console.error('Failed to load dashboard stats:', response.error || response.message);
                // Fallback to basic stats if API fails
                this.dashboardStats = {
                    totalBookings: 0,
                    totalRevenue: 0,
                    activeUsers: 0,
                    activeTrips: 0,
                    totalVehicles: 0,
                    totalOperators: 0,
                    recentBookings: 0,
                    avgRating: 4.5,
                    revenueGrowth: 0,
                    userGrowth: 0,
                    completedBookings: 0,
                    cancelledBookings: 0,
                    monthlyRevenue: [],
                    popularRoutes: [],
                    vehicleUtilization: []
                };
            }

            this.updateStatsDisplay();
            // After we have stats, compute month over month deltas
            this.updateMoMChanges();
        } catch (error) {
            console.error('Error loading stats:', error);
            // Fallback to empty stats on error
            this.dashboardStats = {
                totalBookings: 0,
                totalRevenue: 0,
                activeUsers: 0,
                activeTrips: 0,
                totalVehicles: 0,
                totalOperators: 0,
                recentBookings: 0,
                avgRating: 4.5,
                revenueGrowth: 0,
                userGrowth: 0,
                completedBookings: 0,
                cancelledBookings: 0,
                monthlyRevenue: [],
                popularRoutes: [],
                vehicleUtilization: []
            };
            this.updateStatsDisplay();
            this.updateMoMChanges();
        }
    }

    private updateStatsDisplay(): void {
        console.log('Updating dashboard stats display with:', this.dashboardStats);
        
        // Update main dashboard cards
        const elements = {
            totalBookings: document.getElementById('totalBookings'),
            totalRevenue: document.getElementById('totalRevenue'),
            activeUsers: document.getElementById('activeUsers'),
            activeTrips: document.getElementById('activeTrips')
        };

        if (elements.totalBookings) {
            elements.totalBookings.textContent = this.dashboardStats.totalBookings.toLocaleString();
        }
        if (elements.totalRevenue) {
            elements.totalRevenue.textContent = `৳${this.dashboardStats.totalRevenue.toLocaleString()}`;
        }
        if (elements.activeUsers) {
            elements.activeUsers.textContent = this.dashboardStats.activeUsers.toLocaleString();
        }
        if (elements.activeTrips) {
            elements.activeTrips.textContent = this.dashboardStats.activeTrips.toLocaleString();
        }

        // Update additional dashboard metrics
        const additionalElements = {
            totalVehicles: document.getElementById('totalVehicles'),
            totalOperators: document.getElementById('totalOperators'),
            recentBookings: document.getElementById('recentBookings'),
            avgRating: document.getElementById('avgRating'),
            completedBookings: document.getElementById('completedBookings'),
            cancelledBookings: document.getElementById('cancelledBookings')
        };

        if (additionalElements.totalVehicles && this.dashboardStats.totalVehicles !== undefined) {
            additionalElements.totalVehicles.textContent = this.dashboardStats.totalVehicles.toLocaleString();
        }
        
        if (additionalElements.totalOperators && this.dashboardStats.totalOperators !== undefined) {
            additionalElements.totalOperators.textContent = this.dashboardStats.totalOperators.toLocaleString();
        }
        
        if (additionalElements.recentBookings && this.dashboardStats.recentBookings !== undefined) {
            additionalElements.recentBookings.textContent = this.dashboardStats.recentBookings.toLocaleString();
        }

        if (additionalElements.avgRating && this.dashboardStats.avgRating !== undefined) {
            additionalElements.avgRating.textContent = this.dashboardStats.avgRating.toFixed(1);
        }

        if (additionalElements.completedBookings && this.dashboardStats.completedBookings !== undefined) {
            additionalElements.completedBookings.textContent = this.dashboardStats.completedBookings.toLocaleString();
        }

        if (additionalElements.cancelledBookings && this.dashboardStats.cancelledBookings !== undefined) {
            additionalElements.cancelledBookings.textContent = this.dashboardStats.cancelledBookings.toLocaleString();
        }

        // Update growth indicators
        if (this.dashboardStats.revenueGrowth !== undefined) {
            const revenueGrowthEl = document.getElementById('revenueGrowth');
            if (revenueGrowthEl) {
                const growth = this.dashboardStats.revenueGrowth;
                revenueGrowthEl.textContent = `${growth > 0 ? '+' : ''}${growth.toFixed(1)}%`;
                revenueGrowthEl.className = growth >= 0 ? 'text-green-600' : 'text-red-600';
            }
        }

        if (this.dashboardStats.userGrowth !== undefined) {
            const userGrowthEl = document.getElementById('userGrowth');
            if (userGrowthEl) {
                const growth = this.dashboardStats.userGrowth;
                userGrowthEl.textContent = `${growth > 0 ? '+' : ''}${growth.toFixed(1)}%`;
                userGrowthEl.className = growth >= 0 ? 'text-green-600' : 'text-red-600';
            }
        }

        // Update last updated timestamp
        if (this.dashboardStats.lastUpdated) {
            const lastUpdatedEl = document.getElementById('lastUpdated');
            if (lastUpdatedEl) {
                const lastUpdate = new Date(this.dashboardStats.lastUpdated);
                lastUpdatedEl.textContent = `Last updated: ${lastUpdate.toLocaleString()}`;
            }
        }

        console.log('Dashboard stats display updated successfully');
    }

    private updateMoMChanges(): void {
        // Compute dynamic deltas using monthlyRevenue and other inferred series
        const setChange = (idPrefix: string, pct: number) => {
            const wrap = document.getElementById(`${idPrefix}Change`);
            const icon = document.getElementById(`${idPrefix}ChangeIcon`);
            const text = document.getElementById(`${idPrefix}ChangeText`);
            if (!wrap || !icon || !text) return;
            wrap.classList.remove('positive', 'negative');
            const up = pct >= 0;
            wrap.classList.add(up ? 'positive' : 'negative');
            icon.className = `fas ${up ? 'fa-arrow-up' : 'fa-arrow-down'}`;
            text.textContent = `${up ? '+' : ''}${pct.toFixed(1)}% from last month`;
        };

        // Revenue-based change
        const rev = this.dashboardStats.monthlyRevenue || [];
        if (rev.length >= 2) {
            const cur = rev[rev.length - 1].revenue || 0;
            const prev = rev[rev.length - 2].revenue || 0;
            const pct = prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100;
            setChange('revenue', pct);
        }

        // Approximate bookings trend from revenue if explicit series absent
        if (rev.length >= 2) {
            const cur = Math.floor((rev[rev.length - 1].revenue || 0) / 200);
            const prev = Math.floor((rev[rev.length - 2].revenue || 0) / 200);
            const pct = prev === 0 ? (cur > 0 ? 100 : 0) : ((cur - prev) / prev) * 100;
            setChange('bookings', pct);
        }

        // Users and trips MoM: try to use bookingStatusStats/vehicleUtilization as proxy if present
        const usersNow = this.dashboardStats.activeUsers || 0;
        const usersPrev = (this.dashboardStats as any).activeUsersPrev || 0;
        if (usersPrev !== 0 || usersNow !== 0) {
            const pct = usersPrev === 0 ? (usersNow > 0 ? 100 : 0) : ((usersNow - usersPrev) / usersPrev) * 100;
            setChange('users', pct);
        } else if (typeof this.dashboardStats.userGrowth === 'number') {
            setChange('users', this.dashboardStats.userGrowth);
        }

        const tripsNow = this.dashboardStats.activeTrips || 0;
        const tripsPrev = (this.dashboardStats as any).activeTripsPrev || 0;
        if (tripsPrev !== 0 || tripsNow !== 0) {
            const pct = tripsPrev === 0 ? (tripsNow > 0 ? 100 : 0) : ((tripsNow - tripsPrev) / tripsPrev) * 100;
            setChange('trips', pct);
        }
    }

    private async loadRecentBookings(): Promise<void> {
        try {
            console.log('Loading recent bookings...');
            const response = await apiService.getAdminBookings();
            console.log('Recent bookings API response:', response);
            
            if (response.success && response.data) {
                // Take only first 5 for recent bookings
                const recentBookings = response.data.slice(0, 5);
                this.renderRecentBookings(recentBookings);
            } else {
                console.error('Failed to load recent bookings:', response.error || response.message);
                this.renderRecentBookings([]);
            }
        } catch (error) {
            console.error('Error loading recent bookings:', error);
            // Fallback to empty state
            this.renderRecentBookings([]);
        }
    }

    private renderRecentBookings(bookings: BookingData[]): void {
        const container = document.getElementById('recentBookingsTable');
        if (!container) return;

        const tableHtml = `
            <div class="table-row font-semibold text-gray-300 bg-gray-800/50">
                <div class="grid grid-cols-6 gap-4">
                    <div>PNR</div>
                    <div>Customer</div>
                    <div>Route</div>
                    <div>Status</div>
                    <div>Amount</div>
                    <div>Date</div>
                </div>
            </div>
            ${bookings.map(booking => `
                <div class="table-row">
                    <div class="grid grid-cols-6 gap-4 items-center">
                        <div class="font-mono text-blue-400">${booking.pnr}</div>
                        <div class="text-white">${booking.user_name}</div>
                        <div class="text-gray-300">${booking.route}</div>
                        <div>
                            <span class="px-2 py-1 text-xs rounded-full ${this.getStatusClass(booking.status)}">
                                ${booking.status.toUpperCase()}
                            </span>
                        </div>
                        <div class="text-green-400 font-semibold">৳${booking.total_price}</div>
                        <div class="text-gray-400 text-sm">${this.formatDate(booking.booking_date)}</div>
                    </div>
                </div>
            `).join('')}
        `;

        container.innerHTML = tableHtml;
    }

    private getStatusClass(status: string): string {
        const statusClasses: { [key: string]: string } = {
            confirmed: 'bg-green-500/20 text-green-400',
            pending: 'bg-yellow-500/20 text-yellow-400',
            cancelled: 'bg-red-500/20 text-red-400',
            completed: 'bg-blue-500/20 text-blue-400'
        };
        return statusClasses[status] || 'bg-gray-500/20 text-gray-400';
    }

    private formatDate(dateString: string): string {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return 'N/A';
        }
    }

    private initializeCharts(): void {
        console.log('Initializing charts with data:', this.dashboardStats);
        
        // Booking trends chart
        const bookingCtx = document.getElementById('bookingChart') as HTMLCanvasElement;
        if (bookingCtx) {
            const bookingData = this.dashboardStats.monthlyRevenue || [
                { month: 'Jan', revenue: 45000 },
                { month: 'Feb', revenue: 52000 },
                { month: 'Mar', revenue: 48000 },
                { month: 'Apr', revenue: 61000 },
                { month: 'May', revenue: 55000 },
                { month: 'Jun', revenue: 67000 }
            ];
            
            this.charts.booking = new (window as any).Chart(bookingCtx, {
                type: 'line',
                data: {
                    labels: bookingData.map(item => item.month),
                    datasets: [{
                        label: 'Bookings Trend',
                        data: bookingData.map(item => Math.floor(item.revenue / 200)), // Approximate bookings from revenue
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: { color: '#e5e7eb' }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { color: '#9ca3af' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        },
                        y: {
                            ticks: { color: '#9ca3af' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        }
                    }
                }
            });
        }

        // Revenue chart
        const revenueCtx = document.getElementById('revenueChart') as HTMLCanvasElement;
        if (revenueCtx) {
            const revenueData = this.dashboardStats.monthlyRevenue || [
                { month: 'Jan', revenue: 45000 },
                { month: 'Feb', revenue: 52000 },
                { month: 'Mar', revenue: 48000 },
                { month: 'Apr', revenue: 61000 },
                { month: 'May', revenue: 55000 },
                { month: 'Jun', revenue: 67000 }
            ];
            
            this.charts.revenue = new (window as any).Chart(revenueCtx, {
                type: 'bar',
                data: {
                    labels: revenueData.map(item => item.month),
                    datasets: [{
                        label: 'Revenue (৳)',
                        data: revenueData.map(item => item.revenue),
                        backgroundColor: 'rgba(6, 182, 212, 0.8)',
                        borderColor: '#06b6d4',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: { color: '#e5e7eb' }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { color: '#9ca3af' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        },
                        y: {
                            ticks: { color: '#9ca3af' },
                            grid: { color: 'rgba(255, 255, 255, 0.1)' }
                        }
                    }
                }
            });
        }

        // Initialize analytics charts
        this.initializeAnalyticsCharts();
    }

    private initializeAnalyticsCharts(): void {
        // Monthly performance chart
        const monthlyCtx = document.getElementById('monthlyChart') as HTMLCanvasElement;
        if (monthlyCtx) {
            const monthlyData = this.dashboardStats.monthlyRevenue || [];
            
            this.charts.monthly = new (window as any).Chart(monthlyCtx, {
                type: 'line',
                data: {
                    labels: monthlyData.map(item => item.month),
                    datasets: [{
                        label: 'Monthly Revenue',
                        data: monthlyData.map(item => item.revenue),
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { labels: { color: '#e5e7eb' } }
                    },
                    scales: {
                        x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } },
                        y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255, 255, 255, 0.1)' } }
                    }
                }
            });
        }

        // Popular routes chart
        const routesCtx = document.getElementById('routesChart') as HTMLCanvasElement;
        if (routesCtx) {
            const routesData = this.dashboardStats.popularRoutes || [
                { route: 'Dhaka-Chittagong', count: 45 },
                { route: 'Dhaka-Sylhet', count: 32 },
                { route: 'Chittagong-Cox\'s Bazar', count: 28 },
                { route: 'Dhaka-Rajshahi', count: 24 },
                { route: 'Sylhet-Chittagong', count: 18 }
            ];
            
            this.charts.routes = new (window as any).Chart(routesCtx, {
                type: 'doughnut',
                data: {
                    labels: routesData.map(item => item.route),
                    datasets: [{
                        data: routesData.map(item => item.count),
                        backgroundColor: [
                            '#3b82f6',
                            '#06b6d4',
                            '#10b981',
                            '#f59e0b',
                            '#ef4444'
                        ],
                        borderWidth: 2,
                        borderColor: '#1f2937'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { 
                            position: 'bottom',
                            labels: { color: '#e5e7eb' } 
                        }
                    }
                }
            });
        }
    }

    private async loadSectionData(section: string): Promise<void> {
        console.log('Loading section data for:', section);
        
        switch (section) {
            case 'vehicles':
                await this.loadVehiclesData();
                break;
            case 'schedules':
                await this.loadSchedulesData();
                break;
            case 'users':
                await this.loadUsersData();
                break;
            case 'bookings':
                console.log('Loading bookings section data...');
                await this.loadAllBookingsData();
                break;
            case 'feedback':
                console.log('Loading feedback section data...');
                await this.loadFeedbackData();
                break;
            case 'analytics':
                await this.loadAnalytics();
                break;
            case 'dashboard':
                await this.loadDashboardData();
                break;
            default:
                console.log('No specific data loading for section:', section);
                break;
        }
        
        console.log('Section data loading completed for:', section);
    }

    private async loadAnalytics(): Promise<void> {
        try {
            console.log('Loading analytics data...');
            // Load comprehensive analytics
            await Promise.all([
                this.loadStats(),
                this.loadVehiclesData(),
                this.loadSchedulesData(), 
                this.loadAllBookingsData(),
                this.loadUsersData()
            ]);
            
            // Update charts with real data
            this.updateAnalyticsCharts();
            console.log('Analytics data loaded');
        } catch (error) {
            console.error('Error loading analytics:', error);
        }
    }

    private updateAnalyticsCharts(): void {
        // Update charts with real data from loaded data
        if (this.charts.monthly && this.dashboardStats.monthlyRevenue) {
            const monthlyData = this.dashboardStats.monthlyRevenue;
            this.charts.monthly.data.labels = monthlyData.map(item => item.month);
            this.charts.monthly.data.datasets[0].data = monthlyData.map(item => item.revenue);
            this.charts.monthly.update();
        }

        if (this.charts.routes && this.dashboardStats.popularRoutes) {
            const routesData = this.dashboardStats.popularRoutes;
            this.charts.routes.data.labels = routesData.map(item => item.route);
            this.charts.routes.data.datasets[0].data = routesData.map(item => item.count);
            this.charts.routes.update();
        }

        // Update booking and revenue charts with current data
        if (this.charts.booking && this.dashboardStats.monthlyRevenue) {
            const bookingData = this.dashboardStats.monthlyRevenue;
            this.charts.booking.data.labels = bookingData.map(item => item.month);
            this.charts.booking.data.datasets[0].data = bookingData.map(item => Math.floor(item.revenue / 200));
            this.charts.booking.update();
        }

        if (this.charts.revenue && this.dashboardStats.monthlyRevenue) {
            const revenueData = this.dashboardStats.monthlyRevenue;
            this.charts.revenue.data.labels = revenueData.map(item => item.month);
            this.charts.revenue.data.datasets[0].data = revenueData.map(item => item.revenue);
            this.charts.revenue.update();
        }
    }

    // Note: legacy wrapper methods removed to satisfy noUnusedLocals.

    private async refreshData(): Promise<void> {
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            const icon = refreshBtn.querySelector('i');
            if (icon) {
                icon.classList.add('fa-spin');
            }
        }

        try {
            // Fast parallel loading for better performance
            const promises = [this.loadDashboardData()];
            
            if (this.currentSection !== 'dashboard') {
                promises.push(this.loadSectionData(this.currentSection));
            }
            
            await Promise.all(promises);
            
            // Only show notification for manual refresh
            if (refreshBtn && refreshBtn.contains(document.activeElement)) {
                Utils.showNotification('Data refreshed successfully', 'success');
            }
        } catch (error) {
            console.warn('Error refreshing data:', error);
            // Only show error notification for manual refresh
            if (refreshBtn && refreshBtn.contains(document.activeElement)) {
                Utils.showNotification('Error refreshing data', 'error');
            }
        } finally {
            if (refreshBtn) {
                const icon = refreshBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-spin');
                }
            }
        }
    }

    private async loadAllData(): Promise<void> {
        try {
            // Load all admin data in parallel
            await Promise.all([this.loadBookingsData(), this.loadVehiclesData(), this.loadSchedulesData(), this.loadOperatorsData(), this.loadLocationsData(), this.loadUsersData(), this.loadAllBookingsData(), this.loadFeedbackData()]);
            console.log('All admin data loaded successfully');
        } catch (error) {
            console.error('Error loading admin data:', error);
            Utils.showNotification('Failed to load admin data. Please refresh the page.', 'error');
        }
    }

    private async loadBookingsData(): Promise<void> {
        try {
            const response = await fetch('/admin/bookings', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (response.ok) {
                this.bookingsData = await response.json();
                this.updateBookingsTable();
            } else {
                console.error('Failed to load bookings:', response.statusText);
            }
        } catch (error) {
            console.error('Error loading bookings:', error);
        }
    }

    private async loadVehiclesData(): Promise<void> {
        try {
            console.log('Loading vehicles data...');
            const response = await apiService.getVehicles();
            console.log('Vehicles API response:', response);
            
            if (response.success && response.data) {
                console.log('Vehicles data received:', response.data);
                this.vehiclesData = response.data;
                // Ensure newest first (by id then created_at)
                this.vehiclesData.sort((a: any, b: any) => {
                    const idDiff = (b?.id ?? 0) - (a?.id ?? 0);
                    if (idDiff !== 0) return idDiff;
                    const ta = new Date(a?.created_at || 0).getTime();
                    const tb = new Date(b?.created_at || 0).getTime();
                    return tb - ta;
                });
                this.updateVehiclesTable();
                console.log('Vehicles table updated');
            } else {
                console.error('Failed to load vehicles:', response.error || response.message);
            }
        } catch (error) {
            console.error('Error loading vehicles:', error);
        }
    }

    public async refreshVehicles(): Promise<void> { await this.loadVehiclesData(); }

    private async loadSchedulesData(): Promise<void> {
        try {
            console.log('Loading schedules data...');
            const response = await apiService.getSchedules();
            console.log('Schedules API response:', response);
            
            if (response.success && response.data) {
                console.log('Schedules data received:', response.data);
                this.schedulesData = response.data;
                // Ensure newest first (by id then created_at)
                this.schedulesData.sort((a: any, b: any) => {
                    const idDiff = (b?.id ?? 0) - (a?.id ?? 0);
                    if (idDiff !== 0) return idDiff;
                    const ta = new Date(a?.created_at || 0).getTime();
                    const tb = new Date(b?.created_at || 0).getTime();
                    return tb - ta;
                });
                this.updateSchedulesTable();
                console.log('Schedules table updated');
            } else {
                console.error('Failed to load schedules:', response.error || response.message);
            }
        } catch (error) {
            console.error('Error loading schedules:', error);
        }
    }

    public async refreshSchedules(): Promise<void> { await this.loadSchedulesData(); }
    
    public getVehicleById(id: number): VehicleData | undefined {
        return this.vehiclesData?.find(v => v.id === id);
    }

    public getScheduleById(id: number): any {
        return this.schedulesData.find((s: any) => s.id === id);
    }

    private async loadOperatorsData(): Promise<void> {
        try {
            console.log('Loading operators data...');
            const response = await apiService.getAdminOperators();
            console.log('Operators API response:', response);
            
            if (response.success && response.data) {
                console.log('Operators data received:', response.data);
                this.operatorsData = response.data;
                console.log('Operators data loaded');
            } else {
                console.error('Failed to load operators:', response.error || response.message);
            }
        } catch (error) {
            console.error('Error loading operators:', error);
        }
    }

    private async loadLocationsData(): Promise<void> {
        try {
            console.log('Loading locations data...');
            const response = await apiService.getAdminLocations();
            console.log('Locations API response:', response);
            
            if (response.success && response.data) {
                console.log('Locations data received:', response.data);
                this.locationsData = response.data;
                console.log('Locations data loaded');
            } else {
                console.error('Failed to load locations:', response.error || response.message);
            }
        } catch (error) {
            console.error('Error loading locations:', error);
        }
    }

    private async loadUsersData(): Promise<void> {
        try {
            console.log('Loading users data...');
            const response = await apiService.getAdminUsers();
            console.log('Users API response:', response);
            
            if (response.success && response.data) {
                console.log('Users data received:', response.data);
                this.usersData = response.data;
                this.updateUsersTable();
                console.log('Users table updated');
            } else {
                console.error('Failed to load users:', response.error || response.message);
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    }

    public async refreshUsers(): Promise<void> {
        await this.loadUsersData();
    }

    private async loadAllBookingsData(): Promise<void> {
        try {
            console.log('Loading all bookings data...');
            const response = await apiService.getAdminBookings();
            console.log('All bookings API response:', response);
            
            if (response.success && response.data) {
                console.log('All bookings data received:', response.data);
                // Handle both direct array and nested object responses
                let bookingsArray = response.data;
                if ((response.data as any).bookings && Array.isArray((response.data as any).bookings)) {
                    bookingsArray = (response.data as any).bookings;
                } else if (Array.isArray(response.data)) {
                    bookingsArray = response.data;
                } else {
                    bookingsArray = [];
                }
                
                this.allBookingsData = bookingsArray;
                // Build map for totals by user_id (supports nested user object from API)
                this.bookingsByUser = this.allBookingsData.reduce((acc: Record<number, BookingData[]>, b: BookingData) => {
                    const uid = ((b as any).user && (b as any).user.id) || (b as any).user_id || (b as any).userId || 0;
                    if (!uid) return acc;
                    if (!acc[uid]) acc[uid] = [];
                    acc[uid].push(b);
                    return acc;
                }, {});
                this.updateAllBookingsTable();
                console.log('All bookings table updated with', this.allBookingsData.length, 'bookings');
                // Refresh users table to reflect accurate totals by user
                this.updateUsersTable();
                
                // Show message if no bookings but API worked
                if (this.allBookingsData.length === 0 && response.message) {
                    console.log('No bookings available:', response.message);
                }
            } else {
                console.error('Failed to load all bookings:', response.error || response.message);
                this.allBookingsData = [];
                this.updateAllBookingsTable();
            }
        } catch (error) {
            console.error('Error loading all bookings:', error);
            this.allBookingsData = [];
            this.updateAllBookingsTable();
        }
    }

    private async loadFeedbackData(): Promise<void> {
        try {
            console.log('Loading feedback data...');
            const resp = await apiService.getAdminFeedback();
            console.log('Feedback API response:', resp);
            
            if (resp.success && resp.data) {
                console.log('Feedback data received:', resp.data);
                const data = (resp.data as any);
                
                // Handle different response formats
                let feedbackArray = [];
                if (data.feedback && Array.isArray(data.feedback)) {
                    feedbackArray = data.feedback;
                } else if (Array.isArray(data)) {
                    feedbackArray = data;
                } else if (Array.isArray(resp.data)) {
                    feedbackArray = resp.data;
                } else {
                    feedbackArray = [];
                }
                
                this.feedbackData = feedbackArray;
                this.updateFeedbackTable();
                console.log('Feedback table updated with', this.feedbackData.length, 'feedbacks');
            } else {
                console.error('Failed to load feedback:', resp.error || resp.message);
                // Log the exact error for debugging
                if (resp.error && Array.isArray(resp.error)) {
                    console.error('Feedback API errors:', resp.error);
                }
                if (resp.message && Array.isArray(resp.message)) {
                    console.error('Feedback API messages:', resp.message);
                }
                this.feedbackData = [];
                this.updateFeedbackTable();
            }
        } catch (e) {
            console.error('Feedback load error', e);
            this.feedbackData = [];
            this.updateFeedbackTable();
        }
    }

    private updateBookingsTable(): void {
        const tbody = document.querySelector('#recentBookings tbody');
        if (!tbody || !this.bookingsData) return;

        tbody.innerHTML = this.bookingsData.map((booking: BookingData) => `
            <tr>
                <td>${booking.pnr || booking.id}</td>
                <td>${booking.user_name || 'N/A'}</td>
                <td>${booking.route || `${booking.source} → ${booking.destination}`}</td>
                <td>
                    <span class="status-badge status-${booking.status}">
                        ${booking.status}
                    </span>
                </td>
                <td>৳${booking.total_price}</td>
                <td>${new Date(booking.booking_date).toLocaleDateString()}</td>
                <td>
                    <button class="btn-view" onclick="window.viewBooking(${booking.id})">View</button>
                </td>
            </tr>
        `).join('');
    }

    private updateVehiclesTable(): void {
        console.log('Updating vehicles table with data:', this.vehiclesData);
        const tbody = document.querySelector('#vehiclesTable tbody');
        console.log('Vehicles tbody element:', tbody);
        if (!tbody || !this.vehiclesData) return;

        if (!this.vehiclesData || this.vehiclesData.length === 0) {
            console.log('No vehicles data found');
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400">No vehicles found</td></tr>';
            return;
        }

        console.log('Rendering', this.vehiclesData.length, 'vehicles');
        tbody.innerHTML = this.vehiclesData.map((vehicle: VehicleData) => `
            <tr>
                <td>${vehicle.vehicle_number}</td>
                <td>${vehicle.vehicle_type}</td>
                <td>${vehicle.operator_name}</td>
                <td>${vehicle.total_seats}</td>
                <td>${vehicle.facilities?.join(', ') || 'None'}</td>
                <td>
                    <span class="status-badge status-${vehicle.is_active ? 'active' : 'inactive'}">
                        ${vehicle.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>
                    <div class="flex gap-2">
                        <button class="btn-edit" onclick="window.editVehicle(${vehicle.id})" title="Edit Facilities">
                            <i class="fas fa-edit"></i> Edit Facilities
                        </button>
                        <button class="btn-delete" onclick="window.deleteVehicle(${vehicle.id})" title="Delete Vehicle">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        console.log('Vehicles table HTML updated');
    }

    private updateSchedulesTable(): void {
        console.log('Updating schedules table with data:', this.schedulesData);
        const tbody = document.querySelector('#schedulesTable tbody');
        console.log('Schedules tbody element:', tbody);
        if (!tbody || !this.schedulesData) return;

        if (!this.schedulesData || this.schedulesData.length === 0) {
            console.log('No schedules data found');
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400">No schedules found</td></tr>';
            return;
        }

        console.log('Rendering', this.schedulesData.length, 'schedules');
        tbody.innerHTML = this.schedulesData.map((schedule: ScheduleData) => `
            <tr>
                <td>${schedule.source_name || 'N/A'}</td>
                <td>${schedule.destination_name || 'N/A'}</td>
                <td>${schedule.departure_time}</td>
                <td>${schedule.arrival_time}</td>
                <td>${schedule.duration || 'N/A'}</td>
                <td>${schedule.vehicle_number || 'N/A'}</td>
                <td>
                    <span class="status-badge status-${schedule.is_active ? 'active' : 'inactive'}">
                        ${schedule.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>
                    <button class="btn-edit" onclick="window.editSchedule(${schedule.id})">Edit</button>
                    <button class="btn-delete" onclick="window.deleteSchedule(${schedule.id})">Delete</button>
                </td>
            </tr>
        `).join('');
        console.log('Schedules table updated');
    }

    private updateUsersTable(): void {
        console.log('Updating users table with data:', this.usersData);
        const tbody = document.querySelector('#usersTable tbody');
        console.log('Users tbody element:', tbody);
        if (!tbody || !this.usersData) return;

        if (!this.usersData || this.usersData.length === 0) {
            console.log('No users data found');
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400">No users found</td></tr>';
            return;
        }

        console.log('Rendering', this.usersData.length, 'users');
    tbody.innerHTML = this.usersData.map((user: UserData) => {
            const total = this.bookingsByUser[user.id]?.length || user.total_bookings || 0;
            return `
            <tr>
                <td>${user.id}</td>
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${user.phone || 'N/A'}</td>
                <td>${total}</td>
                <td>
                    <span class="status-badge ${user.is_admin ? 'status-active' : 'status-inactive'}">
                        ${user.is_admin ? 'Admin' : 'User'}
                    </span>
                </td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn-view" onclick="window.viewUser(${user.id})">View</button>
                </td>
            </tr>
        `}).join('');
        console.log('Users table updated');
    }

    private updateAllBookingsTable(): void {
        console.log('Updating all bookings table with data:', this.allBookingsData);
        const tbody = document.querySelector('#allBookingsTable tbody');
        console.log('All bookings tbody element:', tbody);
        if (!tbody || !this.allBookingsData) return;

        if (!this.allBookingsData || this.allBookingsData.length === 0) {
            console.log('No bookings data found');
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400">No bookings found</td></tr>';
            return;
        }

        console.log('Rendering', this.allBookingsData.length, 'bookings');
        tbody.innerHTML = this.allBookingsData.map((booking: BookingData) => `
            <tr>
                <td>${booking.pnr || booking.id}</td>
                <td>${booking.user_name || 'N/A'}</td>
                <td>${booking.route || `${booking.source || ''} → ${booking.destination || ''}`}</td>
                <td>${booking.vehicle_number || 'N/A'}</td>
                <td>${new Date(booking.booking_date).toLocaleDateString()}</td>
                <td>৳${booking.total_price || 0}</td>
                <td>
                    <span class="status-badge status-${booking.status}">
                        ${booking.status}
                    </span>
                </td>
                <td>
                    <button class="btn-view" onclick="window.viewBooking(${booking.id})">View</button>
                </td>
            </tr>
        `).join('');
        console.log('All bookings table updated');
    }

    private updateFeedbackTable(): void {
        const tbody = document.querySelector('#feedbackTable tbody');
        if (!tbody) return;
        if (!this.feedbackData.length) {
            (tbody as HTMLElement).innerHTML = '<tr><td colspan="7" class="text-center text-gray-400">No feedback found</td></tr>';
            return;
        }
    (tbody as HTMLElement).innerHTML = this.feedbackData.map(f => `
            <tr>
                <td>${f.id}</td>
                <td>${f.rating ?? '-'}</td>
                <td style="max-width:360px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${(f.comment || f.message || '').replace(/</g,'&lt;')}</td>
                <td>${f.created_at ? new Date(f.created_at).toLocaleString() : ''}</td>
                <td>
            <label class="checkbox-label"><input type="checkbox" ${f.is_approved ? 'checked' : ''} onchange="window.toggleFeedbackVisibility(${f.id}, 'is_approved', this.checked)"> Show on Home</label>
                </td>
                <td>
                    <button class="btn-view" onclick="window.respondToFeedback(${f.id})">Respond</button>
                </td>
            </tr>
        `).join('');
    }

    public async toggleFeedbackVisibility(id: number, field: 'is_approved', value: boolean) {
        try {
        const resp = await apiService.updateFeedbackVisibility(id, { [field]: value });
            if (!resp.success) throw new Error(resp.error || 'Update failed');
            Utils.showNotification('Feedback updated', 'success');
            await this.loadFeedbackData();
        } catch (e) {
            console.error(e);
            Utils.showNotification('Failed to update feedback', 'error');
        }
    }

    public async respondToFeedback(id: number) {
        const text = prompt('Enter response to the user:');
        if (!text) return;
        try {
            const resp = await apiService.respondToFeedback(id, text);
            if (!resp.success) {
                const msg = resp.error || resp.message || 'Failed to send response';
                throw new Error(msg);
            }
            Utils.showNotification('Response sent and user notified', 'success');
            await this.loadFeedbackData();
        } catch (e) {
            console.error('Respond error:', e);
            const msg = (e as Error)?.message || 'Failed to send response';
            Utils.showNotification(msg, 'error');
        }
    }

    // Modal and Form Functions
    public async showAddVehicleForm(): Promise<void> {
        await this.loadOperatorsForForm();
        const modal = document.getElementById('addVehicleModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    public hideAddVehicleForm(): void {
        const modal = document.getElementById('addVehicleModal');
        if (modal) {
            modal.classList.add('hidden');
        }
        // Reset form
        const form = document.getElementById('addVehicleForm') as HTMLFormElement;
        if (form) {
            form.reset();
        }
    }

    public showAddScheduleForm(): void {
        this.loadVehiclesForForm();
        this.loadLocationsForForm();
        const modal = document.getElementById('addScheduleModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    public hideAddScheduleForm(): void {
        const modal = document.getElementById('addScheduleModal');
        if (modal) {
            modal.classList.add('hidden');
        }
        // Reset form
        const form = document.getElementById('addScheduleForm') as HTMLFormElement;
        if (form) {
            form.reset();
        }
    }

    public showEditVehicleForm(vehicleId: number): void {
        const vehicle = this.vehiclesData?.find(v => v.id === vehicleId);
        if (!vehicle) {
            Utils.showNotification('Vehicle not found', 'error');
            return;
        }

        // Populate vehicle info display
        const vehicleInfoTitle = document.getElementById('vehicleInfoTitle');
        const vehicleInfoContent = document.getElementById('vehicleInfoContent');
        
        if (vehicleInfoTitle && vehicleInfoContent) {
            vehicleInfoTitle.textContent = `${vehicle.vehicle_number} - ${vehicle.vehicle_name}`;
            vehicleInfoContent.innerHTML = `
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div><strong>Type:</strong> ${vehicle.vehicle_type}</div>
                    <div><strong>Capacity:</strong> ${vehicle.total_seats} seats</div>
                    <div><strong>Operator:</strong> ${vehicle.operator_name || 'N/A'}</div>
                    <div><strong>Status:</strong> ${vehicle.is_active ? 'Active' : 'Inactive'}</div>
                </div>
            `;
        }

        // Set facilities checkboxes
        const form = document.getElementById('editVehicleForm') as HTMLFormElement;
        if (form) {
            const facilityCheckboxes = form.querySelectorAll('input[name="facilities"]') as NodeListOf<HTMLInputElement>;
            facilityCheckboxes.forEach(checkbox => {
                checkbox.checked = vehicle.facilities?.includes(checkbox.value) || false;
            });

            // Store vehicle ID for form submission
            (form as any).vehicleId = vehicleId;
        }

        // Show modal
        const modal = document.getElementById('editVehicleModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    public hideEditVehicleForm(): void {
        const modal = document.getElementById('editVehicleModal');
        if (modal) {
            modal.classList.add('hidden');
        }
        // Reset form
        const form = document.getElementById('editVehicleForm') as HTMLFormElement;
        if (form) {
            form.reset();
            delete (form as any).vehicleId;
        }
    }

    private async handleEditVehicle(formData: FormData, vehicleId: number): Promise<void> {
        try {
            // Show loading state
            Utils.showNotification('Updating vehicle facilities...', 'info');
            
            // Only handle facilities update
            const facilities = formData.getAll('facilities') as string[];
            const vehicleData = {
                facilities: facilities
            };

            console.log('Updating vehicle ID:', vehicleId);
            console.log('Vehicle data to update:', vehicleData);

            // Check if we have a valid token
            const token = localStorage.getItem('access_token');
            if (!token) {
                throw new Error('No authentication token found. Please login again.');
            }

            // Test basic connectivity first
            console.log('Testing API connection...');
            try {
                const testResponse = await fetch('https://ticketkini.onrender.com/', {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    },
                    // Add timeout to prevent hanging
                    signal: AbortSignal.timeout(10000)
                });
                console.log('Connection test response:', testResponse.status);
                
                if (!testResponse.ok && testResponse.status >= 500) {
                    throw new Error('Server is currently unavailable. Please try again later.');
                }
            } catch (connError) {
                console.error('Connection test failed:', connError);
                if (connError instanceof Error) {
                    if (connError.name === 'AbortError' || connError.message.includes('timeout')) {
                        throw new Error('Connection timeout. Please check your internet connection and try again.');
                    } else if (connError.message.includes('Failed to fetch')) {
                        throw new Error('Cannot connect to server. Please check your internet connection.');
                    }
                }
                throw new Error('Network error. Please check your connection and try again.');
            }

            // Make the actual API call
            console.log('Making API call to update vehicle...');
            
            try {
                const response = await apiService.updateVehicle(vehicleId, vehicleData);
                console.log('API response:', response);
                
                if (response.success) {
                    Utils.showNotification('Vehicle facilities updated successfully!', 'success');
                    this.hideEditVehicleForm();
                    await this.refreshVehicles();
                } else {
                    const errorMsg = response.error || response.message || 'Failed to update vehicle facilities';
                    console.error('API returned error:', errorMsg);
                    throw new Error(errorMsg);
                }
            } catch (apiError) {
                console.error('API call failed:', apiError);
                // If the API service call fails, try a direct fetch as fallback
                console.log('Trying direct API call as fallback...');
                
                const directResponse = await fetch(`https://ticketkini.onrender.com/admin/vehicles/${vehicleId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(vehicleData),
                    signal: AbortSignal.timeout(15000)
                });

                console.log('Direct API response status:', directResponse.status);
                
                if (!directResponse.ok) {
                    const errorText = await directResponse.text();
                    console.error('Direct API error response:', errorText);
                    
                    if (directResponse.status === 401) {
                        throw new Error('Authentication failed. Please login again.');
                    } else if (directResponse.status === 403) {
                        throw new Error('Permission denied. Admin access required.');
                    } else if (directResponse.status === 404) {
                        throw new Error('Vehicle not found. It may have been deleted.');
                    } else if (directResponse.status >= 500) {
                        throw new Error('Server error. Please try again later.');
                    } else {
                        throw new Error(`API error (${directResponse.status}): ${errorText}`);
                    }
                }

                const directData = await directResponse.json();
                console.log('Direct API success response:', directData);
                
                Utils.showNotification('Vehicle facilities updated successfully!', 'success');
                this.hideEditVehicleForm();
                await this.refreshVehicles();
            }
        } catch (error) {
            console.error('Error updating vehicle facilities:', error);
            
            // Provide more specific error messages
            let errorMessage = 'Failed to update vehicle facilities';
            
            if (error instanceof Error) {
                if (error.message.includes('timeout') || error.name === 'AbortError') {
                    errorMessage = 'Request timed out. Please try again.';
                } else if (error.message.includes('Failed to fetch') || error.message.includes('fetch')) {
                    errorMessage = 'Network error: Unable to connect to server. Please check your internet connection and try again.';
                } else if (error.message.includes('401') || error.message.includes('Unauthorized') || error.message.includes('Authentication failed')) {
                    errorMessage = 'Authentication failed. Please login again.';
                    // Redirect to login after a delay
                    setTimeout(() => {
                        window.location.href = 'login.html';
                    }, 2000);
                } else if (error.message.includes('403') || error.message.includes('Forbidden') || error.message.includes('Permission denied')) {
                    errorMessage = 'Permission denied. Admin access required.';
                } else if (error.message.includes('404')) {
                    errorMessage = 'Vehicle not found. It may have been deleted.';
                } else if (error.message.includes('500') || error.message.includes('Server error')) {
                    errorMessage = 'Server error. Please try again later.';
                } else {
                    errorMessage = error.message;
                }
            }
            
            Utils.showNotification(errorMessage, 'error');
        }
    }

    private async loadOperatorsForForm(): Promise<void> {
        // Ensure operators data is loaded
        if (!this.operatorsData || this.operatorsData.length === 0) {
            await this.loadOperatorsData();
        }

        const select = document.getElementById('operatorId') as HTMLSelectElement;
        if (!select) return;

        select.innerHTML = '<option value="">Select Operator</option>';
        
        if (this.operatorsData && this.operatorsData.length > 0) {
            this.operatorsData.forEach((operator: OperatorData) => {
                if (operator.is_active) {
                    select.innerHTML += `<option value="${operator.id}">${operator.name}</option>`;
                }
            });
        } else {
            // Add a default option if no operators are available
            select.innerHTML += '<option value="" disabled>No operators available</option>';
        }
    }

    private async loadVehiclesForForm(): Promise<void> {
        const select = document.getElementById('vehicleSelect') as HTMLSelectElement;
        if (!select || !this.vehiclesData) return;

        select.innerHTML = '<option value="">Select Vehicle</option>';
        this.vehiclesData.forEach((vehicle: VehicleData) => {
            if (vehicle.is_active) {
                select.innerHTML += `<option value="${vehicle.id}">${vehicle.vehicle_number} - ${vehicle.vehicle_type}</option>`;
            }
        });
    }

    private async loadLocationsForForm(): Promise<void> {
        const sourceSelect = document.getElementById('sourceLocation') as HTMLSelectElement;
        const destSelect = document.getElementById('destinationLocation') as HTMLSelectElement;
        
        if (!sourceSelect || !destSelect || !this.locationsData) return;

        const locationOptions = this.locationsData.map((location: LocationData) => 
            `<option value="${location.id}">${location.name}, ${location.city}</option>`
        ).join('');

        sourceSelect.innerHTML = '<option value="">Select Source</option>' + locationOptions;
        destSelect.innerHTML = '<option value="">Select Destination</option>' + locationOptions;
    }

    private async handleAddVehicle(formData: FormData): Promise<void> {
        try {
            // Disable submit to prevent double submit
            const submitBtn = document.querySelector('#addVehicleForm button[type="submit"]') as HTMLButtonElement | null;
            if (submitBtn) submitBtn.disabled = true;

            // Basic client-side validation
            const vehicleNumberRaw = String(formData.get('vehicle_number') || '').trim();
            const operatorIdVal = String(formData.get('operator_id') || '').trim();
            const capacityVal = String(formData.get('capacity') || '').trim();
            const vehicleTypeRaw = String(formData.get('vehicle_type') || '').trim();
            if (!vehicleNumberRaw) throw new Error('Vehicle number is required');
            if (!operatorIdVal) throw new Error('Operator is required');
            if (!capacityVal || isNaN(Number(capacityVal)) || Number(capacityVal) <= 0) {
                throw new Error('Capacity must be a positive number');
            }
            if (!vehicleTypeRaw) throw new Error('Vehicle type is required');

            // Duplicate check against existing numbers (fast)
            try {
                const numbersResp = await apiService.getVehicleNumbers();
                if (numbersResp.success && numbersResp.data?.vehicle_numbers) {
                    const exists = numbersResp.data.vehicle_numbers.some(v => v.number?.toUpperCase() === vehicleNumberRaw.toUpperCase());
                    if (exists) throw new Error('Vehicle number already exists');
                }
            } catch (e) {
                // Non-blocking if endpoint fails; backend still has unique check
            }

            // Facilities will be collected via dedicated helper during payload build

            // Helper: normalize vehicle type to backend enum
            const normalizeVehicleType = (v: string | null): string => {
                const t = (v || '').toLowerCase();
                if (["bus", "microbus", "car", "coach", "launch"].includes(t)) return "BUS";
                if (t === "train") return "TRAIN";
                if (["plane", "air", "aircraft"].includes(t)) return "PLANE";
                return "BUS";
            };

            // Parse and validate numbers
            const operatorId = parseInt(operatorIdVal);
            const capacity = parseInt(capacityVal);
            if (!operatorId || !capacity) {
                throw new Error('Operator and Capacity are required');
            }

            // Build seat map by selected layout
            const selectedLayout = String((document.getElementById('seatLayoutSelect') as HTMLSelectElement)?.value || '2-2');
            // DB payload wants an object like row 86: { total_seats, layout: '2-2', classes: { ECONOMY: [1..N] } }
            const allSeatNumbers: number[] = Array.from({ length: capacity }, (_, i) => i + 1);
            const seatMapPayload = {
                total_seats: capacity,
                layout: selectedLayout,
                classes: { ECONOMY: allSeatNumbers }
            } as any;

            // Parse class prices from individual fields
            let classPricesArr: Array<{ class_name: string; base_price: number }> | null = null;
            
            // Set class prices to null for now - will be set when creating schedules
            classPricesArr = null;

            // Build simplified VehicleCreate payload expected by backend
            const vehicleData = {
                vehicle_number: String(formData.get('vehicle_number') || ''),
                vehicle_name: String(formData.get('vehicle_name') || ''),
                vehicle_type: normalizeVehicleType(vehicleTypeRaw),
                operator_id: parseInt(String(formData.get('operator_id') || '')),
                total_seats: parseInt(String(formData.get('capacity') || '40')),
                facilities: this.getSelectedFacilities(),
                // Save seat map in DB as object to match row 86 format
                seat_map: seatMapPayload,
                class_prices: classPricesArr
            };

            console.log('Adding vehicle with data:', vehicleData);
            const response = await apiService.addVehicle(vehicleData);
            console.log('Add vehicle API response:', response);

            if (response.success) {
                Utils.showNotification('Vehicle added successfully!', 'success');
                await this.refreshVehicles();
                this.hideAddVehicleForm();
                
                // Notify other pages that a new vehicle was added
                this.notifyDataChange('vehicle_added', { vehicleId: response.data?.id });
            } else {
                Utils.showNotification(response.error || 'Failed to add vehicle', 'error');
            }
        } catch (error) {
            console.error('Error adding vehicle:', error);
            Utils.showNotification('Failed to add vehicle', 'error');
        }
    }

    private async handleAddSchedule(formData: FormData): Promise<void> {
        try {
            const dep = String(formData.get('departure_time') || '');
            const arr = String(formData.get('arrival_time') || '');
            const vehicleId = parseInt(String(formData.get('vehicle_id') || ''));
            const basePrice = parseFloat(String(formData.get('base_price') || '0'));

            // Compute duration in "Xh Ym" format, handling overnight journeys
            const computeDuration = (startHHMM: string, endHHMM: string): string => {
                const [sh, sm] = startHHMM.split(':').map(n => parseInt(n, 10));
                const [eh, em] = endHHMM.split(':').map(n => parseInt(n, 10));
                let startMin = sh * 60 + sm;
                let endMin = eh * 60 + em;
                if (isNaN(startMin) || isNaN(endMin)) return '0h 0m';
                if (endMin < startMin) endMin += 24 * 60; // next day
                const total = endMin - startMin;
                const h = Math.floor(total / 60);
                const m = total % 60;
                return `${h}h ${m}m`;
            };

            const scheduleData = {
                vehicle_id: vehicleId,
                source_id: parseInt(String(formData.get('source_id') || '')),
                destination_id: parseInt(String(formData.get('destination_id') || '')),
                departure_time: dep,
                arrival_time: arr,
                duration: computeDuration(dep, arr),
                base_price: basePrice,
                frequency: String(formData.get('frequency') || 'daily'),
                is_active: true
            };

            console.log('Adding schedule with data (normalized):', scheduleData);
            const response = await apiService.createSchedule(scheduleData);
            console.log('Add schedule API response:', response);

            if (response.success) {
                // Update the vehicle's class_prices with the base price as economy price
                if (basePrice > 0 && vehicleId) {
                    console.log(`Updating vehicle ${vehicleId} with base price ${basePrice} as economy price`);
                    try {
                        const vehicleUpdateData = {
                            class_prices: {
                                ECONOMY: basePrice,
                                economy: basePrice  // Include both cases for compatibility
                            }
                        };
                        const vehicleUpdateResponse = await apiService.updateVehicle(vehicleId, vehicleUpdateData);
                        console.log('Vehicle price update response:', vehicleUpdateResponse);
                        
                        if (!vehicleUpdateResponse.success) {
                            console.warn('Failed to update vehicle prices:', vehicleUpdateResponse.error);
                        }
                    } catch (vehicleError) {
                        console.error('Error updating vehicle prices:', vehicleError);
                    }
                }
                
                Utils.showNotification('Schedule added successfully!', 'success');
                await this.refreshSchedules();
                this.hideAddScheduleForm();
                
                // Notify other pages that a new schedule was added
                this.notifyDataChange('schedule_added', { scheduleId: response.data?.id });
            } else {
                Utils.showNotification(response.error || 'Failed to add schedule', 'error');
            }
        } catch (error) {
            console.error('Error adding schedule:', error);
            Utils.showNotification('Failed to add schedule', 'error');
        }
    }

    private async handleEditSchedule(formData: FormData): Promise<void> {
        try {
            const modal = document.getElementById('editScheduleModal');
            const scheduleId = (modal as any)?.scheduleId;
            
            if (!scheduleId) {
                Utils.showNotification('Schedule ID not found', 'error');
                return;
            }

            const dep = String(formData.get('departure_time') || '');
            const arr = String(formData.get('arrival_time') || '');

            // Compute duration in "Xh Ym" format, handling overnight journeys
            const computeDuration = (startHHMM: string, endHHMM: string): string => {
                const [sh, sm] = startHHMM.split(':').map(n => parseInt(n, 10));
                const [eh, em] = endHHMM.split(':').map(n => parseInt(n, 10));
                let startMin = sh * 60 + sm;
                let endMin = eh * 60 + em;
                if (isNaN(startMin) || isNaN(endMin)) return '0h 0m';
                if (endMin < startMin) endMin += 24 * 60; // next day
                const total = endMin - startMin;
                const h = Math.floor(total / 60);
                const m = total % 60;
                return `${h}h ${m}m`;
            };

            const updateData = {
                departure_time: dep,
                arrival_time: arr,
                duration: computeDuration(dep, arr)
            };

            console.log('Updating schedule with data:', updateData);
            const response = await apiService.updateSchedule(scheduleId, updateData);
            console.log('Update schedule API response:', response);

            if (response.success) {
                Utils.showNotification('Schedule times updated successfully!', 'success');
                (window as any).hideEditScheduleForm();
                await this.loadSchedulesData();
            } else {
                throw new Error(response.error || response.message || 'Failed to update schedule');
            }
        } catch (error) {
            console.error('Error updating schedule:', error);
            Utils.showNotification((error as Error).message || 'Failed to update schedule', 'error');
        }
    }

    // Search and Filter Functions
    public searchUsers(): void {
        const searchInput = document.getElementById('userSearch') as HTMLInputElement;
        const searchTerm = searchInput?.value.toLowerCase() || '';
        
        if (!searchTerm) {
            this.updateUsersTable();
            return;
        }

        const filteredUsers = this.usersData.filter(user => 
            user.name.toLowerCase().includes(searchTerm) ||
            user.email.toLowerCase().includes(searchTerm) ||
            user.phone?.toLowerCase().includes(searchTerm)
        );

        this.renderFilteredUsers(filteredUsers);
    }

    public filterBookings(): void {
        const statusFilter = document.getElementById('bookingStatusFilter') as HTMLSelectElement;
        const selectedStatus = statusFilter?.value || '';
        
        console.log('Filtering bookings by status:', selectedStatus);
        
        if (!selectedStatus) {
            this.updateAllBookingsTable();
            return;
        }

        const filteredBookings = this.allBookingsData.filter(booking => 
            booking.status?.toLowerCase() === selectedStatus.toLowerCase()
        );

        console.log(`Found ${filteredBookings.length} bookings with status: ${selectedStatus}`);
        this.renderFilteredBookings(filteredBookings);
    }

    public clearBookingFilters(): void {
        const statusFilter = document.getElementById('bookingStatusFilter') as HTMLSelectElement;
        if (statusFilter) {
            statusFilter.value = '';
        }
        this.updateAllBookingsTable();
        Utils.showNotification('Booking filters cleared', 'success');
    }

    public async refreshBookings(): Promise<void> {
        try {
            Utils.showNotification('Refreshing bookings...', 'info');
            await this.loadAllBookingsData();
            Utils.showNotification('Bookings refreshed successfully', 'success');
        } catch (error) {
            console.error('Error refreshing bookings:', error);
            Utils.showNotification('Failed to refresh bookings', 'error');
        }
    }

    private renderFilteredUsers(users: UserData[]): void {
        const tbody = document.querySelector('#usersTable tbody');
        if (!tbody) return;

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400">No users found matching search criteria</td></tr>';
            return;
        }

    tbody.innerHTML = users.map((user: UserData) => {
            const total = this.bookingsByUser[user.id]?.length || user.total_bookings || 0;
            return `
            <tr>
                <td>${user.id}</td>
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${user.phone || 'N/A'}</td>
                <td>${total}</td>
                <td>
                    <span class="status-badge ${user.is_admin ? 'status-active' : 'status-inactive'}">
                        ${user.is_admin ? 'Admin' : 'User'}
                    </span>
                </td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn-view" onclick="window.viewUser(${user.id})">View</button>
                </td>
            </tr>
        `}).join('');
    }

    // Open user details modal
    public openViewUserModal(id: number): void {
        const user = this.usersData.find(u => u.id === id);
        if (!user) {
            Utils.showNotification('User not found', 'error');
            return;
        }
        const modal = document.getElementById('viewUserModal');
        const content = document.getElementById('viewUserContent');
        if (!modal || !content) return;
    const total = this.bookingsByUser[user.id]?.length || user.total_bookings || 0;
        const rows = (
            [
                ['ID', String(user.id)],
                ['Name', user.name],
                ['Email', user.email],
                ['Phone', user.phone || 'N/A'],
                ['Role', user.is_admin ? 'Admin' : 'User'],
        ['Total Bookings', String(total)],
                ['Joined', new Date(user.created_at).toLocaleString()],
            ] as Array<[string,string]>
        ).map(([k,v]) => `
            <div class="grid grid-cols-3 gap-4 py-2 border-b border-gray-700/50">
                <div class="text-gray-400">${k}</div>
                <div class="col-span-2 text-white break-words">${v}</div>
            </div>
        `).join('');
        content.innerHTML = `
            <div class="p-4">
                ${rows}
            </div>
        `;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    public hideViewUserModal(): void {
        const modal = document.getElementById('viewUserModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    private renderFilteredBookings(bookings: BookingData[]): void {
        const tbody = document.querySelector('#allBookingsTable tbody');
        if (!tbody) return;

        if (bookings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400">No bookings found matching filter criteria</td></tr>';
            return;
        }

        tbody.innerHTML = bookings.map((booking: BookingData) => `
            <tr>
                <td>${booking.pnr || booking.id}</td>
                <td>${booking.user_name || 'N/A'}</td>
                <td>${booking.route || `${booking.source} → ${booking.destination}`}</td>
                <td>${booking.vehicle_number || 'N/A'}</td>
                <td>${new Date(booking.booking_date).toLocaleDateString()}</td>
                <td>৳${booking.total_price}</td>
                <td>
                    <span class="status-badge status-${booking.status}">
                        ${booking.status}
                    </span>
                </td>
                <td>
                    <button class="btn-view" onclick="window.viewBooking(${booking.id})">View</button>
                </td>
            </tr>
        `).join('');
    }

    private async logout(): Promise<void> {
        const confirmed = await this.confirmDialog('Are you sure you want to logout?', {
            title: 'Logout',
            confirmText: 'Logout',
            cancelText: 'Stay Logged In'
        });
        if (!confirmed) return;

        try {
            await apiService.logout();
            Utils.showNotification('Logged out successfully', 'success');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        } catch (error) {
            console.error('Logout error:', error);
            Utils.showNotification('Error logging out', 'error');
        }
    }

    public showViewBookingModal(bookingId: number): void {
        const booking = this.allBookingsData.find(b => b.id === bookingId);
        if (!booking) {
            Utils.showNotification('Booking not found', 'error');
            return;
        }

        const modal = document.getElementById('viewBookingModal');
        const content = document.getElementById('viewBookingContent');
        
        if (!modal || !content) {
            console.error('View booking modal elements not found');
            return;
        }

        // Format dates
        const bookingDate = new Date(booking.booking_date);
        const formattedBookingDate = bookingDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const formattedBookingTime = bookingDate.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });

        // Format travel date if available
        let travelDateSection = '';
        if (booking.travel_date) {
            const travelDate = new Date(booking.travel_date);
            const formattedTravelDate = travelDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const formattedTravelTime = travelDate.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            travelDateSection = `
                <div class="flex justify-between">
                    <span class="text-gray-300">Travel Date:</span>
                    <span class="text-white">${formattedTravelDate}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-300">Travel Time:</span>
                    <span class="text-white">${formattedTravelTime}</span>
                </div>
            `;
        }

        // Format expires at if available
        let expirySection = '';
        if (booking.expires_at) {
            const expiryDate = new Date(booking.expires_at);
            const formattedExpiry = expiryDate.toLocaleString('en-US');
            expirySection = `
                <div class="flex justify-between">
                    <span class="text-gray-300">Expires At:</span>
                    <span class="text-white">${formattedExpiry}</span>
                </div>
            `;
        }

        // Format seats information
        const seatsInfo = Array.isArray(booking.seats) ? booking.seats.join(', ') : booking.seats || 'Not specified';
        
        // Format passenger details
        let passengerSection = '';
        if (booking.passenger_details && Array.isArray(booking.passenger_details) && booking.passenger_details.length > 0) {
            const passengerRows = booking.passenger_details.map((passenger, index) => `
                <div class="bg-gray-800/30 rounded-lg p-3 border border-gray-700">
                    <h5 class="text-sm font-semibold text-blue-400 mb-2">Passenger ${index + 1}</h5>
                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div><span class="text-gray-400">Name:</span> <span class="text-white">${passenger.name || 'N/A'}</span></div>
                        <div><span class="text-gray-400">Age:</span> <span class="text-white">${passenger.age || 'N/A'}</span></div>
                        <div><span class="text-gray-400">Gender:</span> <span class="text-white">${passenger.gender || 'N/A'}</span></div>
                        <div><span class="text-gray-400">Seat:</span> <span class="text-white">${passenger.seat_number || 'N/A'}</span></div>
                    </div>
                </div>
            `).join('');
            
            passengerSection = `
                <div class="glass-card p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <i class="fas fa-users text-indigo-400 text-xl"></i>
                        <h4 class="text-lg font-semibold text-white">Passenger Details</h4>
                    </div>
                    <div class="space-y-3">
                        ${passengerRows}
                    </div>
                </div>
            `;
        }

        // Format payment information
        let paymentSection = '';
        if (booking.payments && Array.isArray(booking.payments) && booking.payments.length > 0) {
            const paymentRows = booking.payments.map((payment, index) => `
                <div class="bg-gray-800/30 rounded-lg p-3 border border-gray-700">
                    <h5 class="text-sm font-semibold text-green-400 mb-2">Payment ${index + 1}</h5>
                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div><span class="text-gray-400">Amount:</span> <span class="text-white">৳${payment.amount || 'N/A'}</span></div>
                        <div><span class="text-gray-400">Method:</span> <span class="text-white">${payment.payment_method || 'N/A'}</span></div>
                        <div><span class="text-gray-400">Status:</span> <span class="text-white">${payment.status || 'N/A'}</span></div>
                        <div><span class="text-gray-400">Transaction:</span> <span class="text-white">${payment.transaction_id || 'N/A'}</span></div>
                    </div>
                </div>
            `).join('');
            
            paymentSection = `
                <div class="glass-card p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <i class="fas fa-credit-card text-green-400 text-xl"></i>
                        <h4 class="text-lg font-semibold text-white">Payment Information</h4>
                    </div>
                    <div class="space-y-3">
                        ${paymentRows}
                    </div>
                </div>
            `;
        }

        // Format schedule information
        let scheduleSection = '';
        if (booking.schedule) {
            scheduleSection = `
                <div class="space-y-3">
                    <div class="flex justify-between">
                        <span class="text-gray-300">Departure:</span>
                        <span class="text-white">${booking.schedule.departure_time || 'N/A'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-300">Arrival:</span>
                        <span class="text-white">${booking.schedule.arrival_time || 'N/A'}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-300">Duration:</span>
                        <span class="text-white">${booking.schedule.duration || 'N/A'}</span>
                    </div>
                </div>
            `;
        }

        // Generate comprehensive booking details HTML
        content.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Booking Information -->
                <div class="glass-card p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <i class="fas fa-ticket-alt text-blue-400 text-xl"></i>
                        <h4 class="text-lg font-semibold text-white">Booking Information</h4>
                    </div>
                    <div class="space-y-3">
                        <div class="flex justify-between">
                            <span class="text-gray-300">PNR:</span>
                            <span class="text-white font-mono font-bold">${booking.pnr || booking.id}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Status:</span>
                            <span class="status-badge status-${booking.status}">${booking.status.toUpperCase()}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Total Amount:</span>
                            <span class="text-green-400 font-bold text-lg">৳${booking.total_price}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Seat Class:</span>
                            <span class="text-white">${booking.seat_class?.toUpperCase() || 'N/A'}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Seats:</span>
                            <span class="text-white">${seatsInfo}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Booking Date:</span>
                            <span class="text-white">${formattedBookingDate}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Booking Time:</span>
                            <span class="text-white">${formattedBookingTime}</span>
                        </div>
                        ${travelDateSection}
                        ${expirySection}
                    </div>
                </div>

                <!-- Customer Information -->
                <div class="glass-card p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <i class="fas fa-user text-green-400 text-xl"></i>
                        <h4 class="text-lg font-semibold text-white">Customer Information</h4>
                    </div>
                    <div class="space-y-3">
                        <div class="flex justify-between">
                            <span class="text-gray-300">Name:</span>
                            <span class="text-white">${booking.user?.name || booking.user_name || 'N/A'}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Email:</span>
                            <span class="text-white">${booking.user?.email || 'N/A'}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Phone:</span>
                            <span class="text-white">${booking.user?.phone || 'N/A'}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">User ID:</span>
                            <span class="text-white">${booking.user?.id || booking.user_id || 'N/A'}</span>
                        </div>
                    </div>
                </div>

                <!-- Trip Information -->
                <div class="glass-card p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <i class="fas fa-route text-purple-400 text-xl"></i>
                        <h4 class="text-lg font-semibold text-white">Trip Information</h4>
                    </div>
                    <div class="space-y-3">
                        <div class="flex justify-between">
                            <span class="text-gray-300">Route:</span>
                            <span class="text-white">${booking.route || `${booking.source || 'N/A'} → ${booking.destination || 'N/A'}`}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Vehicle:</span>
                            <span class="text-white">${booking.vehicle?.vehicle_number || booking.vehicle_number || 'N/A'}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Vehicle Type:</span>
                            <span class="text-white">${booking.vehicle?.vehicle_type || 'N/A'}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Total Seats:</span>
                            <span class="text-white">${booking.vehicle?.total_seats || 'N/A'}</span>
                        </div>
                        ${scheduleSection}
                    </div>
                </div>

                <!-- System Information -->
                <div class="glass-card p-6">
                    <div class="flex items-center gap-3 mb-4">
                        <i class="fas fa-info-circle text-cyan-400 text-xl"></i>
                        <h4 class="text-lg font-semibold text-white">System Information</h4>
                    </div>
                    <div class="space-y-3">
                        <div class="flex justify-between">
                            <span class="text-gray-300">Created:</span>
                            <span class="text-white">${booking.created_at ? new Date(booking.created_at).toLocaleString() : 'N/A'}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-300">Updated:</span>
                            <span class="text-white">${booking.updated_at ? new Date(booking.updated_at).toLocaleString() : 'N/A'}</span>
                        </div>
                        <div class="bg-gray-800/50 rounded-lg p-3">
                            <p class="text-sm text-gray-300">
                                This booking was created on ${formattedBookingDate} at ${formattedBookingTime}.
                                ${booking.status === 'CONFIRMED' ? 'The booking is confirmed and active.' : 
                                  booking.status === 'PENDING' ? 'The booking is pending confirmation.' :
                                  booking.status === 'CANCELLED' ? 'The booking has been cancelled.' :
                                  booking.status === 'COMPLETED' ? 'The trip has been completed.' : 
                                  booking.status === 'EXPIRED' ? 'The booking has expired.' :
                                  'Status information not available.'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            
            ${passengerSection}
            ${paymentSection}
        `;

        // Store booking ID for potential future actions
        (modal as any).bookingId = bookingId;
        
        // Show modal
        modal.classList.remove('hidden');
    }

    public hideViewBookingModal(): void {
        const modal = document.getElementById('viewBookingModal');
        if (modal) {
            modal.classList.add('hidden');
            delete (modal as any).bookingId;
        }
    }

    // Professional confirm modal (replaces browser confirm dialogs)
    private ensureConfirmModal(): void {
        if (document.getElementById('confirmModal')) return;
        const overlay = document.createElement('div');
        overlay.id = 'confirmModal';
        overlay.className = 'modal-overlay hidden';
        overlay.innerHTML = `
            <div class="modal-content max-w-md">
                <div class="modal-header">
                    <h3 id="confirmModalTitle" class="text-xl font-semibold text-white">Please Confirm</h3>
                    <button type="button" class="modal-close" id="confirmModalCloseBtn">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-form">
                    <div id="confirmModalMessage" class="text-gray-200 whitespace-pre-line"></div>
                    <div class="form-actions mt-6">
                        <button id="confirmModalCancel" type="button" class="btn-secondary">Cancel</button>
                        <button id="confirmModalOk" type="button" class="btn-primary">Confirm</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(overlay);
    }

    public confirmDialog(message: string, options?: { title?: string; confirmText?: string; cancelText?: string; destructive?: boolean }): Promise<boolean> {
        this.ensureConfirmModal();
        const overlay = document.getElementById('confirmModal')!;
        const titleEl = document.getElementById('confirmModalTitle')!;
        const msgEl = document.getElementById('confirmModalMessage')!;
        const okBtn = document.getElementById('confirmModalOk') as HTMLButtonElement;
        const cancelBtn = document.getElementById('confirmModalCancel') as HTMLButtonElement;
        const closeBtn = document.getElementById('confirmModalCloseBtn') as HTMLButtonElement;

        // Apply content
        titleEl.textContent = options?.title || 'Please Confirm';
        msgEl.textContent = message || '';
        okBtn.textContent = options?.confirmText || 'Confirm';
        cancelBtn.textContent = options?.cancelText || 'Cancel';

        // Style destructive action
        if (options?.destructive) {
            okBtn.classList.remove('btn-primary');
            okBtn.classList.add('action-btn', 'danger');
        } else {
            okBtn.classList.remove('action-btn', 'danger');
            if (!okBtn.classList.contains('btn-primary')) okBtn.classList.add('btn-primary');
        }

        // Show modal
        overlay.classList.remove('hidden');

        return new Promise<boolean>((resolve) => {
            const cleanup = () => {
                overlay.classList.add('hidden');
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                closeBtn.removeEventListener('click', onCancel);
                overlay.removeEventListener('click', onOverlayClick);
                document.removeEventListener('keydown', onKey);
            };
            const onOk = () => { cleanup(); resolve(true); };
            const onCancel = () => { cleanup(); resolve(false); };
            const onOverlayClick = (e: MouseEvent) => { if (e.target === overlay) onCancel(); };
            const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            closeBtn.addEventListener('click', onCancel);
            overlay.addEventListener('click', onOverlayClick);
            document.addEventListener('keydown', onKey);
        });
    }

    public async debugApiEndpoints(): Promise<void> {
        console.log('=== DEBUG: Testing API Endpoints ===');
        
        try {
            // First test basic connectivity
            console.log('Testing basic API connectivity...');
            const basicResp = await fetch('https://ticketkini.onrender.com/');
            console.log('Basic API response status:', basicResp.status);
            
            console.log('Testing admin stats endpoint...');
            const statsResp = await apiService.getAdminStats();
            console.log('Stats response:', statsResp);
            
            console.log('Testing admin bookings endpoint...');
            const bookingsResp = await apiService.getAdminBookings();
            console.log('Bookings response:', bookingsResp);
            
            console.log('Testing admin feedback endpoint...');
            const feedbackResp = await apiService.getAdminFeedback();
            console.log('Feedback response:', feedbackResp);
            
            console.log('Testing admin users endpoint...');
            const usersResp = await apiService.getAdminUsers();
            console.log('Users response:', usersResp);
            
            // Test if we have valid data
            console.log('Current data state:');
            console.log('- allBookingsData length:', this.allBookingsData.length);
            console.log('- feedbackData length:', this.feedbackData.length);
            console.log('- usersData length:', this.usersData.length);
            
            console.log('=== DEBUG: API Endpoints Test Complete ===');
        } catch (error) {
            console.error('API debugging failed:', error);
        }
    }

    private async checkAdminAccess() {
        const token = apiService.getToken();
        if (!token) {
            Utils.showNotification('Access Denied. Admins only.', 'error');
            setTimeout(() => Utils.navigateTo('login.html?admin=1'), 1500);
            throw new Error("Admin access required");
        }
        const response = await apiService.getCurrentUser();
        if (!response.success || !response.data?.is_admin) {
            Utils.showNotification('Access Denied. Admins only.', 'error');
            setTimeout(() => Utils.navigateTo('login.html?admin=1'), 1500);
            throw new Error("Admin access required");
        }
        // Save user to localStorage for navbar/state use
        if (response.data) {
            Utils.setLocalStorage('user', response.data);
        }
        return response.data;
    }

    private notifyDataChange(type: string, data: any) {
        // Broadcast a custom event that other pages can listen to
        const event = new CustomEvent('dataChange', {
            detail: {
                type,
                data,
                timestamp: Date.now()
            }
        });
        window.dispatchEvent(event);
        
        // Also store in localStorage for pages that load later
        const changes = JSON.parse(localStorage.getItem('dataChanges') || '[]');
        changes.push({
            type,
            data,
            timestamp: Date.now()
        });
        
        // Keep only last 10 changes
        if (changes.length > 10) {
            changes.splice(0, changes.length - 10);
        }
        
        localStorage.setItem('dataChanges', JSON.stringify(changes));
        console.log(`Notified data change: ${type}`, data);
    }

    // Generate seat map from a layout string like "2-2", "2-1", "3-2", "3-3", "2-3-2"
    private generateSeatMapByLayout(totalSeats: number, layout: string): number[][] {
        const sections = layout.split('-').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
        const seatsPerRow = sections.length ? sections.reduce((a, b) => a + b, 0) : 4;
        const seatMap: number[][] = [];
        let current = 1;
        while (current <= totalSeats) {
            const row: number[] = [];
            for (let i = 0; i < seatsPerRow && current <= totalSeats; i++) {
                row.push(current++);
            }
            if (row.length) seatMap.push(row);
        }
        return seatMap;
    }

    private getSelectedFacilities(): string[] {
        const facilities: string[] = [];
        const facilityCheckboxes = document.querySelectorAll('input[name="facilities"]:checked') as NodeListOf<HTMLInputElement>;
        facilityCheckboxes.forEach(checkbox => {
            if (checkbox.value) facilities.push(checkbox.value);
        });
        return facilities;
    }

    // Render text-based preview with aisle gaps based on layout
    private renderSeatMapPreview(seatMap: number[][], layout: string): string {
        const sections = layout.split('-').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
        const aisleAfterCounts: number[] = [];
        if (sections.length > 0) {
            let acc = 0;
            for (let i = 0; i < sections.length - 1; i++) {
                acc += sections[i];
                aisleAfterCounts.push(acc);
            }
        } else {
            aisleAfterCounts.push(2);
        }

        const seatChip = (n: number) => `<div class="w-8 h-8 text-[10px] flex items-center justify-center bg-gray-200 text-gray-800 rounded font-semibold">${n}</div>`;
        const aisle = `<div class="w-6"></div>`;
        const rowsHtml = seatMap.map((row, idx) => {
            const parts: string[] = [];
            let cursor = 0;
            aisleAfterCounts.forEach(cut => {
                parts.push(row.slice(cursor, cut).map(seatChip).join(''));
                parts.push(aisle);
                cursor = cut;
            });
            parts.push(row.slice(cursor).map(seatChip).join(''));
            return `<div class="flex items-center justify-center gap-2 mb-2">
                        <div class="text-[10px] text-gray-400 w-6 text-center">${idx + 1}</div>
                        <div class="flex items-center">${parts.join('')}</div>
                    </div>`;
        }).join('');
        return `<div class="max-w-full">${rowsHtml || '<div class=\"text-gray-400 text-sm\">No seats</div>'}</div>`;
    }
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    const adminDashboard = new AdminDashboard();
    
    // Expose functions to global scope for HTML onclick handlers
    (window as any).showAddVehicleForm = () => adminDashboard.showAddVehicleForm();
    (window as any).hideAddVehicleForm = () => adminDashboard.hideAddVehicleForm();
    (window as any).showAddScheduleForm = () => adminDashboard.showAddScheduleForm();
    (window as any).hideAddScheduleForm = () => adminDashboard.hideAddScheduleForm();
    (window as any).searchUsers = () => adminDashboard.searchUsers();
    (window as any).filterBookings = () => adminDashboard.filterBookings();
    (window as any).toggleFeedbackVisibility = (id: number, field: 'is_approved', val: boolean) => adminDashboard.toggleFeedbackVisibility(id, field, val);
    (window as any).respondToFeedback = (id: number) => adminDashboard.respondToFeedback(id);
    
    // Debug function
    (window as any).debugApiEndpoints = () => adminDashboard.debugApiEndpoints();
    
    // CRUD operations (placeholder implementations)
    (window as any).editVehicle = async (id: number) => {
        adminDashboard.showEditVehicleForm(id);
    };
    (window as any).hideEditVehicleForm = () => adminDashboard.hideEditVehicleForm();
    (window as any).deleteVehicle = async (id: number) => {
        const vehicle = adminDashboard.getVehicleById(id);
        if (!vehicle) {
            Utils.showNotification('Vehicle not found', 'error');
            return;
        }
        
        const confirmMessage = `Are you sure you want to delete this vehicle?

🚌 Vehicle: ${vehicle.vehicle_number} - ${vehicle.vehicle_name}
🚗 Type: ${vehicle.vehicle_type}
👥 Capacity: ${vehicle.total_seats} seats

⚠️ This action cannot be undone and will affect any existing schedules.`;
        
        const confirmed = await adminDashboard.confirmDialog(confirmMessage, {
            title: 'Delete Vehicle',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            destructive: true
        });
        if (!confirmed) return;
        
        const resp = await apiService.deleteVehicle(id);
        if (resp.success) { 
            Utils.showNotification('Vehicle deleted successfully', 'success'); 
            await adminDashboard.refreshVehicles(); 
        } else { 
            Utils.showNotification(resp.error || 'Failed to delete vehicle', 'error'); 
        }
    };
    (window as any).editSchedule = async (id: number) => {
        try {
            // Get current schedule data
            const schedule = adminDashboard.getScheduleById(id);
            if (!schedule) {
                Utils.showNotification('Schedule not found', 'error');
                return;
            }

            // Show edit modal with current times
            const modal = document.getElementById('editScheduleModal');
            const departureInput = document.getElementById('editDepartureTime') as HTMLInputElement;
            const arrivalInput = document.getElementById('editArrivalTime') as HTMLInputElement;
            
            if (modal && departureInput && arrivalInput) {
                // Set current values
                departureInput.value = schedule.departure_time || '';
                arrivalInput.value = schedule.arrival_time || '';
                
                modal.classList.remove('hidden');
                
                // Store schedule ID for form submission
                (modal as any).scheduleId = id;
            }
        } catch (error) {
            Utils.showNotification('Error opening edit form', 'error');
        }
    };
    
    (window as any).hideEditScheduleForm = () => {
        const modal = document.getElementById('editScheduleModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    };
    
    (window as any).deleteSchedule = async (id: number) => {
        const confirmed = await adminDashboard.confirmDialog('Delete this schedule?', {
            title: 'Delete Schedule',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            destructive: true
        });
        if (!confirmed) return;
        const resp = await apiService.deleteSchedule(id);
    if (resp.success) { Utils.showNotification('Schedule deleted', 'success'); await adminDashboard.refreshSchedules(); }
        else { Utils.showNotification(resp.error || 'Failed to delete schedule', 'error'); }
    };
    (window as any).viewBooking = (id: number) => adminDashboard.showViewBookingModal(id);
    (window as any).hideViewBookingModal = () => adminDashboard.hideViewBookingModal();
    (window as any).clearBookingFilters = () => adminDashboard.clearBookingFilters();
    (window as any).refreshBookings = () => adminDashboard.refreshBookings();
    (window as any).viewUser = (id: number) => adminDashboard.openViewUserModal(id);
    (window as any).hideViewUserModal = () => adminDashboard.hideViewUserModal();
    (window as any).toggleAdmin = async (id: number) => {
        const makeAdmin = await adminDashboard.confirmDialog('Make this user an admin?', {
            title: 'Change Admin Status',
            confirmText: 'Make Admin',
            cancelText: 'Revoke Admin'
        });
        if (makeAdmin) {
            const getToken = await adminDashboard.confirmDialog('Also generate an admin access token for this user now?', {
                title: 'Generate Admin Token',
                confirmText: 'Generate Token',
                cancelText: 'Skip'
            });
            const resp = await apiService.promoteUser(id, getToken);
            if (resp.success) {
                if ((resp.data as any)?.access_token) {
                    // Provide token to copy; we do not overwrite current admin session
                    try { await navigator.clipboard.writeText((resp.data as any).access_token); Utils.showNotification('Admin token copied to clipboard for the user', 'success'); } catch {}
                }
                Utils.showNotification('User promoted to admin', 'success');
                await adminDashboard.refreshUsers();
            } else {
                Utils.showNotification(resp.error || 'Failed to promote user', 'error');
            }
        } else {
            const resp = await apiService.updateUser(id, { is_admin: false });
            if (resp.success) { Utils.showNotification('Admin role revoked', 'success'); await adminDashboard.refreshUsers(); }
            else { Utils.showNotification(resp.error || 'Failed to update user', 'error'); }
        }
    };
});