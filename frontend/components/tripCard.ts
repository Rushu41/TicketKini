// components/tripCard.ts
export interface TripData {
  id: string;
  departure: {
    city: string;
    terminal: string;
    time: string;
    date: string;
  };
  arrival: {
    city: string;
    terminal: string;
    time: string;
    date: string;
  };
  duration: string;
  operator: string;
  vehicleType: 'bus' | 'train' | 'plane';
  class: 'economy' | 'business' | 'premium';
  price: number;
  currency: string;
  availableSeats: number;
  totalSeats: number;
  amenities: string[];
  image?: string;
  discount?: {
    percentage: number;
    originalPrice: number;
  };
  dynamicPricing?: {
    basePrice: number;
    currentPrice: number;
    savings: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    trendPercentage: number;
    demandLevel: 'low' | 'medium' | 'high';
    bookNowRecommended: boolean;
  };
  rating?: number;
  reviews?: number;
}

export interface TripCardOptions {
  trip: TripData;
  onSelect?: (trip: TripData) => void;
  showAmenities?: boolean;
  showRating?: boolean;
  compact?: boolean;
}

export class TripCard {
  private trip: TripData;
  private options: TripCardOptions;

  constructor(options: TripCardOptions) {
    this.trip = options.trip;
    this.options = {
      showAmenities: true,
      showRating: true,
      compact: false,
      ...options
    };
  }

  public render(): HTMLElement {
    const card = document.createElement('div');
    card.className = this.getCardClasses();
    card.dataset.tripId = this.trip.id;

    if (this.options.compact) {
      card.innerHTML = this.renderCompactCard();
    } else {
      card.innerHTML = this.renderFullCard();
    }

    this.attachEventListeners(card);
    return card;
  }

  private getCardClasses(): string {
    const baseClasses = 'trip-card bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-300 cursor-pointer';
    const compactClasses = this.options.compact ? 'p-4' : 'p-6';
    return `${baseClasses} ${compactClasses}`;
  }

  private renderFullCard(): string {
    return `
      <div class="flex flex-col lg:flex-row lg:items-center gap-4">
        <!-- Transport Icon/Image -->
        <div class="flex-shrink-0">
          ${this.renderTransportIcon()}
        </div>

        <!-- Trip Details -->
        <div class="flex-1 min-w-0">
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 items-center">
            <!-- Departure -->
            <div class="text-left">
              <div class="flex items-center gap-2 mb-1">
                <h3 class="font-bold text-lg text-gray-900">${this.trip.departure.time}</h3>
                <span class="text-sm text-gray-500">${this.formatDate(this.trip.departure.date)}</span>
              </div>
              <p class="font-semibold text-gray-800">${this.trip.departure.city}</p>
              <p class="text-sm text-gray-600">${this.trip.departure.terminal}</p>
            </div>

            <!-- Duration & Route -->
            <div class="text-center">
              <div class="flex items-center justify-center mb-2">
                <div class="w-3 h-3 bg-blue-500 rounded-full"></div>
                <div class="flex-1 h-0.5 bg-gray-300 mx-2 relative">
                  <div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white px-2">
                    <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
                    </svg>
                  </div>
                </div>
                <div class="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
              <p class="text-sm font-medium text-gray-700">${this.trip.duration}</p>
              <p class="text-xs text-gray-500 capitalize">${this.trip.class} Class</p>
            </div>

            <!-- Arrival -->
            <div class="text-right lg:text-left">
              <div class="flex items-center gap-2 mb-1 justify-end lg:justify-start">
                <h3 class="font-bold text-lg text-gray-900">${this.trip.arrival.time}</h3>
                <span class="text-sm text-gray-500">${this.formatDate(this.trip.arrival.date)}</span>
              </div>
              <p class="font-semibold text-gray-800">${this.trip.arrival.city}</p>
              <p class="text-sm text-gray-600">${this.trip.arrival.terminal}</p>
            </div>
          </div>

          <!-- Operator & Amenities -->
          <div class="mt-4 pt-4 border-t border-gray-100">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-3">
                <span class="font-semibold text-gray-800">${this.trip.operator}</span>
                ${this.options.showRating && this.trip.rating ? this.renderRating() : ''}
              </div>
              ${this.options.showAmenities ? this.renderAmenities() : ''}
            </div>
          </div>
        </div>

        <!-- Price & Action -->
        <div class="flex-shrink-0 text-right">
          <div class="mb-3">
            ${this.trip.discount ? this.renderDiscountPrice() : this.renderRegularPrice()}
          </div>
          
          <div class="mb-3">
            <p class="text-sm text-gray-600">
              <span class="inline-flex items-center gap-1">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/>
                </svg>
                ${this.trip.availableSeats} seats left
              </span>
            </p>
          </div>

          <button class="select-trip-btn w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
            Select Seats
          </button>
        </div>
      </div>
    `;
  }

