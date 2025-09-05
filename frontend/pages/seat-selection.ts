// Seat selection page functionality
import { apiService } from '../services/api.ts';
import Utils from '../services/utils.ts';
import { SeatMap, createDynamicSeats, type Seat, type VehicleLayout } from '../components/seatMap.ts';

interface SeatMapData {
  vehicle_id: number;
  vehicle_number: string;
  vehicle_type: string;
  total_seats: number;
  travel_date: string;
  seat_map: {
    layout: any;
    classes: { [key: string]: SeatClassInfo };
  };
  class_info: { [key: string]: { price: number; available: boolean } };
  booked_seats: string[];
  facilities: string[];
}

interface SeatClassInfo {
  total_seats: number;
  available_seats: number;
  booked_seats: number;
  seat_numbers: string[];
  available_seat_numbers: string[];
  booked_seat_numbers: string[];
}

class SeatSelectionPage {
  private selectedSeats: string[] = [];
  private seatMapData: SeatMapData | null = null;
  private seatMapComponent: SeatMap | null = null;
  private currentSeatClass: string = 'ECONOMY';
  private vehicleId: number = 0;
  private travelDate: string = '';
  private scheduleId: number = 0;
  private basePrice: number = 500;
  private serviceCharge: number = 50;

  constructor() {
    this.initializeElements();
    this.attachEventListeners();
    this.loadTripData();
  }

  private initializeElements(): void {
    // Check if user is authenticated
    if (!apiService.isAuthenticated()) {
      Utils.showNotification('Please login to continue with seat selection', 'warning');
      setTimeout(() => {
        Utils.navigateTo('login.html');
      }, 2000);
      return;
    }
  }

  private attachEventListeners(): void {
    // Seat count input
    const seatCountInput = document.getElementById('seat-count') as HTMLInputElement;
    if (seatCountInput) {
      seatCountInput.addEventListener('change', () => this.updateMaxSelection());
    }

    // Seat class selection
    const seatClassSelect = document.getElementById('seat-class') as HTMLSelectElement;
    if (seatClassSelect) {
      seatClassSelect.addEventListener('change', () => {
        this.currentSeatClass = seatClassSelect.value.toUpperCase();
        this.regenerateSeatMap();
        this.updatePricing();
      });
    }

    // Continue button
    const continueBtn = document.getElementById('continue-btn') as HTMLButtonElement;
    if (continueBtn) {
      continueBtn.addEventListener('click', () => this.handleContinue());
    }
  }

  private async loadTripData(): Promise<void> {
    // Load trip data from URL parameters or localStorage
    const tripData = Utils.getLocalStorage('selected_trip');
    
    if (tripData) {
      this.vehicleId = tripData.vehicle_id || 0;
      this.travelDate = tripData.travel_date || '';
      this.scheduleId = tripData.id || 0;
      this.basePrice = tripData.price || 500;
      
      this.updateTripInfo(tripData);
      await this.loadSeatMap();
    } else {
      // Fallback to URL parameters
      const vehicleId = Utils.getQueryParam('vehicle_id');
      const date = Utils.getQueryParam('date');
      const scheduleId = Utils.getQueryParam('schedule_id');
      
      if (vehicleId && date) {
        this.vehicleId = parseInt(vehicleId);
        this.travelDate = date;
        this.scheduleId = scheduleId ? parseInt(scheduleId) : 0;
        
        await this.loadSeatMap();
      } else {
        Utils.showNotification('Invalid trip data. Please go back and select a trip.', 'error');
        setTimeout(() => {
          Utils.navigateTo('search.html');
        }, 2000);
      }
    }
  }

  private async loadSeatMap(): Promise<void> {
    try {
      const params = new URLSearchParams({
        travel_date: this.travelDate
      });
      
      if (this.scheduleId) {
        params.append('schedule_id', this.scheduleId.toString());
      }
      
      const response = await apiService.get(`/search/seats/${this.vehicleId}?${params}`);
      this.seatMapData = response;
      
      this.populateSeatClasses();
      this.createDynamicSeatMap();
      this.updateAvailableSeats();
    } catch (error) {
      console.error('Error loading seat map:', error);
      Utils.showNotification('Failed to load seat map. Please try again.', 'error');
    }
  }

