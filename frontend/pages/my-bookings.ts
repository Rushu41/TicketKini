// Enhanced My Bookings Page - TypeScript Implementation
import { apiService } from '../services/api.ts';
import Utils from '../services/utils.ts';

interface BookingData {
  id: number;
  pnr?: string;
  status: string;
  seats: number[];
  seat_class: string;
  travel_date: string;
  booking_date: string;
  total_price: number;
  passenger_details?: any[];
  route?: {
    source: string;
    destination: string;
    departure_time?: string;
    arrival_time?: string;
  };
  vehicle?: {
    vehicle_name?: string;
    vehicle_number?: string;
    vehicle_type?: string;
    operator_name?: string;
  };
}

interface FilterState {
  vehicleType: string;
  status: string;
  searchQuery: string;
  travelDate: string;
}

class EnhancedMyBookingsPage {
  private allBookings: BookingData[] = [];
  private filteredBookings: BookingData[] = [];
  private currentFilters: FilterState = {
    vehicleType: 'all',
    status: '',
    searchQuery: '',
    travelDate: ''
  };

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    // Check authentication with better error handling
    try {
      // First check if token exists
      const token = localStorage.getItem('access_token');
      if (!token) {
        console.log('No token found, redirecting to login');
        Utils.showNotification('Please login to view bookings', 'error');
        setTimeout(() => Utils.navigateTo('login.html'), 2000);
        return;
      }

      // Then validate the token with the server
      const isAuth = await apiService.isAuthenticated();
      console.log('Authentication check result:', isAuth);
      
      if (!isAuth) {
        console.log('Token validation failed, redirecting to login');
        Utils.showNotification('Session expired. Please login again.', 'error');
        setTimeout(() => Utils.navigateTo('login.html'), 2000);
        return;
      }

      // Check if user data exists in localStorage
      const userData = localStorage.getItem('user');
      console.log('User data in localStorage:', userData);
      
      if (!userData) {
        console.log('Missing user data, trying to fetch from server');
        // Try to get user data from server
        try {
          const userResponse = await apiService.getCurrentUser();
          if (userResponse.success && userResponse.data) {
            localStorage.setItem('user', JSON.stringify(userResponse.data));
            console.log('User data retrieved from server');
          } else {
            console.log('Failed to get user data from server, redirecting to login');
            Utils.showNotification('Session expired. Please login again.', 'error');
            setTimeout(() => Utils.navigateTo('login.html'), 2000);
            return;
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          Utils.showNotification('Session expired. Please login again.', 'error');
          setTimeout(() => Utils.navigateTo('login.html'), 2000);
          return;
        }
      }

      // Setup event handlers
      this.setupEventHandlers();
      
      // Load bookings
      await this.loadBookings();
    } catch (error) {
      console.error('Error during initialization:', error);
      Utils.showNotification('Error initializing page. Please try again.', 'error');
      setTimeout(() => Utils.navigateTo('login.html'), 2000);
    }
  }

