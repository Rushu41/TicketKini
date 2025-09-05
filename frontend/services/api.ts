export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  gender?: string;
  date_of_birth?: string;
  id_type?: string;
  id_number?: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

interface LoginRequest {
  email: string;
  password: string;
}

export interface AdminLoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  name: string;
  email: string;
  phone: string;
  password: string;
  gender?: string;
  date_of_birth?: string;
  id_type?: string;
  id_number?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// Admin stats interface
export interface AdminStats {
    totalBookings: number;
    totalRevenue: number;
    activeUsers: number;
    activeTrips: number;
    totalVehicles: number;
    totalOperators: number;
    recentBookings: number;
    avgRating: number;
    revenueGrowth: number;
    userGrowth: number;
    completedBookings: number;
    cancelledBookings: number;
    monthlyRevenue: Array<{month: string; revenue: number}>;
    popularRoutes: Array<{route: string; count: number}>;
    vehicleUtilization: Array<{vehicle_type: string; utilization: number}>;
    bookingStatusStats: Record<string, number>;
    vehicleTypeStats: Record<string, number>;
    lastUpdated: string;
}

export interface SearchRequest {
  source: string;
  destination: string;
  travel_date: string;
  vehicle_type?: string;
  seat_class?: string;
  operator_id?: number;
  min_price?: number;
  max_price?: number;
  departure_time_start?: string;
  departure_time_end?: string;
  sort_by?: string;
  sort_order?: string;
  page?: number;
  limit?: number;
}

export interface TripResult {
  id: number;
  vehicle_id: number;
  vehicle_name: string;
  vehicle_number: string;
  vehicle_type: string;
  operator_name: string;
  operator_id: number;
  source_name: string;
  destination_name: string;
  departure_time: string;
  arrival_time: string;
  duration: string;
  travel_date: string;
  class_prices: {[key: string]: number};
  schedule_price?: number; // Admin-set base price from schedule
  available_seats: number | {[key: string]: {total: number, booked: number, available: number, seat_numbers: number[]}};
  total_seats: number;
  amenities: string[];
  rating: number;
  total_reviews: number;
}

export interface SearchResponse {
  trips: TripResult[];
  total_count: number;
  page: number;
  limit: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface BookingRequest {
  schedule_id: number;  // Changed from transport_id to schedule_id
  seats: number[];
  seat_class: string;
  passenger_details?: any[];
  travel_date: string;
}

export interface Booking {
  id: number;
  user_id: number;
  transport_id: number;
  schedule_id?: number;
  seats: number[];
  seat_class: string;
  passenger_details?: any[];
  total_price: number;
  status: string;
  pnr?: string;
  booking_date?: string;
  travel_date?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
  // Route information (if available)
  route?: {
    source: string;
    destination: string;
    departure_time?: string;
    arrival_time?: string;
  };
  vehicle?: {
    vehicle_name?: string;
    vehicle_number?: string;
    operator_name?: string;
  };
}

export interface PaymentRequest {
  booking_id: number;
  amount: number;
  payment_method: string;
  coupon_code?: string;
  apply_coupon?: boolean;
  discount_amount: number;
  service_charge: number;
  payment_details?: {
    card_number?: string;
    card_holder?: string;
    expiry_date?: string;
    cvv?: string;
    mobile_number?: string;
    transaction_id?: string;
  };
}

export interface Payment {
  id: number;
  booking_id: number;
  user_id: number;
  amount: number;
  final_amount?: number;
  discount_amount?: number;
  payment_method: string;
  status: string;
  transaction_id?: string;
  gateway_response?: string;
  coupon_code?: string;
  created_at: string;
  updated_at: string;
  payment_time?: string;
}

export interface Vehicle {
    id: number;
    vehicle_name: string;
    vehicle_number: string;
    vehicle_type: string;
    total_seats: number;
    operator_id: number;
    operator_name?: string;
    class_prices?: object;
    facilities?: string[];
    avg_rating?: { overall?: number };
    status?: string;
    is_active?: boolean;
    created_at?: string;
}

export interface VehicleCreate {
    vehicle_name: string;
    vehicle_number: string;
    vehicle_type: string;
    total_seats: number;
    operator_id: number;
    facilities: string[];
    seat_map: number[][];
    class_prices: any[];
}

export interface Schedule {
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

export interface ScheduleCreate {
    vehicle_id: number;
    source_id: number;
    destination_id: number;
    departure_time: string;
    arrival_time: string;
    duration: string;
    frequency?: string;
    is_active?: boolean;
}

class ApiService {
  private baseUrl: string;
  private token: string | null;