  private renderCompactCard(): string {
    return `
      <div class="flex items-center gap-4">
        <!-- Transport Icon -->
        <div class="flex-shrink-0">
          ${this.renderTransportIcon(true)}
        </div>

        <!-- Route Info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="font-bold text-gray-900">${this.trip.departure.time}</span>
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
            </svg>
            <span class="font-bold text-gray-900">${this.trip.arrival.time}</span>
            <span class="text-sm text-gray-500">• ${this.trip.duration}</span>
          </div>
          <p class="text-sm text-gray-600">${this.trip.departure.city} → ${this.trip.arrival.city}</p>
          <p class="text-xs text-gray-500">${this.trip.operator} • ${this.trip.class}</p>
        </div>

        <!-- Price -->
        <div class="text-right">
          ${this.trip.discount ? this.renderDiscountPrice() : this.renderRegularPrice()}
          <button class="select-trip-btn mt-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded text-sm transition-colors duration-200">
            Select
          </button>
        </div>
      </div>
    `;
  }

  private renderTransportIcon(compact: boolean = false): string {
    const iconSize = compact ? 'w-8 h-8' : 'w-12 h-12';
    const containerSize = compact ? 'w-10 h-10' : 'w-16 h-16';
    
    const icons = {
      bus: `
        <svg class="${iconSize} text-blue-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>
          <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2v4h10V6H5z"/>
        </svg>
      `,
      train: `
        <svg class="${iconSize} text-green-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l-1-4h14l-1 4z"/>
        </svg>
      `,
      plane: `
        <svg class="${iconSize} text-purple-600" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"/>
        </svg>
      `
    };

    if (this.trip.image) {
      return `
        <div class="${containerSize} rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
          <img src="${this.trip.image}" alt="${this.trip.operator}" class="w-full h-full object-cover"/>
        </div>
      `;
    }

    return `
      <div class="${containerSize} rounded-lg bg-gray-100 flex items-center justify-center">
        ${icons[this.trip.vehicleType]}
      </div>
    `;
  }

  private renderRating(): string {
    if (!this.trip.rating) return '';
    
    const stars = Math.floor(this.trip.rating);
    const hasHalfStar = this.trip.rating % 1 !== 0;
    
    let starsHtml = '';
    for (let i = 0; i < 5; i++) {
      if (i < stars) {
        starsHtml += '<svg class="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>';
      } else if (i === stars && hasHalfStar) {
        starsHtml += '<svg class="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" clip-path="polygon(0 0, 50% 0, 50% 100%, 0 100%)"/></svg>';
      } else {
        starsHtml += '<svg class="w-4 h-4 text-gray-300 fill-current" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>';
      }
    }

    return `
      <div class="flex items-center gap-1">
        <div class="flex">${starsHtml}</div>
        <span class="text-sm text-gray-600">${this.trip.rating}</span>
        ${this.trip.reviews ? `<span class="text-xs text-gray-500">(${this.trip.reviews})</span>` : ''}
      </div>
    `;
  }

