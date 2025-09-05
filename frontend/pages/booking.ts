// Enhanced Booking page functionality with glass morphism design
import { apiService, TripResult, BookingRequest } from '../services/api.ts';
import Utils from '../services/utils.ts';

class EnhancedBookingPage {
  private vehicleId: string;
  private scheduleId: string;
  private travelDate: string;
  private tripData: TripResult | null = null;
  private seatMapData: any = null;
  private selectedClass: string = '';
  private selectedSeats: number[] = [];
  private totalPrice: number = 0;
  private seatPrice: number = 100; // Reasonable default, will be updated from API
  private appliedCoupon: any = null;
  private refreshInterval: number | null = null;
  private lastRefreshTime: number = 0;

  constructor() {
    this.vehicleId = Utils.getQueryParam('vehicle_id') || '';
    this.scheduleId = Utils.getQueryParam('schedule_id') || '';
    this.travelDate = Utils.getQueryParam('date') || '';
    
    if (this.travelDate) {
      const travelDate = new Date(this.travelDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (travelDate < today) {
        this.travelDate = Utils.getTodayDate();
      }
    } else {
      this.travelDate = Utils.getTodayDate();
    }
    
    this.init();
  }

  private async init() {
    if (!this.vehicleId || !this.travelDate) {
      Utils.showNotification('Invalid vehicle or date.', 'error');
      setTimeout(() => Utils.navigateTo('search.html'), 2000);
      return;
    }
    
    await this.fetchTripAndSeatMap();
    this.attachEventListeners();
    this.startAutoRefresh();
    this.setupDataChangeListener();
  }

  private setupDataChangeListener() {
    // Listen for data changes from admin panel
    window.addEventListener('dataChange', (event: Event) => {
      const customEvent = event as CustomEvent;
      const { type, data } = customEvent.detail;
      console.log('Received data change notification:', type, data);
      
      if (type === 'vehicle_added' || type === 'schedule_added') {
        // Refresh seat availability when new vehicles or schedules are added
        console.log('New vehicle/schedule added, refreshing seat availability...');
        this.silentRefreshSeatAvailability();
      }
    });
    
    // Check for recent data changes on page load
    const changes = JSON.parse(localStorage.getItem('dataChanges') || '[]');
    const recentChanges = changes.filter((change: any) => 
      Date.now() - change.timestamp < 60000 // Changes in last minute
    );
    
    if (recentChanges.length > 0) {
      console.log('Found recent data changes, refreshing seat availability...');
      this.silentRefreshSeatAvailability();
    }
  }

  private startAutoRefresh() {
    // Refresh seat availability every 30 seconds to catch any changes
    this.refreshInterval = window.setInterval(() => {
      const now = Date.now();
      // Only refresh if it's been at least 30 seconds since last refresh
      if (now - this.lastRefreshTime >= 30000) {
        this.silentRefreshSeatAvailability();
      }
    }, 30000); // Check every 30 seconds
  }

  private async silentRefreshSeatAvailability() {
    try {
      console.log('Performing silent seat availability refresh...');
      const previousBookedSeats = this.getCurrentBookedSeats();
      
      // Fetch fresh data
      const seatMapResp = await apiService.getSeatMap(Number(this.vehicleId), this.travelDate, this.scheduleId ? Number(this.scheduleId) : undefined);
      
      if (seatMapResp.success && seatMapResp.data) {
        const newBookedSeats = this.extractBookedSeats(seatMapResp.data);
        
        // Check if there are any changes
        if (JSON.stringify(previousBookedSeats) !== JSON.stringify(newBookedSeats)) {
          console.log('Seat availability changed, updating display...');
          this.seatMapData = seatMapResp.data;
          this.generateSeatMapFromData();
          this.updatePriceSummary();
          this.lastRefreshTime = Date.now();
          
          // Show notification if seats became available
          const newlyAvailable = previousBookedSeats.filter(seat => !newBookedSeats.includes(seat));
          if (newlyAvailable.length > 0) {
            Utils.showNotification(`Seats ${newlyAvailable.join(', ')} are now available!`, 'success');
          }
        }
      }
    } catch (error) {
      console.error('Error during silent refresh:', error);
    }
  }

  private getCurrentBookedSeats(): number[] {
    if (!this.seatMapData?.seat_map?.classes?.[this.selectedClass]) {
      return [];
    }
    return this.seatMapData.seat_map.classes[this.selectedClass].booked_seat_numbers || [];
  }

  private extractBookedSeats(data: any): number[] {
    if (!data?.seat_map?.classes?.[this.selectedClass]) {
      return [];
    }
    return data.seat_map.classes[this.selectedClass].booked_seat_numbers || [];
  }

  private async fetchTripAndSeatMap() {
    try {
      // Add cache-busting parameter to force fresh data
      const cacheBuster = new Date().getTime();
      console.log('Fetching seat map with cache buster:', cacheBuster);
      console.log('Parameters:', {
        vehicleId: this.vehicleId,
        travelDate: this.travelDate,
        scheduleId: this.scheduleId
      });
      
      // Fetch seat map data from the API with cache busting
      const seatMapResp = await apiService.getSeatMap(Number(this.vehicleId), this.travelDate, this.scheduleId ? Number(this.scheduleId) : undefined);
      
      console.log('Seat map API response:', seatMapResp);
      
      if (seatMapResp.success && seatMapResp.data) {
        this.seatMapData = seatMapResp.data;
        // Prefer ECONOMY if present; otherwise fall back to the first available class key
        const classKeys: string[] = Object.keys(
          (this.seatMapData?.seat_map?.classes) || (this.seatMapData?.class_info) || {}
        );
        const preferred = classKeys.find(k => k.toUpperCase() === 'ECONOMY') || classKeys[0] || 'ECONOMY';
        this.selectedClass = preferred;
        
        // Debug logging for seat availability
        console.log('Seat map data received:', {
          classInfo: this.seatMapData.class_info,
          seatAvailability: this.seatMapData.seat_availability,
          bookedSeats: this.seatMapData.seat_map?.classes?.[this.selectedClass]?.booked_seat_numbers || [],
          availableSeats: this.seatMapData.seat_map?.classes?.[this.selectedClass]?.available_seat_numbers || [],
          travelDate: this.travelDate,
          currentDate: new Date().toISOString().split('T')[0]
        });
        
        // Create trip data from seat map response
        this.tripData = {
          id: Number(this.scheduleId) || 0,
          vehicle_id: Number(this.vehicleId),
          vehicle_name: this.seatMapData.vehicle_number || this.seatMapData.vehicle_name || '',
          vehicle_number: this.seatMapData.vehicle_number || '',
          vehicle_type: this.seatMapData.vehicle_type || '',
          operator_name: this.seatMapData.operator_name || 'Unknown Operator',
          source_name: this.seatMapData.source_name || 'Source',
          destination_name: this.seatMapData.destination_name || 'Destination',
          departure_time: this.seatMapData.departure_time || '00:00:00',
          arrival_time: this.seatMapData.arrival_time || '00:00:00',
          duration: this.seatMapData.duration || '0h 0m',
          class_prices: this.seatMapData.class_info || {},
          available_seats: this.seatMapData.available_seats || 0,
          total_seats: this.seatMapData.total_seats || 0,
          amenities: this.seatMapData.facilities || [],
          rating: 0,
          total_reviews: 0
        } as TripResult;
        
        // Set seat price from schedule/class info with better fallback strategy
        let priceFound = false;
        
        // First try: Get price from selected class
        if (this.seatMapData.class_info && this.selectedClass && this.seatMapData.class_info[this.selectedClass]) {
          const classInfo: any = this.seatMapData.class_info[this.selectedClass];
          const priceNum = Number(classInfo?.price);
          if (!Number.isNaN(priceNum) && priceNum > 0) {
            this.seatPrice = priceNum;
            priceFound = true;
            console.log(`Price set from selected class ${this.selectedClass}: ${this.seatPrice}`);
          }
        }
        
        // Second try: Get price from any available class
        if (!priceFound && this.seatMapData.class_info) {
          for (const [className, classInfo] of Object.entries(this.seatMapData.class_info)) {
            const info: any = classInfo as any;
            const priceNum = Number(info?.price);
            if (!Number.isNaN(priceNum) && priceNum > 0) {
              this.seatPrice = priceNum;
              priceFound = true;
              console.log(`Price set from available class ${className}: ${this.seatPrice}`);
              break;
            }
          }
        }
        
        // Third try: Get price from vehicle's class_prices if available
        if (!priceFound && this.seatMapData.class_prices) {
          const classPrices: any = this.seatMapData.class_prices;
          for (const [className, price] of Object.entries(classPrices)) {
            const priceNum = Number(price as any);
            if (!Number.isNaN(priceNum) && priceNum > 0) {
              this.seatPrice = priceNum;
              priceFound = true;
              console.log(`Price set from vehicle class_prices ${className}: ${this.seatPrice}`);
              break;
            }
          }
        }
        
        // Final fallback: Use a reasonable default but log warning
        if (!priceFound) {
          this.seatPrice = 100; // Changed from 500 to a more reasonable default
          console.warn('No price information found in API response, using default price:', this.seatPrice);
          console.warn('API response class_info:', this.seatMapData.class_info);
          console.warn('API response class_prices:', this.seatMapData.class_prices);
        }
        
        // Store vehicle seat map for layout rendering
        if (this.seatMapData.vehicle_seat_map) {
          console.log('Vehicle seat map loaded:', this.seatMapData.vehicle_seat_map);
        } else {
          console.warn('No vehicle seat map found in API response');
        }
        
      } else {
        throw new Error('Failed to load seat map');
      }
      
      this.loadTripInformation();
      this.generateSeatMapFromData();
      this.updatePriceSummary();
    } catch (error) {
      console.error('Error fetching trip and seat map:', error);
      Utils.showNotification('Failed to load booking data', 'error');
      setTimeout(() => Utils.navigateTo('search.html'), 2000);
    }
  }

  private loadTripInformation() {
    if (!this.tripData) return;

    // Update trip information in UI with null checks
    const routeInfo = document.getElementById('routeInfo');
    if (routeInfo) routeInfo.textContent = `${this.tripData.source_name} → ${this.tripData.destination_name}`;
    
    const operatorInfo = document.getElementById('operatorInfo');
    if (operatorInfo) operatorInfo.textContent = `${this.tripData.operator_name} - ${this.selectedClass}`;
    
    const vehicleInfo = document.getElementById('vehicleInfo');
    if (vehicleInfo) vehicleInfo.textContent = `${this.tripData.vehicle_name} - ${this.tripData.total_seats} Seats`;
    
    const departureTime = document.getElementById('departureTime');
    if (departureTime) departureTime.textContent = Utils.formatTime(this.tripData.departure_time);
    
    const travelDate = document.getElementById('travelDate');
    if (travelDate) travelDate.textContent = Utils.formatDate(this.travelDate);
    
    const duration = document.getElementById('duration');
    if (duration) duration.textContent = `Duration: ${this.tripData.duration}`;
  }

  private generateSeatMapFromData() {
    const seatMapContainer = document.getElementById('seatMap');
    if (!seatMapContainer || !this.seatMapData) return;

    console.log('Generating seat map with data:', {
      hasContainer: !!seatMapContainer,
      hasSeatMapData: !!this.seatMapData,
      selectedClass: this.selectedClass,
      vehicleSeatMap: this.seatMapData.vehicle_seat_map,
      classInfo: this.seatMapData.class_info,
      seatMapStructure: this.seatMapData.seat_map
    });

    // Get class data for current selected class
    const classData = this.seatMapData.seat_map?.classes?.[this.selectedClass];
    if (!classData) {
      console.warn('No class data found for:', this.selectedClass);
      seatMapContainer.innerHTML = '<div class="text-red-600 text-center py-8">No seat map available for this class.</div>';
      return;
    }

    // Parse seat map layout from vehicle table
    let vehicleSeatMap: any = {};
    try {
      // The seat_map comes from vehicle table in the API response
      if (this.seatMapData.vehicle_seat_map) {
        vehicleSeatMap = typeof this.seatMapData.vehicle_seat_map === 'string' 
          ? JSON.parse(this.seatMapData.vehicle_seat_map) 
          : this.seatMapData.vehicle_seat_map;
        console.log('Parsed vehicle seat map:', vehicleSeatMap);
      }
    } catch (e) {
      console.warn('Could not parse vehicle seat map, using default layout:', e);
    }

    // Get seat configuration from vehicle seat map or create default
    const totalSeats = vehicleSeatMap.total_seats || this.seatMapData.total_seats || 40;
    const seatLayout = vehicleSeatMap.layout || null; // 2D array from database
    const seatNumbers = classData.seat_numbers || [];
    const bookedSeats = classData.booked_seat_numbers || [];
    const availableSeats = classData.available_seat_numbers || [];
    
    // Validate booked seats - ensure they don't exceed total seats
    const validBookedSeats = bookedSeats.filter((seat: number) => seat <= totalSeats);
    if (validBookedSeats.length !== bookedSeats.length) {
      console.warn('Some booked seats exceed total seats, filtering out invalid seats');
    }
    
    // Get class seat assignments from vehicle seat map or use class data
    const classSeats = vehicleSeatMap.classes || {};
    const currentClassSeats = classSeats[this.selectedClass] || seatNumbers;

    console.log('Seat configuration:', {
      totalSeats,
      hasLayout: !!seatLayout,
      layoutType: Array.isArray(seatLayout) ? 'Array' : typeof seatLayout,
      currentClassSeats: currentClassSeats.length,
      bookedSeats: validBookedSeats.length,
      availableSeats: availableSeats.length,
      travelDate: this.travelDate,
      currentDate: new Date().toISOString().split('T')[0]
    });

    let html = '';

    if (seatLayout && Array.isArray(seatLayout)) {
      // Use the 2D layout from database
      console.log('Using 2D layout from database:', seatLayout);
      seatLayout.forEach((row: number[]) => {
        html += '<div class="flex justify-center gap-2 mb-2">';
        
        row.forEach((seatNumber: number) => {
          if (seatNumber === 0) {
            // Aisle space (0 indicates empty space)
            html += '<div class="w-10"></div>';
            return;
          }

          // Check if this seat belongs to current class
          const belongsToClass = currentClassSeats.includes(seatNumber);
          if (!belongsToClass && currentClassSeats.length > 0) {
            // Render as unavailable/different class seat
            html += `
              <div class="seat booked opacity-50" title="Different class">
                ${seatNumber}
              </div>
            `;
            return;
          }

          const isBooked = validBookedSeats.includes(seatNumber);
          const isSelected = this.selectedSeats.includes(seatNumber);
          
          // Determine if seat is premium based on class pricing
          const isPremium = this.selectedClass.toLowerCase().includes('business') || 
                           this.selectedClass.toLowerCase().includes('premium') ||
                           seatNumber <= 8; // First 8 seats can be premium

          let seatClass = 'seat';
          if (isBooked) {
            seatClass += ' booked';
          } else if (isSelected) {
            seatClass += isPremium ? ' premium selected' : ' selected';
          } else if (isPremium) {
            seatClass += ' premium';
          } else {
            seatClass += ' available';
          }

          html += `
            <button 
              type="button" 
              class="${seatClass}" 
              data-seat="${seatNumber}"
              data-premium="${isPremium}"
              ${isBooked ? 'disabled' : ''}
              title="Seat ${seatNumber}${isPremium ? ' (Premium +৳200)' : ''}"
            >
              ${seatNumber}
            </button>
          `;
        });
        
        html += '</div>';
      });
    } else {
      // Fallback: Generate default layout if no 2D layout available
      console.log('Using fallback layout generation');
      const seatsPerRow = 4; // Default bus layout (2+2)
      const rows = Math.ceil(totalSeats / seatsPerRow);
      
      for (let row = 0; row < rows; row++) {
        html += '<div class="flex justify-center gap-2 mb-2">';
        
        for (let col = 0; col < seatsPerRow; col++) {
          const seatNumber = row * seatsPerRow + col + 1;
          
          if (seatNumber > totalSeats) break;
          
          // Add aisle space after 2nd seat (2+2 layout)
          if (col === 2) {
            html += '<div class="w-10"></div>';
          }
          
          // Check if this seat belongs to current class
          const belongsToClass = currentClassSeats.includes(seatNumber);
          if (!belongsToClass && currentClassSeats.length > 0) {
            html += `
              <div class="seat booked opacity-50" title="Different class">
                ${seatNumber}
              </div>
            `;
            continue;
          }

          const isBooked = validBookedSeats.includes(seatNumber);
          const isSelected = this.selectedSeats.includes(seatNumber);
          
          const isPremium = this.selectedClass.toLowerCase().includes('business') || 
                           this.selectedClass.toLowerCase().includes('premium') ||
                           seatNumber <= 8;

          let seatClass = 'seat';
          if (isBooked) {
            seatClass += ' booked';
          } else if (isSelected) {
            seatClass += isPremium ? ' premium selected' : ' selected';
          } else if (isPremium) {
            seatClass += ' premium';
          } else {
            seatClass += ' available';
          }

          html += `
            <button 
              type="button" 
              class="${seatClass}" 
              data-seat="${seatNumber}"
              data-premium="${isPremium}"
              ${isBooked ? 'disabled' : ''}
              title="Seat ${seatNumber}${isPremium ? ' (Premium +৳200)' : ''}"
            >
              ${seatNumber}
            </button>
          `;
        }
        
        html += '</div>';
      }
    }

    seatMapContainer.innerHTML = html;
    console.log('Seat map HTML generated, total length:', html.length);

    // Add seat click event listeners
    seatMapContainer.querySelectorAll('.seat:not([disabled])').forEach(seat => {
      seat.addEventListener('click', (e) => this.handleSeatSelection(e));
    });

    // Update available seats count
    const availableSeatsCount = currentClassSeats.length - validBookedSeats.filter((seat: number) => currentClassSeats.includes(seat)).length;
    const availableElement = document.getElementById('availableSeatsCount');
    if (availableElement) {
      availableElement.textContent = availableSeatsCount.toString();
    }
    
    // Update total seats count
    const totalSeatsElement = document.getElementById('totalSeatsCount');
    if (totalSeatsElement) {
      totalSeatsElement.textContent = totalSeats.toString();
    }
    
    // Log final seat availability summary
    console.log('Final seat availability summary:', {
      totalSeats,
      availableSeats: availableSeatsCount,
      bookedSeats: validBookedSeats.length,
      selectedSeats: this.selectedSeats.length,
      travelDate: this.travelDate
    });
  }

  private handleSeatSelection(e: Event) {
    const seatElement = e.target as HTMLElement;
    const seatNumber = parseInt(seatElement.getAttribute('data-seat')!);
    const isPremium = seatElement.getAttribute('data-premium') === 'true';

    if (this.selectedSeats.includes(seatNumber)) {
      // Deselect seat
      this.selectedSeats = this.selectedSeats.filter(s => s !== seatNumber);
      seatElement.classList.remove('selected');
      if (isPremium) {
        seatElement.classList.add('premium');
      } else {
        seatElement.classList.add('available');
      }
    } else {
      // Select seat (max 6 seats)
      if (this.selectedSeats.length >= 6) {
        this.showNotification('Maximum 6 seats can be selected per booking', 'warning');
        return;
      }

      this.selectedSeats.push(seatNumber);
      seatElement.classList.remove('available', 'premium');
      seatElement.classList.add('selected');
      // Don't add premium class back when selected - let selected style take precedence
    }

    this.updateSelectedCount();
    this.updateSelectedSeatsDisplay();
    this.updatePriceSummary();
    this.togglePassengerSection();
    this.generatePassengerForms();
  }

  private updateSelectedCount() {
    const selectedCountElement = document.getElementById('selectedCount');
    if (selectedCountElement) {
      selectedCountElement.textContent = this.selectedSeats.length.toString();
    }
  }

  private updateSelectedSeatsDisplay() {
    const selectedSeatsElement = document.getElementById('selectedSeats');
    if (!selectedSeatsElement) return;

    if (this.selectedSeats.length === 0) {
      selectedSeatsElement.innerHTML = '<p class="text-gray-500">No seats selected</p>';
      return;
    }

    const seatsList = this.selectedSeats.sort((a, b) => a - b).map(seat => {
      const isPremium = seat <= 8; // First 8 seats are premium
      return `
        <div class="flex items-center justify-between py-2 px-3 bg-blue-50 rounded-lg">
          <span class="font-medium">Seat ${seat}</span>
          <span class="text-sm ${isPremium ? 'text-orange-600' : 'text-blue-600'}">
            ${isPremium ? 'Premium' : 'Regular'}
          </span>
        </div>
      `;
    }).join('');

    selectedSeatsElement.innerHTML = seatsList;
  }

  private updatePriceSummary() {
    const selectedSeatCount = this.selectedSeats.length;
    
    // Simple pricing model - single price for all seats
    const subtotal = selectedSeatCount * this.seatPrice;
    let totalSavings = 0;
    
    this.totalPrice = subtotal;

    // Apply coupon discount if available
    if (this.appliedCoupon) {
      if (this.appliedCoupon.discount_type === 'percentage') {
        totalSavings = Math.round(subtotal * (this.appliedCoupon.discount_value / 100));
      } else {
        totalSavings = this.appliedCoupon.discount_value;
      }
      this.totalPrice = subtotal - totalSavings;
    }

    // Update UI elements for simple pricing with null checks
    const selectedSeatCountElement = document.getElementById('selectedSeatCount');
    if (selectedSeatCountElement) selectedSeatCountElement.textContent = this.selectedSeats.length.toString();
    
    const subtotalPrice = document.getElementById('subtotalPrice');
    if (subtotalPrice) subtotalPrice.textContent = subtotal.toString();
    
    const totalAmount = document.getElementById('totalAmount');
    if (totalAmount) totalAmount.textContent = this.totalPrice.toString();

    // Update discount row if there are savings
    const discountRow = document.getElementById('discountRow');
    const discountAmount = document.getElementById('discountAmount');
    if (discountRow && discountAmount) {
      if (totalSavings > 0) {
        discountAmount.textContent = totalSavings.toString();
        discountRow.classList.remove('hidden');
      } else {
        discountRow.classList.add('hidden');
      }
    }

    // Enable/disable continue button
    const continueBtn = document.getElementById('continueToPayment') as HTMLButtonElement;
    if (continueBtn) {
      continueBtn.disabled = this.selectedSeats.length === 0;
    }
  }

  private togglePassengerSection() {
    const passengerSection = document.getElementById('passengerSection');
    if (passengerSection) {
      passengerSection.style.display = this.selectedSeats.length > 0 ? 'block' : 'none';
    }
  }

  private generatePassengerForms() {
    const passengerFormsContainer = document.getElementById('passengerForms');
    if (!passengerFormsContainer) return;

    if (this.selectedSeats.length === 0) {
      passengerFormsContainer.innerHTML = '';
      return;
    }

    let html = '';
    this.selectedSeats.sort((a, b) => a - b).forEach((seat, index) => {
      const isPremium = seat <= 8;
      html += `
        <div class="passenger-form" data-seat="${seat}">
          <div class="flex items-center justify-between mb-4">
            <h4 class="text-lg font-semibold text-gray-800 flex items-center">
              <i class="fas fa-user mr-2 text-blue-600"></i>
              Passenger ${index + 1}
            </h4>
            <div class="flex items-center space-x-2">
              <span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                Seat ${seat}
              </span>
              ${isPremium ? '<span class="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">Premium</span>' : ''}
            </div>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
              <input 
                type="text"
                name="name_${seat}"
                required
                placeholder="Enter full name"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                maxlength="50"
              />
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Age *</label>
              <input 
                type="number"
                name="age_${seat}"
                required
                min="1"
                max="120"
                placeholder="Age"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Gender *</label>
              <select 
                name="gender_${seat}"
                required
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              >
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Phone Number (11 digits) *</label>
              <input 
                type="tel"
                name="phone_${seat}"
                required
                placeholder="Enter 11-digit phone number"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                pattern="[0-9]{11}"
                minlength="11"
                maxlength="11"
              />
            </div>
          </div>
        </div>
      `;
    });

    passengerFormsContainer.innerHTML = html;
    
    // Add real-time validation
    this.addPassengerFormValidation();
  }

  private addPassengerFormValidation() {
    // Add event listeners to all passenger form inputs for real-time validation
    const inputs = document.querySelectorAll('#passengerForms input, #passengerForms select');
    inputs.forEach(input => {
      input.addEventListener('input', () => this.updatePaymentButtonState());
      input.addEventListener('change', () => this.updatePaymentButtonState());
    });
    
    // Initial state update
    this.updatePaymentButtonState();
  }

  private updatePaymentButtonState() {
    const continueBtn = document.getElementById('continueToPayment') as HTMLButtonElement;
    if (!continueBtn) return;
    
    const isValid = this.selectedSeats.length > 0 && this.validatePassengerForms();
    
    if (isValid) {
      continueBtn.disabled = false;
      continueBtn.textContent = 'Continue to Payment';
      continueBtn.classList.remove('opacity-50', 'cursor-not-allowed');
      continueBtn.classList.add('hover:bg-blue-700');
    } else {
      continueBtn.disabled = true;
      continueBtn.textContent = 'Complete passenger details to continue';
      continueBtn.classList.add('opacity-50', 'cursor-not-allowed');
      continueBtn.classList.remove('hover:bg-blue-700');
    }
  }

  private attachEventListeners() {
    // Continue to payment
    document.getElementById('continueToPayment')?.addEventListener('click', () => this.handleContinueToPayment());

    // Mobile menu toggle
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => this.toggleMobileMenu());
    
    // Add refresh button for seat availability
    this.addRefreshButton();
    
    // Initial payment button state
    this.updatePaymentButtonState();
  }