  constructor() {
  // Use deployed backend URL in production
  this.baseUrl = 'https://dbms-project-ljy4.onrender.com';
    try {
      localStorage.setItem('api_base_url', this.baseUrl);
    } catch {}
    this.token = localStorage.getItem('access_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    console.log('Making API request to:', url);
    
    // Refresh token from localStorage if not set
    if (!this.token) {
      this.token = localStorage.getItem('access_token');
    }
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      console.log('Request headers:', headers);
      const response = await fetch(url, {
        ...options,
        headers,
      });

      console.log('Response status:', response.status, response.statusText);
      
      // Check if response is HTML (likely an error page)
      const contentType = response.headers.get('content-type');
      console.log('Response content-type:', contentType);
      
      if (contentType && contentType.includes('text/html')) {
        const text = await response.text();
        console.error('Received HTML response instead of JSON:', text.substring(0, 200));
        return {
          success: false,
          error: 'Server returned HTML instead of JSON. Check if the API endpoint exists.'
        };
      }

      const data = await response.json();
      console.log('Response data:', data);

      if (!response.ok) {
        // Handle authentication errors
        if (response.status === 401) {
          // Token expired or invalid, clear it
          this.token = null;
          localStorage.removeItem('access_token');

          const isAuthEndpoint = endpoint.includes('/auth/login') || endpoint.includes('/auth/signup') || endpoint.includes('/auth/admin-login');
          if (!isAuthEndpoint) {
            const path = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
            const isAdminPage = path.toLowerCase().includes('admin');
            window.location.href = isAdminPage ? '/pages/login.html?admin=1' : '/pages/login.html';
          }
        }
        
        return {
          success: false,
          error: (data && (data.detail || data.error)) || 'An error occurred',
          message: (data && (data.detail || data.error)) || 'An error occurred',
        };
      }

      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
        message: 'Network error occurred',
      };
    }
  }

  // Helper: fetch all pages (Render max page size is 100)
  private async fetchAllPages<T>(
    basePath: string,
    { limit = 100, startSkip = 0, maxPages = 100, extraParams }: { limit?: number; startSkip?: number; maxPages?: number; extraParams?: Record<string, string | number | boolean> } = {}
  ): Promise<ApiResponse<T[]>> {
    const all: T[] = [];
    let skip = startSkip;
    for (let page = 0; page < maxPages; page++) {
      const qp = new URLSearchParams();
      qp.set('limit', String(limit));
      qp.set('skip', String(skip));
      if (extraParams) {
        Object.entries(extraParams).forEach(([k, v]) => qp.set(k, String(v)));
      }
      const path = `${basePath}?${qp.toString()}`;
      console.log('Paginated fetch:', { path, page, skip, limit });
      const resp = await this.request<any>(path);
      if (!resp.success) return resp;

      // Normalize arrays possibly wrapped in an object
      let items: any[] = [];
      const data: any = resp.data;
      if (Array.isArray(data)) {
        items = data;
      } else if (data && Array.isArray(data.items)) {
        items = data.items;
      } else if (data && Array.isArray(data.bookings)) {
        items = data.bookings;
      } else if (data && Array.isArray(data.feedback)) {
        items = data.feedback;
      }

      all.push(...items);
      if (items.length < limit) break; // last page
      skip += limit;
    }
    return { success: true, data: all };
  }

  // Auth endpoints
  async login(credentials: LoginRequest): Promise<ApiResponse<LoginResponse>> {
    const response = await this.request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });

    if (response.success && response.data) {
      this.token = response.data.access_token;
      localStorage.setItem('access_token', response.data.access_token);
    }