  private renderAmenities(): string {
    if (!this.trip.amenities.length) return '';

    const amenityIcons: Record<string, string> = {
      wifi: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M17.778 8.222c-4.296-4.296-11.26-4.296-15.556 0A1 1 0 01.808 6.808c5.076-5.077 13.308-5.077 18.384 0a1 1 0 01-1.414 1.414zM14.95 11.05a7 7 0 00-9.9 0 1 1 0 01-1.414-1.414 9 9 0 0112.728 0 1 1 0 01-1.414 1.414zM12.12 13.88a3 3 0 00-4.242 0 1 1 0 01-1.415-1.414 5 5 0 017.072 0 1 1 0 01-1.415 1.414zM9 16a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clip-rule="evenodd"/></svg>`,
      ac: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2L3 7v11a2 2 0 002 2h10a2 2 0 002-2V7l-7-5z"/></svg>`,
      charging: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>`,
      entertainment: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4H7V5zm8 8v2h1v-2h-1zm-2-2H4v4h9v-4z" clip-rule="evenodd"/></svg>`,
      blanket: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h12a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6z"/></svg>`,
      snacks: `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M6 3a1 1 0 011-1h.01a1 1 0 010 2H7a1 1 0 01-1-1zm2 3a1 1 0 00-2 0v1a2 2 0 00-2 2v1a2 2 0 00-2 2v.683a3.7 3.7 0 011.055.485 1.704 1.704 0 001.89 0 3.704 3.704 0 014.11 0 1.704 1.704 0 001.89 0 3.704 3.704 0 014.11 0 1.704 1.704 0 001.89 0A3.7 3.7 0 0118 12.683V12a2 2 0 00-2-2V9a2 2 0 00-2-2V6a1 1 0 10-2 0v1H8V6z" clip-rule="evenodd"/></svg>`
    };

    const displayAmenities = this.trip.amenities.slice(0, 4);
    const hasMore = this.trip.amenities.length > 4;

    return `
      <div class="flex items-center gap-2">
        ${displayAmenities.map(amenity => `
          <div class="flex items-center gap-1 text-gray-600 bg-gray-50 rounded-full px-2 py-1" title="${amenity}">
            ${amenityIcons[amenity.toLowerCase()] || amenityIcons.wifi}
            <span class="text-xs hidden sm:inline">${amenity}</span>
          </div>
        `).join('')}
        ${hasMore ? `<span class="text-xs text-gray-500">+${this.trip.amenities.length - 4} more</span>` : ''}
      </div>
    `;
  }

  private renderDiscountPrice(): string {
    if (!this.trip.discount && !this.trip.dynamicPricing) return '';

    // Handle dynamic pricing
    if (this.trip.dynamicPricing) {
      return this.renderDynamicPrice();
    }

    // Handle regular discount
    if (!this.trip.discount) return '';

    return `
      <div class="text-right">
        <div class="flex items-center justify-end gap-2 mb-1">
          <span class="bg-red-100 text-red-800 text-xs font-medium px-2 py-1 rounded-full">
            ${this.trip.discount.percentage}% OFF
          </span>
        </div>
        <div class="text-gray-500 text-sm line-through">
          ${this.trip.currency}${this.trip.discount.originalPrice}
        </div>
        <div class="text-2xl font-bold text-green-600">
          ${this.trip.currency}${this.trip.price}
        </div>
        <div class="text-xs text-gray-500">per person</div>
      </div>
    `;
  }

  private renderRegularPrice(): string {
    // Check if dynamic pricing is available
    if (this.trip.dynamicPricing) {
      return this.renderDynamicPrice();
    }

    return `
      <div class="text-right">
        <div class="text-2xl font-bold text-gray-900">
          ${this.trip.currency}${this.trip.price}
        </div>
        <div class="text-xs text-gray-500">per person</div>
      </div>
    `;
  }