  private addRefreshButton() {
    // Add a refresh button to the seat selection section
    const seatSelectionSection = document.querySelector('.glass-card h2');
    if (seatSelectionSection && seatSelectionSection.textContent?.includes('Select Your Seats')) {
      const refreshButton = document.createElement('button');
      refreshButton.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Seats';
      refreshButton.className = 'ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm';
      refreshButton.addEventListener('click', () => this.refreshSeatAvailability());
      
      const headerContainer = seatSelectionSection.parentElement;
      if (headerContainer) {
        const existingButton = headerContainer.querySelector('button');
        if (!existingButton) {
          headerContainer.appendChild(refreshButton);
        }
      }
    }
  }

  private async refreshSeatAvailability() {
    try {
      console.log('Refreshing seat availability...');
      
      // Show loading state
      const refreshButton = document.querySelector('.glass-card button');
      if (refreshButton) {
        const originalText = refreshButton.innerHTML;
        refreshButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        refreshButton.setAttribute('disabled', 'true');
        
        // Refresh the seat map data
        await this.fetchTripAndSeatMap();
        this.lastRefreshTime = Date.now();
        
        // Restore button
        refreshButton.innerHTML = originalText;
        refreshButton.removeAttribute('disabled');
      }
      
      Utils.showNotification('Seat availability refreshed successfully', 'success');
    } catch (error) {
      console.error('Error refreshing seat availability:', error);
      Utils.showNotification('Failed to refresh seat availability', 'error');
    }
  }