  private populateSeatClasses(): void {
    const seatClassSelect = document.getElementById('seat-class') as HTMLSelectElement;
    if (!seatClassSelect || !this.seatMapData) return;
    
    // Clear existing options
    seatClassSelect.innerHTML = '';
    
    // Add available seat classes
    Object.keys(this.seatMapData.class_info).forEach(className => {
      const classInfo = this.seatMapData!.class_info[className];
      const option = document.createElement('option');
      option.value = className.toLowerCase();
      option.textContent = `${className} (৳${classInfo.price})`;
      
      if (!classInfo.available) {
        option.disabled = true;
        option.textContent += ' - Not Available';
      }
      
      seatClassSelect.appendChild(option);
    });
    
    // Set first available class as selected
    const firstAvailable = Object.keys(this.seatMapData.class_info).find(
      className => this.seatMapData!.class_info[className].available
    );
    
    if (firstAvailable) {
      seatClassSelect.value = firstAvailable.toLowerCase();
      this.currentSeatClass = firstAvailable;
    }
  }

  private createDynamicSeatMap(): void {
    const seatMapContainer = document.getElementById('seat-map');
    if (!seatMapContainer || !this.seatMapData) return;

    // Clear existing seat map
    if (this.seatMapComponent) {
      this.seatMapComponent.destroy();
    }

    // Determine vehicle type from the data
    const vehicleType = this.getVehicleType(this.seatMapData.vehicle_type);
    
    // Create dynamic seat layout
    const classPrices = Object.fromEntries(
      Object.entries(this.seatMapData?.class_info || {}).map(([key, info]) => [key, info.price])
    );
    
    const { seats, layout } = createDynamicSeats(
      vehicleType,
      this.seatMapData.total_seats,
      this.seatMapData.booked_seats,
      classPrices
    );

    // Update seat prices based on class info
    this.updateSeatPrices(seats);

    // Create new seat map component
    this.seatMapComponent = new SeatMap({
      container: seatMapContainer,
      seats: seats,
      vehicleLayout: layout,
      maxSelection: this.getMaxSeatsAllowed(),
      onSeatSelect: (seat: Seat) => this.onSeatSelected(seat),
      onSeatDeselect: (seat: Seat) => this.onSeatDeselected(seat),
      classPrices: classPrices // Use the extracted prices
    });
  }

  private getVehicleType(vehicleTypeString: string): 'bus' | 'train' | 'plane' {
    const type = vehicleTypeString.toLowerCase();
    if (type.includes('train')) return 'train';
    if (type.includes('plane') || type.includes('aircraft')) return 'plane';
    return 'bus'; // Default to bus
  }

  private updateSeatPrices(seats: Seat[][]): void {
    if (!this.seatMapData) return;

    seats.flat().forEach(seat => {
      const classInfo = this.seatMapData!.class_info[seat.class.toUpperCase()];
      if (classInfo) {
        seat.price = classInfo.price;
      }
    });
  }

  private getMaxSeatsAllowed(): number {
    const seatCountInput = document.getElementById('seat-count') as HTMLInputElement;
    return parseInt(seatCountInput?.value || '1');
  }

  private updateMaxSelection(): void {
    const maxSeats = this.getMaxSeatsAllowed();
    if (this.seatMapComponent) {
      this.seatMapComponent.setMaxSelection(maxSeats);
    }
    this.updateContinueButton();
  }

  private regenerateSeatMap(): void {
    this.createDynamicSeatMap();
  }

  private onSeatSelected(seat: Seat): void {
    if (!this.selectedSeats.includes(seat.number)) {
      this.selectedSeats.push(seat.number);
    }
    this.updateSelection();
  }

  private onSeatDeselected(seat: Seat): void {
    this.selectedSeats = this.selectedSeats.filter(seatNum => seatNum !== seat.number);
    this.updateSelection();
  }

  private updateTripInfo(tripData: any): void {
    const routeElement = document.getElementById('trip-route');
    const dateElement = document.getElementById('trip-date');
    const vehicleElement = document.getElementById('trip-vehicle');

    if (routeElement) {
      routeElement.textContent = `${tripData.source_name || tripData.from} → ${tripData.destination_name || tripData.to}`;
    }
    if (dateElement) {
      dateElement.textContent = `Travel Date: ${tripData.travel_date || tripData.date}`;
    }
    if (vehicleElement) {
      vehicleElement.textContent = `Vehicle: ${tripData.operator_name || tripData.vehicle || 'Unknown'} - ${tripData.vehicle_number || ''}`;
    }
  }