  private renderDynamicPrice(): string {
    if (!this.trip.dynamicPricing) return '';

    const dp = this.trip.dynamicPricing;
    const showSavings = dp.savings > 0;
    const trendColor = dp.trend === 'increasing' ? 'text-red-600' : dp.trend === 'decreasing' ? 'text-green-600' : 'text-gray-600';
    const trendIcon = dp.trend === 'increasing' ? '↗' : dp.trend === 'decreasing' ? '↘' : '→';
    const demandBadgeColor = dp.demandLevel === 'high' ? 'bg-red-100 text-red-800' : 
                            dp.demandLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' : 
                            'bg-green-100 text-green-800';

    return `
      <div class="text-right">
        <!-- Dynamic Pricing Indicators -->
        <div class="flex items-center justify-end gap-1 mb-1">
          <span class="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full">
            <i class="fas fa-chart-line"></i> Smart Price
          </span>
          ${dp.demandLevel !== 'low' ? `
            <span class="${demandBadgeColor} text-xs font-medium px-2 py-0.5 rounded-full capitalize">
              ${dp.demandLevel} Demand
            </span>
          ` : ''}
        </div>
        
        <!-- Price Trend -->
        <div class="flex items-center justify-end gap-1 mb-1">
          <span class="${trendColor} text-xs font-medium">
            ${trendIcon} ${dp.trendPercentage > 0 ? '+' : ''}${dp.trendPercentage}%
          </span>
        </div>

        <!-- Pricing -->
        ${showSavings ? `
          <div class="text-gray-500 text-sm line-through">
            ${this.trip.currency}${dp.basePrice}
          </div>
          <div class="text-2xl font-bold text-green-600">
            ${this.trip.currency}${dp.currentPrice}
          </div>
          <div class="text-xs text-green-600 font-medium">
            Save ${this.trip.currency}${dp.savings}
          </div>
        ` : `
          <div class="text-2xl font-bold text-gray-900">
            ${this.trip.currency}${dp.currentPrice}
          </div>
        `}
        
        <div class="text-xs text-gray-500">per person</div>
        
        ${dp.bookNowRecommended ? `
          <div class="mt-1">
            <span class="bg-orange-100 text-orange-800 text-xs font-medium px-2 py-0.5 rounded-full">
              <i class="fas fa-clock"></i> Book Soon
            </span>
          </div>
        ` : ''}
      </div>
    `;
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        weekday: 'short'
      });
    }
  }

  private attachEventListeners(card: HTMLElement): void {
    const selectButton = card.querySelector('.select-trip-btn') as HTMLButtonElement;
    
    if (selectButton) {
      selectButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleSeatSelection();
      });
    }

    // Make entire card clickable
    card.addEventListener('click', () => {
      this.handleSeatSelection();
    });

    // Prevent card click when interacting with amenities or rating
    const interactiveElements = card.querySelectorAll('[title]');
    interactiveElements.forEach(element => {
      element.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });
  }

  private handleSeatSelection(): void {
    if (this.trip.availableSeats === 0) {
      alert('Sorry, no seats available for this trip.');
      return;
    }

    if (this.options.onSelect) {
      this.options.onSelect(this.trip);
    } else {
      // Default navigation to seat selection page
      const url = `seat-selection.html?tripId=${this.trip.id}`;
      window.location.href = url;
    }
  }

  // Public methods
  public updateAvailableSeats(seats: number): void {
    this.trip.availableSeats = seats;
    const card = document.querySelector(`[data-trip-id="${this.trip.id}"]`);
    if (card) {
      const seatsElement = card.querySelector('.seats-info');
      if (seatsElement) {
        seatsElement.textContent = `${seats} seats left`;
      }
    }
  }

  public setSelected(selected: boolean): void {
    const card = document.querySelector(`[data-trip-id="${this.trip.id}"]`);
    if (card) {
      if (selected) {
        card.classList.add('ring-2', 'ring-blue-500', 'border-blue-500');
      } else {
        card.classList.remove('ring-2', 'ring-blue-500', 'border-blue-500');
      }
    }
  }
}