    return response;
  }
  
  async adminLogin(credentials: AdminLoginRequest): Promise<ApiResponse<LoginResponse>> {
    const response = await this.request<LoginResponse>('/auth/admin-login', {
        method: 'POST',
        body: JSON.stringify(credentials),
    });

    if (response.success && response.data) {
      this.token = response.data.access_token;
      localStorage.setItem('access_token', response.data.access_token);
    }

    return response;
  }

  async signup(userData: SignupRequest): Promise<ApiResponse> {
    return this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async getCurrentUser(): Promise<ApiResponse<User>> {
    return this.request<User>('/auth/me');
  }

  async updateProfile(userData: Partial<User>): Promise<ApiResponse<User>> {
    return this.request<User>('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  }

  async logout(): Promise<void> {
    this.token = null;
    localStorage.removeItem('access_token');
  }

  // Search endpoints
  async searchTrips(params: SearchRequest): Promise<ApiResponse<SearchResponse>> {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    return this.request<SearchResponse>(`/search?${queryParams.toString()}`);
  }

  async searchLocations(vehicleType?: string, limit: number = 100, query: string = ""): Promise<ApiResponse<any[]>> {
    const params = new URLSearchParams();
    params.append('query', query);
    params.append('limit', limit.toString());
    
    if (vehicleType) {
      params.append('vehicle_type', vehicleType);
    }
    
    return this.request<any[]>(`/search/locations?${params.toString()}`);
  }

  async getOperators(params?: {
    source?: string;
    destination?: string;
    vehicle_type?: string;
  }): Promise<ApiResponse<any[]>> {
    const queryParams = new URLSearchParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }

    return this.request<any[]>(`/search/operators?${queryParams.toString()}`);
  }

  async getPopularRoutes(limit: number = 10): Promise<ApiResponse<any[]>> {
    return this.request<any[]>(`/search/popular-routes?limit=${limit}`);
  }

  async getSearchFilters(params?: {
    source?: string;
    destination?: string;
    travel_date?: string;
  }): Promise<ApiResponse<any>> {
    const queryParams = new URLSearchParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }

    return this.request<any>(`/search/filters?${queryParams.toString()}`);
  }

  async getSeatMap(vehicleId: number, travelDate: string, scheduleId?: number): Promise<ApiResponse<any>> {
    const params = new URLSearchParams();
    params.append('travel_date', travelDate);
    if (scheduleId) params.append('schedule_id', scheduleId.toString());
    
    // Add cache-busting parameter to ensure fresh data
    const timestamp = new Date().getTime();
    params.append('_t', timestamp.toString());
    
    console.log(`DEBUG: getSeatMap called with vehicleId=${vehicleId}, travelDate=${travelDate}, scheduleId=${scheduleId}, timestamp=${timestamp}`);
    
    return this.request<any>(`/search/seats/${vehicleId}?${params.toString()}`);
  }

  // Booking endpoints
  async createBooking(bookingData: BookingRequest): Promise<ApiResponse<Booking>> {
    return this.request<Booking>('/booking', {
      method: 'POST',
      body: JSON.stringify(bookingData),
    });
  }

  async cancelBooking(bookingId: number, reason?: string): Promise<ApiResponse<any>> {
    const body = reason ? JSON.stringify({ reason }) : null;
    return this.request<any>(`/booking/${bookingId}`, {
      method: 'DELETE',
      body,
      headers: body ? { 'Content-Type': 'application/json' } : undefined
    });
  }

  // Admin endpoints
  async getAdminStats(): Promise<ApiResponse<AdminStats>> {
    return this.request<any>('/admin/stats');
  }

  async getVehicles(): Promise<ApiResponse<any[]>> {
  return this.request<any[]>('/admin/vehicles?limit=500&skip=0');
  }

  async getSchedules(): Promise<ApiResponse<any[]>> {
  return this.request<any[]>('/admin/schedules?limit=500&skip=0');
  }

  async addSchedule(scheduleData: any): Promise<ApiResponse<any>> {
    return this.request<any>('/admin/schedules', {
      method: 'POST',
      body: JSON.stringify(scheduleData)
    });
  }

  async createSchedule(scheduleData: ScheduleCreate): Promise<ApiResponse<Schedule>> {
      return this.request<Schedule>('/admin/schedules', {
          method: 'POST',
          body: JSON.stringify(scheduleData),
      });
  }

  async getAdminLocations(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>('/admin/locations');
  }

  async getAdminOperators(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>('/admin/operators');
  }

  async getVehicleNumbers(): Promise<ApiResponse<{ vehicle_numbers: Array<{ id: number; number: string }> }>> {
    return this.request<{ vehicle_numbers: Array<{ id: number; number: string }> }>(
      '/admin/vehicles/numbers'
    );
  }

  async getAdminUsers(): Promise<ApiResponse<any[]>> {
  return this.request<any[]>('/admin/users?limit=500&skip=0');
  }

  async getAdminBookings(): Promise<ApiResponse<any[]>> {
  // Use paginated fetch with limit 100 but backend default is 500 per page
  return this.fetchAllPages<any>('/admin/bookings', { limit: 100 });
  }

  async getAdminFeedback(): Promise<ApiResponse<any[]>> {
  console.log('Making request to feedback URL:', '/feedback/admin/all');
  // Use paginated fetch with limit 100 to comply with backend max
  return this.fetchAllPages<any>('/feedback/admin/all', { limit: 100 });
  }

  async getAdminNotifications(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>('/notifications/admin/all');
  }

  async getUserNotifications(): Promise<ApiResponse<any[]>> {
    return this.request<any[]>('/notifications/my-notifications');
  }

  async getUnreadNotificationCount(): Promise<ApiResponse<any>> {
    return this.request<any>('/notifications/unread-count');
  }

  async markNotificationRead(notificationId: number): Promise<ApiResponse<any>> {
    return this.request<any>(`/notifications/${notificationId}/mark-read`, {
      method: 'PUT'
    });
  }

  async markAllNotificationsRead(): Promise<ApiResponse<any>> {
    return this.request<any>('/notifications/mark-all-read', {
      method: 'PUT'
    });
  }

  async createNotification(notificationData: any): Promise<ApiResponse<any>> {
    return this.request<any>('/notifications/', {
      method: 'POST',
      body: JSON.stringify(notificationData)
    });
  }

  async broadcastNotification(broadcastData: any): Promise<ApiResponse<any>> {
    return this.request<any>('/notifications/admin/broadcast', {
      method: 'POST',
      body: JSON.stringify(broadcastData)
    });
  }

  async getFeedbackAnalytics(): Promise<ApiResponse<any>> {
    return this.request<any>('/feedback/admin/analytics');
  }

  async getNotificationAnalytics(): Promise<ApiResponse<any>> {
    return this.request<any>('/notifications/admin/analytics');
  }

  // Admin CRUD operations
  async addVehicle(vehicleData: any): Promise<ApiResponse<any>> {
    return this.request<any>('/admin/vehicles', {
      method: 'POST',
      body: JSON.stringify(vehicleData)
    });
  }

  async createVehicle(vehicleData: VehicleCreate): Promise<ApiResponse<Vehicle>> {
      return this.request<Vehicle>('/admin/vehicles', {
          method: 'POST',
          body: JSON.stringify(vehicleData),
      });
  }

  async updateVehicle(vehicleId: number, vehicleData: any): Promise<ApiResponse<any>> {
    return this.request<any>(`/admin/vehicles/${vehicleId}`, {
      method: 'PUT',
      body: JSON.stringify(vehicleData)
    });
  }

  async deleteVehicle(vehicleId: number): Promise<ApiResponse<any>> {
    return this.request<any>(`/admin/vehicles/${vehicleId}`, {
      method: 'DELETE'
    });
  }

  async updateSchedule(scheduleId: number, scheduleData: any): Promise<ApiResponse<any>> {
    return this.request<any>(`/admin/schedules/${scheduleId}`, {
      method: 'PUT',
      body: JSON.stringify(scheduleData)
    });
  }

  async deleteSchedule(scheduleId: number): Promise<ApiResponse<any>> {
    return this.request<any>(`/admin/schedules/${scheduleId}`, {
      method: 'DELETE'
    });
  }

  async updateUser(userId: number, userData: any): Promise<ApiResponse<any>> {
    return this.request<any>(`/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData)
    });
  }

  async promoteUser(userId: number, returnToken: boolean = false): Promise<ApiResponse<{access_token?: string; token_type?: string;}>> {
    const params = returnToken ? `?return_token=true` : '';
    return this.request<any>(`/admin/users/${userId}/promote${params}` , {
      method: 'POST'
    });
  }

  async deleteUser(userId: number): Promise<ApiResponse<any>> {
    return this.request<any>(`/admin/users/${userId}`, {
      method: 'DELETE'
    });
  }

  async updateBookingStatus(bookingId: number, status: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/admin/bookings/${bookingId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  }

  async deleteNotification(notificationId: number): Promise<ApiResponse<any>> {
    return this.request<any>(`/notifications/${notificationId}`, {
      method: 'DELETE'
    });
  }

  async respondToFeedback(feedbackId: number, response: string): Promise<ApiResponse<any>> {
    return this.request<any>(`/feedback/${feedbackId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ response })
    });
  }

  // Feedback submission
  async submitFeedback(feedbackData: any): Promise<ApiResponse<any>> {
    return this.request<any>('/feedback/submit', {
      method: 'POST',
      body: JSON.stringify(feedbackData)
    });
  }

  // Booking-specific feedback (ties to a booking/vehicle)
  async submitBookingFeedback(payload: { booking_id: number; rating: number; comment: string; transport_id?: number; is_anonymous?: boolean; }): Promise<ApiResponse<any>> {
    return this.request<any>('/feedback', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async updateFeedbackVisibility(feedbackId: number, payload: { is_approved?: boolean; }): Promise<ApiResponse<any>> {
    return this.request<any>(`/feedback/admin/${feedbackId}/visibility`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  async getPublicFeedback(limit: number = 6): Promise<ApiResponse<any>> {
    return this.request<any>(`/feedback/public?limit=${limit}`);
  }

  async getUserBookingCount(): Promise<ApiResponse<any>> {
    return this.request<any>('/booking/user/count');
  }

  // Payment endpoints
  async createPayment(paymentData: PaymentRequest): Promise<ApiResponse<Payment>> {
    return this.request<Payment>('/payment', {
      method: 'POST',
      body: JSON.stringify(paymentData),
    });
  }

  async verifyCoupon(couponCode: string, bookingId: number): Promise<ApiResponse<{valid: boolean; discount_amount?: number; final_amount?: number; coupon_type?: string; message?: string;}>> {
    const params = new URLSearchParams({ coupon_code: couponCode, booking_id: String(bookingId) });
    return this.request(`/payment/verify-coupon?${params.toString()}`, {
      method: 'POST'
    });
  }

  async getUserPassStatus(): Promise<ApiResponse<any>> {
    return this.request('/payment/user-pass-status');
  }

  async getPaymentDetails(paymentId: number): Promise<ApiResponse<Payment>> {
    return this.request<Payment>(`/payment/${paymentId}`);
  }

  async getPaymentHistory(): Promise<ApiResponse<Payment[]>> {
    return this.request<Payment[]>(`/payment/history`);
  }

  async getBookingDetails(bookingId: number): Promise<ApiResponse<Booking>> {
    const response = await this.request<Booking>(`/booking/details/${bookingId}`);
    
    // Normalize booking status if response is successful
    if (response.success && response.data) {
      // Ensure status is uppercase and valid
      if (response.data.status) {
        response.data.status = this.normalizeBookingStatus(response.data.status);
      }
    }
    
    return response;
  }
  
  // Helper method to normalize booking status
  normalizeBookingStatus(status: string): string {
    // Convert to uppercase
    const upperStatus = status.toUpperCase();
    
    // Valid statuses from backend
    const validStatuses = ['CART', 'PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'COMPLETED'];
    
    // Return the status if it's valid, otherwise default to PENDING
    return validStatuses.includes(upperStatus) ? upperStatus : 'PENDING';
  }

  async getUserBookings(userId?: number, statusFilter?: string): Promise<ApiResponse<any>> {
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const targetUserId = userId || currentUser.id;
    
    console.log('getUserBookings - currentUser:', currentUser);
    console.log('getUserBookings - targetUserId:', targetUserId);
    
    if (!targetUserId) {
      console.error('No user ID found in localStorage or provided');
      throw new Error('User ID is required');
    }
    
    let url = `/booking/${targetUserId}`;
    const params = new URLSearchParams();
    
    // Request all bookings by setting a high limit
    params.append('limit', '1000');
    params.append('offset', '0');
    
    if (statusFilter) {
      params.append('status_filter', statusFilter);
    }
    
    if (params.toString()) {
      url += `?${params.toString()}`;
    }
    
    console.log('getUserBookings - URL:', url);
    
    const response = await this.request<any>(url);
    
    console.log('getUserBookings - response:', response);
    
    // Normalize booking statuses if response is successful
    if (response.success && response.data && Array.isArray(response.data)) {
      response.data = response.data.map(booking => {
        if (booking.status) {
          booking.status = this.normalizeBookingStatus(booking.status);
        }
        return booking;
      });
    }
    
    return response;
  }

  // Utility methods
  async isAuthenticated(): Promise<boolean> {
    // Refresh token from localStorage if not set
    if (!this.token) {
      this.token = localStorage.getItem('access_token');
    }
    
    if (!this.token) {
      return false;
    }
    
    // Actually validate the token by making a test API call
    try {
      const response = await this.request('/auth/me');
      return response.success;
    } catch (error) {
      // Token is invalid, clear it
      this.token = null;
      localStorage.removeItem('access_token');
      return false;
    }
  }

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string): void {
    this.token = token;
    localStorage.setItem('access_token', token);
  }
}

// Export singleton instance
export const apiService = new ApiService();