  private stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
      console.log('Auto-refresh stopped');
    }
  }

  // Cleanup method to be called when page is unloaded
  public cleanup() {
    this.stopAutoRefresh();
  }

  private async handleContinueToPayment() {
    // Check authentication
    if (!(await apiService.isAuthenticated())) {
      Utils.showNotification('Please login to book tickets.', 'warning');
      setTimeout(() => Utils.navigateTo('login.html'), 2000);
      return;
    }

    if (this.selectedSeats.length === 0) {
      this.showNotification('Please select at least one seat', 'warning');
      return;
    }

    if (!this.validatePassengerForms()) {
      // Check specifically what's missing
      const missingPhones = this.selectedSeats.filter(seat => {
        const phone = (document.querySelector(`[name="phone_${seat}"]`) as HTMLInputElement)?.value.trim();
        return !phone || phone.length !== 11 || !/^\d{11}$/.test(phone);
      });
      
      if (missingPhones.length > 0) {
        this.showNotification('Please provide valid 11-digit phone numbers for all passengers', 'error');
      } else {
        this.showNotification('Please fill in all required passenger details', 'error');
      }
      return;
    }

    // Collect passenger data
    const passengerDetails = this.collectPassengerData();
    
    // Show loading overlay
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    try {
      console.log('=== Creating Booking ===');
      console.log('Passenger details:', passengerDetails);
      console.log('Selected seats:', this.selectedSeats);
      console.log('Total price:', this.totalPrice);

      // Create booking request
      // Always send ECONOMY to backend to ensure pricing fallback works even if other classes aren't configured
      const seatClassToSend = 'ECONOMY';
      const bookingRequest: BookingRequest = {
        schedule_id: parseInt(this.scheduleId || '0'),  // Changed from transport_id to schedule_id
        seats: this.selectedSeats,
        seat_class: seatClassToSend,
        passenger_details: passengerDetails,
        travel_date: this.travelDate
      };

      console.log('Booking request:', bookingRequest);

      // Create the booking via API
      const response = await apiService.createBooking(bookingRequest);
      
      if (response.success && response.data) {
        console.log('Booking created successfully:', response.data);
        
        // Store booking data for payment page (with actual booking ID)
        const bookingData = {
          id: response.data.id,
          booking_id: response.data.id,
          vehicle_id: this.vehicleId,
          schedule_id: this.scheduleId,
          travel_date: this.travelDate,
          selected_seats: this.selectedSeats,
          seats: this.selectedSeats, // For compatibility
          passenger_details: passengerDetails,
          total_amount: this.totalPrice,
          total_price: this.totalPrice,
          seat_class: seatClassToSend,
          status: response.data.status || 'PENDING'
        };

        console.log('Storing booking data with ID:', bookingData);

        Utils.setLocalStorage('booking_data', bookingData);
        Utils.setLocalStorage('pending_booking', bookingData);
        
        // Navigate to payment page with booking ID
        console.log('Navigating to payment with booking ID:', response.data.id);
        Utils.navigateTo(`payment.html?booking_id=${response.data.id}`);
        
      } else {
        throw new Error(response.error || 'Failed to create booking');
      }
    } catch (error) {
      console.error('Booking creation error:', error);
      this.showNotification('Failed to create booking. Please try again.', 'error');
    } finally {
      const loadingOverlay = document.getElementById('loadingOverlay');
      if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
  }

  private validatePassengerForms(): boolean {
    let isValid = true;
    
    this.selectedSeats.forEach(seat => {
      const name = (document.querySelector(`[name="name_${seat}"]`) as HTMLInputElement)?.value.trim();
      const age = (document.querySelector(`[name="age_${seat}"]`) as HTMLInputElement)?.value;
      const gender = (document.querySelector(`[name="gender_${seat}"]`) as HTMLSelectElement)?.value;
      const phone = (document.querySelector(`[name="phone_${seat}"]`) as HTMLInputElement)?.value.trim();
      
      // Check if all required fields are filled
      if (!name || !age || !gender || !phone) {
        isValid = false;
      }
      
      // Validate phone number format (must be exactly 11 digits)
      if (phone && (phone.length !== 11 || !/^\d{11}$/.test(phone))) {
        isValid = false;
      }
    });
    
    return isValid;
  }

  private collectPassengerData(): any[] {
    return this.selectedSeats.map(seat => {
      const name = (document.querySelector(`[name="name_${seat}"]`) as HTMLInputElement).value.trim();
      const age = parseInt((document.querySelector(`[name="age_${seat}"]`) as HTMLInputElement).value);
      const gender = (document.querySelector(`[name="gender_${seat}"]`) as HTMLSelectElement).value;
      const phone = (document.querySelector(`[name="phone_${seat}"]`) as HTMLInputElement)?.value.trim();
      
      return {
        seat_number: seat,
        name,
        age,
        gender,
        phone: phone || null
      };
    });
  }

  private toggleMobileMenu() {
    // Mobile menu implementation would go here
    console.log('Mobile menu toggle');
  }

  private showNotification(message: string, type: 'success' | 'warning' | 'error') {
    // Create and show notification
    const notification = document.createElement('div');
    notification.className = `fixed top-20 right-4 z-50 p-4 rounded-lg shadow-lg ${
      type === 'success' ? 'bg-green-500 text-white' :
      type === 'warning' ? 'bg-yellow-500 text-white' :
      'bg-red-500 text-white'
    }`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// Initialize enhanced booking page
let bookingPageInstance: EnhancedBookingPage | null = null;

window.addEventListener('DOMContentLoaded', () => {
  bookingPageInstance = new EnhancedBookingPage();
});

// Cleanup when page is unloaded
window.addEventListener('beforeunload', () => {
  if (bookingPageInstance) {
    bookingPageInstance.cleanup();
  }
});

// Cleanup when page is hidden (mobile browsers)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && bookingPageInstance) {
    bookingPageInstance.cleanup();
  }
}); 