// Utility function to create sample trip data
export function createSampleTrips(): TripData[] {
  return [
    {
      id: 'trip-001',
      departure: {
        city: 'Dhaka',
        terminal: 'Kamalapur Railway Station',
        time: '08:00',
        date: '2025-06-29'
      },
      arrival: {
        city: 'Chittagong',
        terminal: 'Chittagong Railway Station',
        time: '14:30',
        date: '2025-06-29'
      },
      duration: '6h 30m',
      operator: 'Bangladesh Railway',
      vehicleType: 'train',
      class: 'business',
      price: 850,
      currency: '৳',
      availableSeats: 24,
      totalSeats: 72,
      amenities: ['AC', 'WiFi', 'Snacks', 'Charging'],
      rating: 4.2,
      reviews: 156
    },
    {
      id: 'trip-002',
      departure: {
        city: 'Dhaka',
        terminal: 'Mohakhali Bus Terminal',
        time: '09:15',
        date: '2025-06-29'
      },
      arrival: {
        city: 'Sylhet',
        terminal: 'Sylhet Bus Stand',
        time: '15:45',
        date: '2025-06-29'
      },
      duration: '6h 30m',
      operator: 'Green Line Paribahan',
      vehicleType: 'bus',
      class: 'premium',
      price: 1200,
      currency: '৳',
      availableSeats: 12,
      totalSeats: 36,
      amenities: ['AC', 'WiFi', 'Entertainment', 'Blanket', 'Snacks'],
      rating: 4.5,
      reviews: 89,
      discount: {
        percentage: 15,
        originalPrice: 1400
      }
    },
    {
      id: 'trip-003',
      departure: {
        city: 'Dhaka',
        terminal: 'Hazrat Shahjalal Airport',
        time: '11:30',
        date: '2025-06-29'
      },
      arrival: {
        city: 'Cox\'s Bazar',
        terminal: 'Cox\'s Bazar Airport',
        time: '12:45',
        date: '2025-06-29'
      },
      duration: '1h 15m',
      operator: 'Biman Bangladesh',
      vehicleType: 'plane',
      class: 'economy',
      price: 4500,
      currency: '৳',
      availableSeats: 45,
      totalSeats: 180,
      amenities: ['Entertainment', 'Snacks'],
      rating: 4.0,
      reviews: 234
    }
  ];
}

// Factory function for easy card creation
export function createTripCard(trip: TripData, options?: Partial<TripCardOptions>): HTMLElement {
  const cardInstance = new TripCard({
    trip,
    ...options
  });
  return cardInstance.render();
}

// Bulk render function for multiple trips
export function renderTripCards(
  container: HTMLElement, 
  trips: TripData[], 
  options?: Partial<TripCardOptions>
): void {
  container.innerHTML = '';
  
  trips.forEach(trip => {
    const card = createTripCard(trip, options);
    container.appendChild(card);
  });
}

// Search and filter utilities
export function filterTrips(
  trips: TripData[], 
  filters: {
    departure?: string;
    arrival?: string;
    date?: string;
    class?: string;
    maxPrice?: number;
    operator?: string;
    vehicleType?: string;
  }
): TripData[] {
  return trips.filter(trip => {
    if (filters.departure && !trip.departure.city.toLowerCase().includes(filters.departure.toLowerCase())) {
      return false;
    }
    if (filters.arrival && !trip.arrival.city.toLowerCase().includes(filters.arrival.toLowerCase())) {
      return false;
    }
    if (filters.date && trip.departure.date !== filters.date) {
      return false;
    }
    if (filters.class && trip.class !== filters.class) {
      return false;
    }
    if (filters.maxPrice && trip.price > filters.maxPrice) {
      return false;
    }
    if (filters.operator && !trip.operator.toLowerCase().includes(filters.operator.toLowerCase())) {
      return false;
    }
    if (filters.vehicleType && trip.vehicleType !== filters.vehicleType) {
      return false;
    }
    return true;
  });
}

// Sort utilities
export function sortTrips(trips: TripData[], sortBy: 'price' | 'duration' | 'departure' | 'rating'): TripData[] {
  return [...trips].sort((a, b) => {
    switch (sortBy) {
      case 'price':
        return a.price - b.price;
      case 'duration':
        return parseDuration(a.duration) - parseDuration(b.duration);
      case 'departure':
        return a.departure.time.localeCompare(b.departure.time);
      case 'rating':
        return (b.rating || 0) - (a.rating || 0);
      default:
        return 0;
    }
  });
}

function parseDuration(duration: string): number {
  const match = duration.match(/(\d+)h\s*(\d+)?m?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  return hours * 60 + minutes;
}