  private setupEventHandlers(): void {
    // Make functions globally available
    (window as any).logout = () => this.logout();
    (window as any).clearFilters = () => this.clearFilters();
    (window as any).closeModal = () => this.closeModal();
    (window as any).viewDetails = (bookingId: number) => this.viewDetails(bookingId);
    (window as any).cancelBooking = (bookingId: number) => this.cancelBooking(bookingId);
    (window as any).downloadTicket = (bookingId: number) => this.downloadTicket(bookingId);
  (window as any).openFeedbackModal = (bookingId: number) => this.openFeedbackModal(bookingId);
  (window as any).submitBookingFeedback = (bookingId: number) => this.submitBookingFeedback(bookingId);

    // Tab buttons
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const vehicleType = target.dataset.vehicleType || 'all';
        this.setActiveTab(vehicleType);
      });
    });

    // Filter inputs
    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    const statusFilter = document.getElementById('statusFilter') as HTMLSelectElement;
    const dateFilter = document.getElementById('dateFilter') as HTMLInputElement;

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this.currentFilters.searchQuery = searchInput.value;
        this.applyFilters();
      });
    }

    if (statusFilter) {
      statusFilter.addEventListener('change', () => {
        this.currentFilters.status = statusFilter.value;
        this.applyFilters();
      });
    }

    if (dateFilter) {
      dateFilter.addEventListener('change', () => {
        this.currentFilters.travelDate = dateFilter.value;
        this.applyFilters();
      });
    }
  }

  private async loadBookings(): Promise<void> {
    try {
      console.log('Starting to load bookings...');
      
      // Debug: Check user data
      const userData = localStorage.getItem('user');
      const token = localStorage.getItem('access_token'); // Fixed: use 'access_token' instead of 'token'
      console.log('User data:', userData);
      console.log('Token (first 50 chars):', token ? token.substring(0, 50) + '...' : 'null');
      
      if (userData) {
        try {
          const userObj = JSON.parse(userData);
          console.log('Parsed user object:', userObj);
          console.log('User ID:', userObj.id);
        } catch (e) {
          console.error('Error parsing user data:', e);
        }
      }
      
      const response = await apiService.getUserBookings();
      console.log('API response received:', response);
      
      // Also fetch payments to map discounts and final amounts
      const paymentsResp = await apiService.getPaymentHistory().catch(() => ({ success: false } as any));
      const payments = paymentsResp && paymentsResp.success && Array.isArray(paymentsResp.data) ? paymentsResp.data : [];
      const paymentsByBooking = new Map<number, any>();
      const computeFinal = (p: any): number | undefined => {
        if (!p) return undefined;
        if (typeof p.final_amount === 'number') return p.final_amount;
        if (typeof p.discount_amount === 'number' && typeof p.amount === 'number') return p.amount - p.discount_amount;
        if (typeof p.amount === 'number') return p.amount; // fallback
        return undefined;
      };
      payments.forEach((p: any) => {
        // prefer last successful payment per booking
        const prev = paymentsByBooking.get(p.booking_id);
        const currentStatus = String(p.status).toUpperCase();
        const prevStatus = prev ? String(prev.status).toUpperCase() : '';
        const isSuccessful = currentStatus === 'SUCCESS' || currentStatus === 'COMPLETED';
        const prevSuccessful = prevStatus === 'SUCCESS' || prevStatus === 'COMPLETED';
        const isBetter = !prev || (isSuccessful && !prevSuccessful) || (new Date(p.updated_at || p.created_at || 0).getTime() > new Date(prev.updated_at || prev.created_at || 0).getTime());
        if (isBetter) paymentsByBooking.set(p.booking_id, p);
      });
      
      if (response.success && response.data) {
        console.log('Processing booking data...');
        // Handle paginated response structure
        if (Array.isArray(response.data)) {
          this.allBookings = response.data;
        } else if (response.data.data && Array.isArray(response.data.data)) {
          // If the response has pagination structure
          this.allBookings = response.data.data;
        } else {
          this.allBookings = response.data;
        }
        
        // Merge final amounts into bookings for display convenience
        this.allBookings = this.allBookings.map(b => {
          const pay = paymentsByBooking.get(b.id);
          if (pay) {
            const finalAmt = computeFinal(pay);
            if (typeof finalAmt === 'number') {
              (b as any).final_amount = finalAmt;
              if (typeof pay.amount === 'number') {
                (b as any).discount_amount = Math.max(0, pay.amount - finalAmt);
              }
            }
          }
          return b;
        });
        this.filteredBookings = [...this.allBookings];
        
        this.updateStats();
        this.renderBookings();
        this.showMainContent();
      } else {
        console.error('API response not successful:', response);
        throw new Error(response.message || 'Failed to load bookings');
      }
    } catch (error) {
      console.error('Error loading bookings:', error);
      
      // Check if it's an authentication error
      if (error instanceof Error && (error.message.includes('401') || error.message.includes('authentication'))) {
        Utils.showNotification('Session expired. Please login again.', 'error');
        localStorage.removeItem('access_token'); // Fixed: use 'access_token' instead of 'token'
        localStorage.removeItem('user');
        setTimeout(() => Utils.navigateTo('login.html'), 2000);
        return;
      }
      
      // Check if it's a network error
      if (error instanceof Error && error.message.includes('fetch')) {
        Utils.showNotification('Network error. Please check your connection.', 'error');
      } else {
        Utils.showNotification('Error loading bookings. Please try again.', 'error');
      }
      
      this.showEmptyState();
    }
  }

  private updateStats(): void {
    const total = this.allBookings.length;
    const confirmed = this.allBookings.filter(b => String(b.status).toUpperCase() === 'CONFIRMED').length;
    const pending = this.allBookings.filter(b => {
      const s = String(b.status).toUpperCase();
      return s === 'PENDING' || s === 'CART';
    }).length;
    const totalSpent = this.allBookings
      .filter(b => String(b.status).toUpperCase() === 'CONFIRMED')
      .reduce((sum, booking) => {
        const fa = (booking as any).final_amount as number | undefined;
        return sum + (typeof fa === 'number' ? fa : booking.total_price);
      }, 0);

    this.updateElement('totalBookings', total.toString());
    this.updateElement('confirmedBookings', confirmed.toString());
    this.updateElement('pendingBookings', pending.toString());
    this.updateElement('totalSpent', `৳${totalSpent.toLocaleString()}`);
  }

  private setActiveTab(vehicleType: string): void {
    // Update active tab
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
      button.classList.remove('active');
      const target = button as HTMLElement;
      if (target.dataset.vehicleType === vehicleType) {
        button.classList.add('active');
      }
    });

    // Update filters
    this.currentFilters.vehicleType = vehicleType;
    this.applyFilters();
  }

  private applyFilters(): void {
    let filtered = [...this.allBookings];

    // Vehicle type filter
    if (this.currentFilters.vehicleType !== 'all') {
      filtered = filtered.filter(booking => 
        booking.vehicle?.vehicle_type?.toLowerCase() === this.currentFilters.vehicleType.toLowerCase()
      );
    }

    // Status filter
    if (this.currentFilters.status) {
      filtered = filtered.filter(booking => 
        booking.status === this.currentFilters.status
      );
    }

    // Search filter
    if (this.currentFilters.searchQuery) {
      const query = this.currentFilters.searchQuery.toLowerCase();
      filtered = filtered.filter(booking =>
        booking.pnr?.toLowerCase().includes(query) ||
        booking.id.toString().includes(query) ||
        booking.route?.source?.toLowerCase().includes(query) ||
        booking.route?.destination?.toLowerCase().includes(query) ||
        booking.vehicle?.vehicle_name?.toLowerCase().includes(query)
      );
    }

    // Date filter
    if (this.currentFilters.travelDate) {
      filtered = filtered.filter(booking => {
        const bookingDate = new Date(booking.travel_date).toISOString().split('T')[0];
        return bookingDate === this.currentFilters.travelDate;
      });
    }

    this.filteredBookings = filtered;
    this.renderBookings();
  }

  private renderBookings(): void {
    const container = document.getElementById('bookingsContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (!container) return;

    if (this.filteredBookings.length === 0) {
      container.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    container.innerHTML = this.filteredBookings.map(booking => this.createBookingCard(booking)).join('');
  }

  private createBookingCard(booking: BookingData): string {
  const vehicleIcon = this.getVehicleIcon(booking.vehicle?.vehicle_type);
  // prefer final_amount if attached from payments
  const finalAmount = (booking as any).final_amount as number | undefined;

    return `
      <div class="booking-card">
        <!-- Header -->
        <div class="flex justify-between items-start mb-4">
          <div class="flex items-center gap-3">
            <div class="meta-icon">
              <i class="fas ${vehicleIcon}"></i>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-800">
                ${booking.vehicle?.vehicle_name || 'Vehicle'} 
                ${booking.vehicle?.vehicle_number ? `(${booking.vehicle.vehicle_number})` : ''}
              </h3>
              <p class="text-gray-600 text-sm">${booking.vehicle?.operator_name || 'Operator'}</p>
            </div>
          </div>
          <div class="text-right">
            <div class="status-badge status-${booking.status.toLowerCase()}">${booking.status}</div>
            <p class="text-gray-600 text-sm mt-1">PNR: ${booking.pnr || `TK${booking.id.toString().padStart(6, '0')}`}</p>
          </div>
        </div>

        <!-- Route -->
        ${booking.route ? `
          <div class="route-display">
            <div class="route-location">${booking.route.source}</div>
            <div class="route-arrow">
              <i class="fas fa-arrow-right"></i>
            </div>
            <div class="route-location">${booking.route.destination}</div>
          </div>
        ` : ''}

        <!-- Footer -->
        <div class="flex justify-between items-center pt-4 border-t border-gray-200">
          <div>
            <p class="text-gray-600 text-sm">${finalAmount && finalAmount < booking.total_price ? 'Final Amount' : 'Total Amount'}</p>
            <div class="price-display">৳${(finalAmount ?? booking.total_price).toLocaleString()}</div>
            ${finalAmount && finalAmount < booking.total_price ? `<p class="text-green-600 text-xs">Saved ৳${(booking.total_price - finalAmount).toLocaleString()}</p>` : ''}
          </div>
          
          <div class="flex gap-3">
            <button onclick="viewDetails(${booking.id})" class="action-button">
              <i class="fas fa-eye"></i>
              Details
            </button>
            ${(booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') ? `
            <button onclick="openFeedbackModal(${booking.id})" class="action-button">
              <i class="fas fa-star"></i>
              Give Feedback
            </button>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  private getVehicleIcon(vehicleType?: string): string {
    switch (vehicleType?.toLowerCase()) {
      case 'bus': return 'fa-bus';
      case 'train': return 'fa-train';
      case 'plane': case 'airplane': return 'fa-plane';
      default: return 'fa-bus';
    }
  }

  // removed unused getStatusClass

  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return dateString;
    }
  }

  private capitalizeFirst(str: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  private formatTime(timeString: string): string {
    if (!timeString) return 'TBD';
    
    try {
      // Handle different time formats
      if (timeString.includes(':')) {
        // Split the time string
        const timeParts = timeString.split(':');
        if (timeParts.length >= 2) {
          const hours = parseInt(timeParts[0]);
          const minutes = timeParts[1].split(' ')[0]; // Remove AM/PM if present
          
          // Convert to 12-hour format with AM/PM
          const period = hours >= 12 ? 'PM' : 'AM';
          const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
          return `${displayHour}:${minutes.padStart(2, '0')} ${period}`;
        }
      }
      
      // If already formatted with AM/PM, return as is
      if (timeString.includes('AM') || timeString.includes('PM')) {
        return timeString;
      }
      
      return timeString;
    } catch (error) {
      console.error('Error formatting time:', error);
      return timeString;
    }
  }

  private formatTravelDate(dateString: string): string {
    try {
      let date: Date;
      
      // Handle different date formats
      if (dateString.includes('T') || dateString.includes(' ')) {
        date = new Date(dateString);
      } else if (dateString.includes('-')) {
        const [year, month, day] = dateString.split('-');
        date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      } else {
        date = new Date(dateString);
      }

      if (isNaN(date.getTime())) {
        return dateString;
      }

      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return dateString;
    }
  }

  private getPassengerName(booking: BookingData, user: any): string {
    // If there are passenger details, use the first passenger's name
    if (booking.passenger_details && booking.passenger_details.length > 0) {
      const firstPassenger = booking.passenger_details[0];
      return firstPassenger.name || firstPassenger.full_name || firstPassenger.passenger_name || 'Passenger';
    }
    // Fallback to user info
    return user?.name || user?.full_name || 'Passenger';
  }

  private getPassengerPhone(booking: BookingData, user: any): string {
    // If there are passenger details, use the first passenger's phone
    if (booking.passenger_details && booking.passenger_details.length > 0) {
      const firstPassenger = booking.passenger_details[0];
      return firstPassenger.phone || firstPassenger.mobile || firstPassenger.contact || 'N/A';
    }
    // Fallback to user info
    return user?.phone || user?.mobile || 'N/A';
  }

  private updateElement(id: string, text: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = text;
    }
  }

  private showMainContent(): void {
    const loadingState = document.getElementById('loadingState');
    const mainContent = document.getElementById('mainContent');
    
    if (loadingState) loadingState.style.display = 'none';
    if (mainContent) mainContent.classList.remove('hidden');
  }

  private showEmptyState(): void {
    const loadingState = document.getElementById('loadingState');
    const mainContent = document.getElementById('mainContent');
    const emptyState = document.getElementById('emptyState');
    
    if (loadingState) loadingState.style.display = 'none';
    if (mainContent) mainContent.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
  }

  private clearFilters(): void {
    this.currentFilters = {
      vehicleType: 'all',
      status: '',
      searchQuery: '',
      travelDate: ''
    };

    // Reset form inputs
    const searchInput = document.getElementById('searchInput') as HTMLInputElement;
    const statusFilter = document.getElementById('statusFilter') as HTMLSelectElement;
    const dateFilter = document.getElementById('dateFilter') as HTMLInputElement;

    if (searchInput) searchInput.value = '';
    if (statusFilter) statusFilter.value = '';
    if (dateFilter) dateFilter.value = '';

    // Reset active tab
    this.setActiveTab('all');
  }

  private viewDetails(bookingId: number): void {
    const booking = this.allBookings.find(b => b.id === bookingId);
    if (!booking) {
      Utils.showNotification('Booking not found', 'error');
      return;
    }

    const modal = document.getElementById('bookingModal');
    const modalContent = document.getElementById('modalContent');
    
    if (!modal || !modalContent) return;

    modalContent.innerHTML = this.createDetailedBookingView(booking);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  private createDetailedBookingView(booking: BookingData): string {
  const finalAmount = (booking as any).final_amount as number | undefined;
  const paid = typeof finalAmount === 'number' && finalAmount < booking.total_price;
  const discount = paid ? (booking.total_price - (finalAmount as number)) : 0;
    return `
      <div class="space-y-6">
        <!-- Booking Header -->
        <div class="text-center">
          <h3 class="text-2xl font-bold text-gray-800 mb-2">
            ${booking.vehicle?.vehicle_name || 'Vehicle'} 
            ${booking.vehicle?.vehicle_number ? `(${booking.vehicle.vehicle_number})` : ''}
          </h3>
          <div class="status-badge status-${booking.status.toLowerCase()}">${booking.status}</div>
        </div>

        <!-- Route Information -->
        ${booking.route ? `
          <div class="glass-card p-6">
            <h4 class="text-lg font-semibold text-gray-800 mb-4">
              <i class="fas fa-route mr-2"></i>Route Information
            </h4>
            <div class="route-display">
              <div class="route-location">${booking.route.source}</div>
              <div class="route-arrow">
                <i class="fas fa-arrow-right"></i>
              </div>
              <div class="route-location">${booking.route.destination}</div>
            </div>
            ${booking.route.departure_time || booking.route.arrival_time ? `
              <div class="flex justify-between mt-4 text-gray-600">
                ${booking.route.departure_time ? `<p>Departure: ${booking.route.departure_time}</p>` : ''}
                ${booking.route.arrival_time ? `<p>Arrival: ${booking.route.arrival_time}</p>` : ''}
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Booking Details -->
        <div class="glass-card p-6">
          <h4 class="text-lg font-semibold text-gray-800 mb-4">
            <i class="fas fa-info-circle mr-2"></i>Booking Details
          </h4>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p class="text-gray-600">PNR Number</p>
              <p class="text-gray-800 font-medium">${booking.pnr || `TK${booking.id.toString().padStart(6, '0')}`}</p>
            </div>
            <div>
              <p class="text-gray-600">Booking ID</p>
              <p class="text-gray-800 font-medium">${booking.id}</p>
            </div>
            <div>
              <p class="text-gray-600">Travel Date</p>
              <p class="text-gray-800 font-medium">${this.formatDate(booking.travel_date)}</p>
            </div>
            <div>
              <p class="text-gray-600">Booking Date</p>
              <p class="text-gray-800 font-medium">${this.formatDate(booking.booking_date)}</p>
            </div>
            <div>
              <p class="text-gray-600">Seats</p>
              <p class="text-gray-800 font-medium">${booking.seats.join(', ')}</p>
            </div>
            <div>
              <p class="text-gray-600">Class</p>
              <p class="text-gray-800 font-medium">${this.capitalizeFirst(booking.seat_class)}</p>
            </div>
          </div>
        </div>

        <!-- Passenger Details -->
        ${booking.passenger_details && booking.passenger_details.length > 0 ? `
          <div class="glass-card p-6">
            <h4 class="text-lg font-semibold text-gray-800 mb-4">
              <i class="fas fa-users mr-2"></i>Passenger Details
            </h4>
            <div class="space-y-3">
              ${booking.passenger_details.map(passenger => `
                <div class="flex justify-between items-center p-3 bg-gray-100 rounded-lg">
                  <div>
                    <p class="text-gray-800 font-medium">${passenger.name}</p>
                    <p class="text-gray-600 text-sm">${passenger.gender}, ${passenger.age} years old</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Payment Information -->
        <div class="glass-card p-6">
          <h4 class="text-lg font-semibold text-gray-800 mb-4">
            <i class="fas fa-credit-card mr-2"></i>Payment Information
          </h4>
          <div class="space-y-1">
            <div class="flex justify-between items-center">
              <span class="text-gray-600">${paid ? 'Original Amount:' : 'Total Amount:'}</span>
              <span class="price-display ${paid ? 'line-through opacity-70' : ''}">৳${booking.total_price.toLocaleString()}</span>
            </div>
            ${paid ? `
            <div class="flex justify-between items-center">
              <span class="text-gray-600">Final Amount:</span>
              <span class="price-display">৳${(finalAmount as number).toLocaleString()}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-green-600">Discount Applied:</span>
              <span class="text-green-600">- ৳${discount.toLocaleString()}</span>
            </div>
            ` : ''}
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-3 justify-center">
          ${booking.status === 'CONFIRMED' ? `
            <button onclick="downloadTicket(${booking.id})" class="action-button">
              <i class="fas fa-download mr-2"></i>Download Ticket
            </button>
          ` : ''}
          ${booking.status === 'PENDING' || booking.status === 'CART' ? `
            <button onclick="cancelBooking(${booking.id})" class="action-button danger">
              <i class="fas fa-times mr-2"></i>Cancel Booking
            </button>
          ` : ''}
          ${(booking.status === 'CONFIRMED' || booking.status === 'COMPLETED') ? `
            <button onclick="openFeedbackModal(${booking.id})" class="action-button">
              <i class="fas fa-star mr-2"></i>Give Feedback
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  private closeModal(): void {
    const modal = document.getElementById('bookingModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  private openFeedbackModal(bookingId: number): void {
    const booking = this.allBookings.find(b => b.id === bookingId);
    if (!booking) return;
    const modal = document.getElementById('bookingModal');
    const modalContent = document.getElementById('modalContent');
    if (!modal || !modalContent) return;

    modalContent.innerHTML = `
      <div class="space-y-6">
        <div class="text-center">
          <h3 class="text-2xl font-bold text-gray-800 mb-2">Rate your trip</h3>
          <p class="text-gray-600">${booking.route ? `${booking.route.source} → ${booking.route.destination}` : ''}</p>
        </div>
        <div class="glass-card p-6 space-y-4">
          <div class="text-center">
            <div class="flex justify-center gap-2 mb-2" id="feedbackStars">
              ${[1,2,3,4,5].map(i => `<button type="button" data-star="${i}" class="text-2xl text-gray-400 hover:text-yellow-400">★</button>`).join('')}
            </div>
            <input type="hidden" id="feedbackRating" value="0" />
          </div>
          <div>
            <label class="block text-gray-700 mb-2">Comments</label>
            <textarea id="feedbackComment" rows="4" class="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-800" placeholder="Share details about comfort, punctuality, staff behavior, etc."></textarea>
          </div>
          <div class="flex items-center gap-2">
            <input type="checkbox" id="feedbackAnonymous" class="scale-110" />
            <label for="feedbackAnonymous" class="text-gray-700">Submit anonymously</label>
          </div>
        </div>
        <div class="flex gap-3 justify-end">
          <button onclick="closeModal()" class="action-button danger"><i class="fas fa-times mr-2"></i>Cancel</button>
          <button onclick="submitBookingFeedback(${booking.id})" class="action-button"><i class="fas fa-paper-plane mr-2"></i>Submit</button>
        </div>
      </div>
    `;

    // wire stars
    const stars = modalContent.querySelectorAll('#feedbackStars [data-star]');
    const ratingInput = modalContent.querySelector('#feedbackRating') as HTMLInputElement;
    stars.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseInt((btn as HTMLElement).getAttribute('data-star') || '0');
        ratingInput.value = String(val);
        stars.forEach(s => {
          const v = parseInt((s as HTMLElement).getAttribute('data-star') || '0');
          if (v <= val) { s.classList.remove('text-gray-400'); s.classList.add('text-yellow-400'); }
          else { s.classList.add('text-gray-400'); s.classList.remove('text-yellow-400'); }
        });
      });
    });

    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  private async submitBookingFeedback(bookingId: number): Promise<void> {
    const modal = document.getElementById('bookingModal');
    const ratingEl = modal?.querySelector('#feedbackRating') as HTMLInputElement;
    const commentEl = modal?.querySelector('#feedbackComment') as HTMLTextAreaElement;
    const anonEl = modal?.querySelector('#feedbackAnonymous') as HTMLInputElement;
    const booking = this.allBookings.find(b => b.id === bookingId);
    if (!booking || !ratingEl || !commentEl) return;

    const rating = parseInt(ratingEl.value || '0');
    const comment = (commentEl.value || '').trim();
    if (rating < 1 || rating > 5) {
      Utils.showNotification('Please select a rating between 1 and 5', 'error');
      return;
    }
    if (comment.length < 5) {
      Utils.showNotification('Please add a brief comment (min 5 chars)', 'error');
      return;
    }

    try {
      const resp = await apiService.submitBookingFeedback({
        booking_id: booking.id,
        transport_id: (booking as any).transport_id || undefined,
        rating,
        comment,
        is_anonymous: !!anonEl?.checked
      });
      if (resp.success) {
        Utils.showNotification('Thanks for your feedback!', 'success');
        this.closeModal();
      } else {
        throw new Error(resp.error || 'Failed');
      }
    } catch (e) {
      console.error(e);
      Utils.showNotification('Could not submit feedback', 'error');
    }
  }

  private async cancelBooking(bookingId: number): Promise<void> {
    const confirmed = confirm('Are you sure you want to cancel this booking?');
    
    if (!confirmed) return;

    try {
      Utils.showNotification('Cancelling booking...', 'info');
      
      const response = await apiService.cancelBooking(bookingId, 'Cancelled by user');
      
      if (response.success) {
        Utils.showNotification('Booking cancelled successfully', 'success');
        this.closeModal();
        await this.loadBookings(); // Reload bookings
      } else {
        throw new Error(response.message || 'Failed to cancel booking');
      }
    } catch (error) {
      console.error('Cancel booking error:', error);
      Utils.showNotification(error instanceof Error ? error.message : 'Failed to cancel booking', 'error');
    }
  }

  private async downloadTicket(bookingId: number): Promise<void> {
    try {
      Utils.showNotification('Preparing ticket PDF...', 'info');
      
      // Get booking details
      const response = await apiService.getBookingDetails(bookingId);
      if (!response.success || !response.data) {
        throw new Error('Failed to get booking details');
      }

      // Get user details
      const userResponse = await apiService.getCurrentUser();
      const user = userResponse.data;

      // Generate HTML content for ticket
      const booking = response.data;
      const ticketHtml = this.generateTicketHTML(booking as any, user);
      
      // Prepare filename base
      const pnr = booking.pnr || `TK${booking.id.toString().padStart(6, '0')}`;
      const travelDate = booking.travel_date ? 
        new Date(booking.travel_date).toISOString().split('T')[0] : 
        new Date().toISOString().split('T')[0];
      const timestamp = new Date().toISOString().replace(/[:]/g, '-').split('.')[0];
      const status = booking.status ? booking.status.toUpperCase() : 'BOOKED';
      const filename = `TicketKini-${status}-${pnr}-${travelDate}-${timestamp}.pdf`;

      // Try to render to PDF via browser print-to-PDF using a hidden iframe as a lightweight approach
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document as Document;
      doc.open();
      // Inject a print stylesheet hint for A4
      const printable = ticketHtml.replace('</head>', '<style>@page{size:A4;margin:1cm}</style></head>');
  doc.write(printable);
  // Set the document title so Save as PDF suggests a meaningful filename
  try { doc.title = filename; } catch {}
      doc.close();

      // Give the iframe a moment to render, then trigger print dialog (user can choose Save as PDF)
      await new Promise(resolve => setTimeout(resolve, 300));
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();

      // Clean up after a short delay
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1500);

      Utils.showNotification('Print dialog opened. Choose "Save as PDF" to download.', 'success');
    } catch (error) {
      console.error('Download ticket error:', error);
      Utils.showNotification('Failed to prepare ticket PDF', 'error');
    }
  }

  private generateTicketHTML(booking: BookingData, user: any): string {
    // Get fallback data for better ticket generation
    const storedSchedule = Utils.getLocalStorage('selectedSchedule') as any;
    
    // Determine the best source for each piece of data
    const sourceLocation = booking.route?.source || 
                          storedSchedule?.source_name || 
                          'Mohakhali Bus Terminal';
    
    const destinationLocation = booking.route?.destination || 
                               storedSchedule?.destination_name || 
                               'Chittagong Central Bus Terminal';
    
    const departureTime = this.formatTime(booking.route?.departure_time || 
                                        storedSchedule?.departure_time || 
                                        '05:30:00');
    
    const arrivalTime = this.formatTime(booking.route?.arrival_time || 
                                      storedSchedule?.arrival_time || 
                                      '12:00:00');
    
    const operatorName = booking.vehicle?.operator_name || 
                        storedSchedule?.operator_name || 
                        'TicketKini Express';
    
    const serviceName = booking.vehicle?.vehicle_name || 
                       storedSchedule?.service_name ||
                       booking.seat_class === 'executive' ? 'Premium Service' : 'Standard Service';
    
    const vehicleNumber = booking.vehicle?.vehicle_number || 
                         storedSchedule?.vehicle_number || 
                         'BUS-001';
    
    // Handle travel date
    let travelDate = booking.travel_date;
    if (!travelDate) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      travelDate = tomorrow.toISOString().split('T')[0];
    }
    
    // Handle seats - ensure it's an array
    let seatNumbers = '';
    if (Array.isArray(booking.seats) && booking.seats.length > 0) {
      seatNumbers = booking.seats.join(', ');
    } else {
      seatNumbers = '12'; // Fallback
    }
    
    // Handle seat class
    const seatClass = this.capitalizeFirst(booking.seat_class || 'Executive');

    return `
<!DOCTYPE html>
<html>
<head>
    <title>TicketKini - Travel Ticket</title>
    <meta charset="UTF-8">
    <style>
        @page { size: A4; margin: 1cm; background: white; }
        * { 
            box-sizing: border-box; 
            background: inherit;
        }
        html { 
            background: white !important; 
            background-color: white !important;
        }
        body { 
            font-family: Arial, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background: white !important; 
            background-color: white !important;
            color: #000000;
        }
        .ticket { 
            border: 3px solid #1e40af; 
            border-radius: 12px; 
            padding: 30px; 
            max-width: 800px; 
            margin: 0 auto; 
            background: white !important;
            background-color: white !important;
        }
        .header { 
            text-align: center; 
            border-bottom: 2px solid #1e40af; 
            padding-bottom: 20px; 
            margin-bottom: 30px;
            background: white;
        }
        .header h1 { color: #1e40af; font-size: 2.5em; margin: 0; }
        .route { background: linear-gradient(135deg, #1f2937, #374151); color: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
        .route-info { display: flex; justify-content: space-between; align-items: center; }
        .location { font-size: 1.5em; font-weight: bold; }
        .arrow { font-size: 2em; }
        .time-info { margin-top: 15px; display: flex; justify-content: space-between; font-size: 1.2em; }
        .details { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
        .section { border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; background: #ffffff; }
        .section h3 { color: #1e40af; margin-top: 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px; }
        .info-row { display: flex; justify-content: space-between; padding: 8px 0; }
        .label { font-weight: bold; color: #6b7280; }
        .value { color: #111827; }
        .pnr { background: #fbbf24; color: #92400e; padding: 10px 20px; border-radius: 25px; display: inline-block; font-weight: bold; font-size: 1.2em; }
        .important { background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; }
        @media print { body { margin: 0; padding: 10px; } .ticket { border: 2px solid #000; } }
    </style>
</head>
<body>
    <div class="ticket">
        <div class="header">
            <h1>🎫 TicketKini</h1>
            <h2>Official Travel Ticket</h2>
            <div class="pnr">PNR: ${booking.pnr || `TK${booking.id.toString().padStart(6, '0')}`}</div>
        </div>

        <div class="route">
            <div class="route-info">
                <div class="location">${sourceLocation}</div>
                <div class="arrow">🚌</div>
                <div class="location">${destinationLocation}</div>
            </div>
            <div class="time-info">
                <div>Departure: ${departureTime}</div>
                <div>Arrival: ${arrivalTime}</div>
            </div>
            <div style="margin-top: 15px; font-size: 1.1em;">
                ${operatorName} - ${serviceName}
            </div>
            <div style="margin-top: 5px; font-size: 0.9em; opacity: 0.9;">
                Vehicle: ${vehicleNumber}
            </div>
        </div>

        <div class="details">
            <div class="section">
                <h3>👤 Passenger Information</h3>
                <div class="info-row">
                    <span class="label">Name:</span>
                    <span class="value">${this.getPassengerName(booking, user)}</span>
                </div>
                <div class="info-row">
                    <span class="label">Phone:</span>
                    <span class="value">${this.getPassengerPhone(booking, user)}</span>
                </div>
                <div class="info-row">
                    <span class="label">Email:</span>
                    <span class="value">${user?.email || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="label">Passengers:</span>
                    <span class="value">${booking.passenger_details?.length || 1} Passenger${(booking.passenger_details?.length || 1) > 1 ? 's' : ''}</span>
                </div>
            </div>

            <div class="section">
                <h3>📋 Travel Details</h3>
                <div class="info-row">
                    <span class="label">Travel Date:</span>
                    <span class="value">${this.formatTravelDate(travelDate)}</span>
                </div>
                <div class="info-row">
                    <span class="label">Departure Time:</span>
                    <span class="value">${departureTime}</span>
                </div>
                <div class="info-row">
                    <span class="label">Arrival Time:</span>
                    <span class="value">${arrivalTime}</span>
                </div>
                <div class="info-row">
                    <span class="label">Seat Numbers:</span>
                    <span class="value">${seatNumbers}</span>
                </div>
                <div class="info-row">
                    <span class="label">Class:</span>
                    <span class="value">${seatClass}</span>
                </div>
            </div>
        </div>

        <div class="important">
            <h3 style="margin-top: 0; color: #dc2626;">⚠️ Important Instructions</h3>
            <ul>
                <li>Arrive 30 minutes before departure</li>
                <li>Carry valid ID proof for verification</li>
                <li>Present this ticket during travel</li>
                <li>Contact support: +880-1234-567890</li>
            </ul>
        </div>

        <div class="footer">
            <p><strong>Thank you for choosing TicketKini!</strong></p>
            <p>📧 support@ticketkini.com | 📞 +880-1234-567890</p>
            <p>Generated: ${new Date().toLocaleString()}</p>
        </div>
    </div>
</body>
</html>`;
  }

  private async logout(): Promise<void> {
    try {
      Utils.showNotification('Logging out...', 'info');
      await apiService.logout();
      Utils.showNotification('Logged out successfully! 👋', 'success');
      setTimeout(() => Utils.navigateTo('../index.html'), 1500);
    } catch (error) {
      console.error('Logout error:', error);
      Utils.showNotification('Error logging out', 'error');
    }
  }
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    new EnhancedMyBookingsPage();
});