  private updateAvailableSeats(): void {
    const availableSeatsElement = document.getElementById('available-seats');
    if (!availableSeatsElement || !this.seatMapData) return;
    
    const currentClassInfo = this.seatMapData.seat_map.classes[this.currentSeatClass];
    if (currentClassInfo) {
      availableSeatsElement.textContent = currentClassInfo.available_seats.toString();
    } else {
      // Calculate total available seats
      const totalBooked = this.seatMapData.booked_seats.length;
      const totalAvailable = this.seatMapData.total_seats - totalBooked;
      availableSeatsElement.textContent = totalAvailable.toString();
    }
  }

  private updateSelection(): void {
    this.updateSelectedSeatsDisplay();
    this.updatePricing();
    this.updateContinueButton();
  }

  private updateSelectedSeatsDisplay(): void {
    const displayElement = document.getElementById('selected-seats-display');
    if (!displayElement) return;

    if (this.selectedSeats.length === 0) {
      displayElement.innerHTML = '<p class="text-sm text-gray-600">No seats selected</p>';
    } else {
      displayElement.innerHTML = `
        <p class="text-sm font-medium mb-2">Selected Seats:</p>
        <div class="flex flex-wrap gap-1">
          ${this.selectedSeats.map(seat => 
            `<span class="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">${seat}</span>`
          ).join('')}
        </div>
      `;
    }
  }

  private updatePricing(): void {
    const seatClassSelect = document.getElementById('seat-class') as HTMLSelectElement;
    const seatClass = seatClassSelect?.value || 'economy';
    
    // Get price from class info if available
    let basePrice = this.basePrice;
    if (this.seatMapData && this.seatMapData.class_info[seatClass.toUpperCase()]) {
      basePrice = this.seatMapData.class_info[seatClass.toUpperCase()].price;
    }

    const baseFare = basePrice * this.selectedSeats.length;
    const serviceCharge = this.serviceCharge * this.selectedSeats.length;
    const total = baseFare + serviceCharge;

    // Update display
    const baseFareElement = document.getElementById('base-fare');
    const serviceChargeElement = document.getElementById('service-charge');
    const totalElement = document.getElementById('total-amount');

    if (baseFareElement) baseFareElement.textContent = Utils.formatCurrency(baseFare);
    if (serviceChargeElement) serviceChargeElement.textContent = Utils.formatCurrency(serviceCharge);
    if (totalElement) totalElement.textContent = Utils.formatCurrency(total);
  }

  private updateContinueButton(): void {
    const continueBtn = document.getElementById('continue-btn') as HTMLButtonElement;
    if (!continueBtn) return;

    const seatCountInput = document.getElementById('seat-count') as HTMLInputElement;
    const maxSeats = parseInt(seatCountInput?.value || '1');

    if (this.selectedSeats.length === maxSeats && this.selectedSeats.length > 0) {
      continueBtn.disabled = false;
      continueBtn.textContent = 'Continue to Booking';
    } else {
      continueBtn.disabled = true;
      continueBtn.textContent = `Select ${maxSeats} seat${maxSeats > 1 ? 's' : ''}`;
    }
  }

  private handleContinue(): void {
    if (this.selectedSeats.length === 0) {
      Utils.showNotification('Please select at least one seat', 'warning');
      return;
    }

    // Save selection data
    const seatClassSelect = document.getElementById('seat-class') as HTMLSelectElement;
    const selectionData = {
      selectedSeats: this.selectedSeats,
      seatClass: seatClassSelect?.value || 'economy',
      totalPrice: this.calculateTotalPrice(),
      tripData: Utils.getLocalStorage('selected_trip'),
      vehicleType: this.seatMapData?.vehicle_type || 'bus'
    };

    Utils.setLocalStorage('seat_selection', selectionData);

    // Navigate to booking page
    Utils.navigateTo('booking.html');
  }

  private calculateTotalPrice(): number {
    const seatClassSelect = document.getElementById('seat-class') as HTMLSelectElement;
    const seatClass = seatClassSelect?.value || 'economy';
    
    // Get price from class info if available
    let basePrice = this.basePrice;
    if (this.seatMapData && this.seatMapData.class_info[seatClass.toUpperCase()]) {
      basePrice = this.seatMapData.class_info[seatClass.toUpperCase()].price;
    }

    const baseFare = basePrice * this.selectedSeats.length;
    const serviceCharge = this.serviceCharge * this.selectedSeats.length;
    return baseFare + serviceCharge;
  }
}

// Initialize seat selection page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new SeatSelectionPage();
}); 