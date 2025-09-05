import { advancedSearchService, AdvancedSearchFilters, SearchResult, MultiLegSearchResult, createSearchFilters, formatDuration, formatPrice, getAmenityIcon, getTransportIcon } from '../services/advancedSearch';
import { aiTravelSuggestionService } from '../services/aiSuggestions';

export class AdvancedSearchComponent {
  private container: HTMLElement;
  private filters: AdvancedSearchFilters;
  private searchResults: SearchResult[] = [];
  private multiLegResults: MultiLegSearchResult[] = [];
  private currentPage: number = 1;
  private totalResults: number = 0;
  private isLoading: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.filters = createSearchFilters();
    this.init();
  }

  private init(): void {
    this.render();
    this.attachEventListeners();
    this.loadInitialData();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="advanced-search-container">
        ${this.renderSearchForm()}
        ${this.renderFilters()}
        ${this.renderQuickSuggestions()}
        ${this.renderSearchResults()}
        ${this.renderPagination()}
      </div>
    `;
  }

  private renderSearchForm(): string {
    return `
      <div class="search-form-container">
        <h2>🔍 Advanced Search</h2>
        <form id="advanced-search-form" class="search-form">
          <div class="form-row">
            <div class="form-group">
              <label for="from-location">From</label>
              <div class="location-input-container">
                <input 
                  type="text" 
                  id="from-location" 
                  placeholder="Enter departure city"
                  value="${this.filters.from_location}"
                  autocomplete="off"
                />
                <div id="from-suggestions" class="suggestions-dropdown"></div>
              </div>
            </div>
            
            <div class="form-group">
              <label for="to-location">To</label>
              <div class="location-input-container">
                <input 
                  type="text" 
                  id="to-location" 
                  placeholder="Enter destination city"
                  value="${this.filters.to_location}"
                  autocomplete="off"
                />
                <div id="to-suggestions" class="suggestions-dropdown"></div>
              </div>
            </div>
            
            <div class="form-group">
              <label for="travel-date">Travel Date</label>
              <input 
                type="date" 
                id="travel-date" 
                value="${this.filters.travel_date}"
                min="${new Date().toISOString().split('T')[0]}"
              />
            </div>
            
            <div class="form-group">
              <label for="return-date">Return Date (Optional)</label>
              <input 
                type="date" 
                id="return-date" 
                value="${this.filters.return_date || ''}"
              />
            </div>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label>Transport Type</label>
              <div class="transport-toggles">
                <button type="button" class="transport-toggle ${this.filters.transport_type === 'ALL' || !this.filters.transport_type ? 'active' : ''}" data-type="ALL">
                  🚀 All
                </button>
                <button type="button" class="transport-toggle ${this.filters.transport_type === 'BUS' ? 'active' : ''}" data-type="BUS">
                  🚌 Bus
                </button>
                <button type="button" class="transport-toggle ${this.filters.transport_type === 'TRAIN' ? 'active' : ''}" data-type="TRAIN">
                  🚂 Train
                </button>
                <button type="button" class="transport-toggle ${this.filters.transport_type === 'PLANE' ? 'active' : ''}" data-type="PLANE">
                  ✈️ Plane
                </button>
              </div>
            </div>
          </div>
          
          <button type="submit" class="search-btn">
            🔍 Search Trips
          </button>
        </form>
      </div>
    `;
  }

  private renderFilters(): string {
    return `
      <div class="filters-container">
        <div class="filters-header">
          <h3>🎛️ Filters</h3>
          <button id="toggle-filters" class="toggle-filters-btn">
            <span class="filter-count">${this.getActiveFilterCount()}</span> filters
          </button>
        </div>
        
        <div id="filters-panel" class="filters-panel">
          <div class="filter-group">
            <h4>💰 Price Range</h4>
            <div class="price-range-container">
              <input 
                type="range" 
                id="min-price" 
                min="0" 
                max="5000" 
                value="${this.filters.min_price || 0}"
                class="price-slider"
              />
              <input 
                type="range" 
                id="max-price" 
                min="0" 
                max="5000" 
                value="${this.filters.max_price || 5000}"
                class="price-slider"
              />
              <div class="price-display">
                <span id="min-price-display">${this.filters.min_price || 0} BDT</span> - 
                <span id="max-price-display">${this.filters.max_price || 5000} BDT</span>
              </div>
            </div>
          </div>
          
          <div class="filter-group">
            <h4>⏰ Departure Time</h4>
            <div class="time-filters">
              <label>
                <input type="time" id="departure-start" value="${this.filters.departure_time_start || ''}"/>
                From
              </label>
              <label>
                <input type="time" id="departure-end" value="${this.filters.departure_time_end || ''}"/>
                To
              </label>
            </div>
          </div>
          
          <div class="filter-group">
            <h4>🎯 Preferences</h4>
            <div class="preference-filters">
              <label class="checkbox-label">
                <input type="checkbox" id="flexible-dates" ${this.filters.flexible_dates ? 'checked' : ''}>
                <span class="checkmark"></span>
                Flexible Dates (±${this.filters.flexible_date_range} days)
              </label>
              
              <label class="checkbox-label">
                <input type="checkbox" id="near-location" ${this.filters.near_user_location ? 'checked' : ''}>
                <span class="checkmark"></span>
                Show nearby options
              </label>
            </div>
          </div>
          
          <div class="filter-group">
            <h4>⭐ Quality Filters</h4>
            <div class="quality-filters">
              <label>
                Min Rating: 
                <select id="min-rating">
                  <option value="">Any</option>
                  <option value="3" ${this.filters.min_rating === 3 ? 'selected' : ''}>3+ ⭐</option>
                  <option value="4" ${this.filters.min_rating === 4 ? 'selected' : ''}>4+ ⭐</option>
                  <option value="4.5" ${this.filters.min_rating === 4.5 ? 'selected' : ''}>4.5+ ⭐</option>
                </select>
              </label>
              
              <label>
                Max Duration: 
                <select id="max-duration">
                  <option value="">Any</option>
                  <option value="4" ${this.filters.max_duration_hours === 4 ? 'selected' : ''}>4 hours</option>
                  <option value="8" ${this.filters.max_duration_hours === 8 ? 'selected' : ''}>8 hours</option>
                  <option value="12" ${this.filters.max_duration_hours === 12 ? 'selected' : ''}>12 hours</option>
                  <option value="24" ${this.filters.max_duration_hours === 24 ? 'selected' : ''}>24 hours</option>
                </select>
              </label>
            </div>
          </div>
          
          <div class="filter-group">
            <h4>🛠️ Amenities</h4>
            <div class="amenity-filters">
              ${this.renderAmenityCheckboxes()}
            </div>
          </div>
          
          <div class="filter-actions">
            <button id="apply-filters" class="apply-filters-btn">Apply Filters</button>
            <button id="clear-filters" class="clear-filters-btn">Clear All</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderAmenityCheckboxes(): string {
    const amenities = ['wifi', 'ac', 'toilet', 'charging_port', 'meal_service', 'entertainment'];
    return amenities.map(amenity => `
      <label class="checkbox-label">
        <input 
          type="checkbox" 
          name="amenity" 
          value="${amenity}"
          ${this.filters.amenities?.includes(amenity) ? 'checked' : ''}
        >
        <span class="checkmark"></span>
        ${getAmenityIcon(amenity)} ${amenity.replace('_', ' ').toUpperCase()}
      </label>
    `).join('');
  }

  private renderQuickSuggestions(): string {
    return `
      <div class="suggestions-container">
        <h3>💡 Smart Suggestions</h3>
        <div id="quick-suggestions" class="quick-suggestions">
          <div class="suggestion-loading">Loading suggestions...</div>
        </div>
      </div>
    `;
  }

  private renderSearchResults(): string {
    if (this.isLoading) {
      return `
        <div class="results-container">
          <div class="loading-spinner">
            <div class="spinner"></div>
            <p>Searching for the best options...</p>
          </div>
        </div>
      `;
    }

    if (this.searchResults.length === 0 && !this.isLoading) {
      return `
        <div class="results-container">
          <div class="no-results">
            <h3>🔍 No results found</h3>
            <p>Try adjusting your filters or search criteria</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="results-container">
        <div class="results-header">
          <h3>Search Results (${this.totalResults} found)</h3>
          <div class="sort-options">
            <label>
              Sort by:
              <select id="sort-by" value="${this.filters.sort_by}">
                <option value="departure_time">Departure Time</option>
                <option value="price_low">Price: Low to High</option>
                <option value="price_high">Price: High to Low</option>
                <option value="duration">Duration</option>
                <option value="rating">Rating</option>
                <option value="fastest">Fastest</option>
                <option value="cheapest">Cheapest</option>
              </select>
            </label>
          </div>
        </div>
        
        <div class="results-list">
          ${this.searchResults.map(result => this.renderSearchResult(result)).join('')}
        </div>
        
        ${this.multiLegResults.length > 0 ? this.renderMultiLegResults() : ''}
      </div>
    `;
  }

  private renderSearchResult(result: SearchResult): string {
    const bookingPressure = this.calculateBookingPressure(result.available_seats, result.total_seats);
    const pressureClass = bookingPressure === 'high' ? 'high-demand' : bookingPressure === 'medium' ? 'medium-demand' : '';
    
    return `
      <div class="search-result-card ${pressureClass}" data-result-id="${result.id}">
        <div class="result-header">
          <div class="transport-info">
            <span class="transport-icon">${getTransportIcon(result.transport_type)}</span>
            <div class="vehicle-details">
              <h4>${result.vehicle_name} (${result.vehicle_number})</h4>
              <p class="operator">${result.operator_name}</p>
            </div>
          </div>
          
          <div class="rating-info">
            ${result.rating ? `
              <span class="rating">
                ⭐ ${result.rating.toFixed(1)} (${result.total_reviews})
              </span>
            ` : ''}
          </div>
        </div>
        
        <div class="result-content">
          <div class="route-info">
            <div class="route-point">
              <span class="time">${result.departure_time}</span>
              <span class="location">${result.from_location}</span>
            </div>
            <div class="route-line">
              <span class="duration">${formatDuration(result.duration)}</span>
              ${result.distance_km ? `<span class="distance">${result.distance_km} km</span>` : ''}
            </div>
            <div class="route-point">
              <span class="time">${result.arrival_time}</span>
              <span class="location">${result.to_location}</span>
            </div>
          </div>
          
          <div class="pricing-info">
            <div class="main-price">
              <span class="current-price">${formatPrice(result.current_price)}</span>
              ${result.discount_percentage ? `
                <span class="original-price">${formatPrice(result.base_price)}</span>
                <span class="discount">${result.discount_percentage}% OFF</span>
              ` : ''}
            </div>
            
            <div class="availability">
              <span class="seats-available">${result.available_seats} seats left</span>
              ${bookingPressure === 'high' ? '<span class="high-demand-badge">🔥 High Demand</span>' : ''}
            </div>
          </div>
        </div>
        
        <div class="result-footer">
          <div class="amenities">
            ${result.amenities.map(amenity => `
              <span class="amenity" title="${amenity}">
                ${getAmenityIcon(amenity)}
              </span>
            `).join('')}
          </div>
          
          <div class="actions">
            <button class="btn-secondary view-details" data-result-id="${result.id}">
              View Details
            </button>
            <button class="btn-primary book-now" data-result-id="${result.id}">
              Proceed to Payment
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderMultiLegResults(): string {
    return `
      <div class="multi-leg-results">
        <h3>🛣️ Multi-leg Journey Options</h3>
        <div class="multi-leg-list">
          ${this.multiLegResults.map(journey => this.renderMultiLegJourney(journey)).join('')}
        </div>
      </div>
    `;
  }

  private renderMultiLegJourney(journey: MultiLegSearchResult): string {
    return `
      <div class="multi-leg-card" data-journey-id="${journey.journey_id}">
        <div class="journey-header">
          <h4>${journey.origin} → ${journey.destination}</h4>
          <span class="total-cost">${formatPrice(journey.total_cost)}</span>
        </div>
        
        <div class="journey-overview">
          <span class="total-duration">${formatDuration(journey.total_duration)}</span>
          <span class="total-legs">${journey.total_legs} legs</span>
          ${journey.total_distance ? `<span class="total-distance">${journey.total_distance} km</span>` : ''}
        </div>
        
        <div class="legs-preview">
          ${journey.legs.slice(0, 2).map((leg, index) => `
            <div class="leg-preview">
              <span class="transport-icon">${getTransportIcon(leg.transport_type)}</span>
              <span class="leg-route">${leg.from_location} → ${leg.to_location}</span>
              ${index < journey.legs.length - 1 && journey.layovers[index] ? `
                <span class="layover">Layover: ${formatDuration(journey.layovers[index].duration_minutes)}</span>
              ` : ''}
            </div>
          `).join('')}
          ${journey.legs.length > 2 ? `<div class="more-legs">+${journey.legs.length - 2} more legs</div>` : ''}
        </div>
        
        <div class="journey-actions">
          <button class="btn-secondary view-journey" data-journey-id="${journey.journey_id}">
            View Full Journey
          </button>
          ${journey.can_book_together ? `
            <button class="btn-primary book-journey" data-journey-id="${journey.journey_id}">
              Book Together
            </button>
          ` : `
            <button class="btn-outline book-separately" data-journey-id="${journey.journey_id}">
              Book Separately
            </button>
          `}
        </div>
      </div>
    `;
  }

  private renderPagination(): string {
    if (this.totalResults <= this.filters.per_page) return '';

    const totalPages = Math.ceil(this.totalResults / this.filters.per_page);
    return `
      <div class="pagination">
        <button 
          class="pagination-btn" 
          ${this.currentPage === 1 ? 'disabled' : ''} 
          data-page="${this.currentPage - 1}"
        >
          Previous
        </button>
        
        <span class="pagination-info">
          Page ${this.currentPage} of ${totalPages} (${this.totalResults} results)
        </span>
        
        <button 
          class="pagination-btn" 
          ${this.currentPage === totalPages ? 'disabled' : ''} 
          data-page="${this.currentPage + 1}"
        >
          Next
        </button>
      </div>
    `;
  }

  private attachEventListeners(): void {
    // Search form submission
    const searchForm = this.container.querySelector('#advanced-search-form') as HTMLFormElement;
    searchForm?.addEventListener('submit', this.handleSearch.bind(this));

    // Location autocomplete
    this.setupLocationAutocomplete('from-location', 'from-suggestions');
    this.setupLocationAutocomplete('to-location', 'to-suggestions');

    // Transport type toggles
    this.container.querySelectorAll('.transport-toggle').forEach(toggle => {
      toggle.addEventListener('click', this.handleTransportToggle.bind(this));
    });

    // Filter controls
    this.container.querySelector('#toggle-filters')?.addEventListener('click', this.toggleFilters.bind(this));
    this.container.querySelector('#apply-filters')?.addEventListener('click', this.applyFilters.bind(this));
    this.container.querySelector('#clear-filters')?.addEventListener('click', this.clearFilters.bind(this));

    // Price range sliders
    this.container.querySelector('#min-price')?.addEventListener('input', this.updatePriceDisplay.bind(this));
    this.container.querySelector('#max-price')?.addEventListener('input', this.updatePriceDisplay.bind(this));

    // Sort dropdown
    this.container.querySelector('#sort-by')?.addEventListener('change', this.handleSortChange.bind(this));

    // Pagination
    this.container.querySelectorAll('.pagination-btn').forEach(btn => {
      btn.addEventListener('click', this.handlePageChange.bind(this));
    });

    // Result actions
    this.container.addEventListener('click', this.handleResultActions.bind(this));
  }

  private async setupLocationAutocomplete(inputId: string, suggestionId: string): Promise<void> {
    const input = this.container.querySelector(`#${inputId}`) as HTMLInputElement;
    const suggestionContainer = this.container.querySelector(`#${suggestionId}`) as HTMLElement;

    if (!input || !suggestionContainer) return;

    let debounceTimer: number;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(async () => {
        const query = input.value.trim();
        if (query.length < 2) {
          suggestionContainer.innerHTML = '';
          suggestionContainer.style.display = 'none';
          return;
        }

        try {
          const suggestions = await advancedSearchService.getLocationSuggestions(query, 8);
          this.renderLocationSuggestions(suggestions, suggestionContainer, input);
        } catch (error) {
          console.error('Failed to fetch location suggestions:', error);
        }
      }, 300);
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target as Node) && !suggestionContainer.contains(e.target as Node)) {
        suggestionContainer.style.display = 'none';
      }
    });
  }

  private renderLocationSuggestions(suggestions: any[], container: HTMLElement, input: HTMLInputElement): void {
    if (suggestions.length === 0) {
      container.innerHTML = '<div class="suggestion-item no-results">No locations found</div>';
      container.style.display = 'block';
      return;
    }

    container.innerHTML = suggestions.map(suggestion => `
      <div class="suggestion-item" data-location="${suggestion.name}">
        <div class="suggestion-content">
          <span class="location-name">${suggestion.name}</span>
          <span class="location-code">${suggestion.code}</span>
          ${suggestion.is_major_hub ? '<span class="hub-badge">Major Hub</span>' : ''}
        </div>
        <div class="suggestion-meta">
          <span class="location-type">${suggestion.location_type}</span>
          ${suggestion.city !== suggestion.name ? `<span class="city">${suggestion.city}</span>` : ''}
        </div>
      </div>
    `).join('');

    container.style.display = 'block';

    // Add click handlers to suggestion items
    container.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const locationName = item.getAttribute('data-location');
        if (locationName) {
          input.value = locationName;
          container.style.display = 'none';
        }
      });
    });
  }

  private async handleSearch(e: Event): Promise<void> {
    e.preventDefault();
    this.updateFiltersFromForm();
    await this.performSearch();
  }

  private updateFiltersFromForm(): void {
    this.filters.from_location = (this.container.querySelector('#from-location') as HTMLInputElement).value;
    this.filters.to_location = (this.container.querySelector('#to-location') as HTMLInputElement).value;
    this.filters.travel_date = (this.container.querySelector('#travel-date') as HTMLInputElement).value;
    this.filters.return_date = (this.container.querySelector('#return-date') as HTMLInputElement).value || undefined;
    this.filters.page = 1; // Reset to first page
  }

  private async performSearch(): Promise<void> {
    if (!this.filters.from_location || !this.filters.to_location || !this.filters.travel_date) {
      alert('Please fill in all required fields');
      return;
    }

    this.isLoading = true;
    this.render(); // Re-render to show loading state

    try {
      const result = await advancedSearchService.advancedSearch(this.filters);
      this.searchResults = result.results;
      this.multiLegResults = result.multi_leg_options || [];
      this.totalResults = result.total;
      this.currentPage = result.page;

      this.render(); // Re-render with results
    } catch (error) {
      console.error('Search failed:', error);
      alert('Search failed. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  private handleTransportToggle(e: Event): void {
    const button = e.target as HTMLButtonElement;
    const transportType = button.getAttribute('data-type');
    
    // Remove active class from all toggles
    this.container.querySelectorAll('.transport-toggle').forEach(toggle => {
      toggle.classList.remove('active');
    });
    
    // Add active class to clicked toggle
    button.classList.add('active');
    
    // Update filter
    this.filters.transport_type = transportType === 'ALL' ? undefined : transportType as any;
  }

  private toggleFilters(): void {
    const panel = this.container.querySelector('#filters-panel') as HTMLElement;
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }

  private applyFilters(): void {
    this.updateFiltersFromPanel();
    this.performSearch();
  }

  private updateFiltersFromPanel(): void {
    // Update filters from the filter panel controls
    const minPrice = (this.container.querySelector('#min-price') as HTMLInputElement).value;
    const maxPrice = (this.container.querySelector('#max-price') as HTMLInputElement).value;
    
    this.filters.min_price = minPrice ? parseFloat(minPrice) : undefined;
    this.filters.max_price = maxPrice ? parseFloat(maxPrice) : undefined;
    
    this.filters.departure_time_start = (this.container.querySelector('#departure-start') as HTMLInputElement).value || undefined;
    this.filters.departure_time_end = (this.container.querySelector('#departure-end') as HTMLInputElement).value || undefined;
    
    this.filters.flexible_dates = (this.container.querySelector('#flexible-dates') as HTMLInputElement).checked;
    this.filters.near_user_location = (this.container.querySelector('#near-location') as HTMLInputElement).checked;
    
    const minRating = (this.container.querySelector('#min-rating') as HTMLSelectElement).value;
    const maxDuration = (this.container.querySelector('#max-duration') as HTMLSelectElement).value;
    
    this.filters.min_rating = minRating ? parseFloat(minRating) : undefined;
    this.filters.max_duration_hours = maxDuration ? parseInt(maxDuration) : undefined;
    
    // Get selected amenities
    const selectedAmenities: string[] = [];
    this.container.querySelectorAll('input[name="amenity"]:checked').forEach((element) => {
      const checkbox = element as HTMLInputElement;
      selectedAmenities.push(checkbox.value);
    });
    this.filters.amenities = selectedAmenities;
  }

  private clearFilters(): void {
    this.filters = createSearchFilters({
      from_location: this.filters.from_location,
      to_location: this.filters.to_location,
      travel_date: this.filters.travel_date
    });
    this.render();
  }

  private updatePriceDisplay(): void {
    const minPrice = (this.container.querySelector('#min-price') as HTMLInputElement).value;
    const maxPrice = (this.container.querySelector('#max-price') as HTMLInputElement).value;
    
    (this.container.querySelector('#min-price-display') as HTMLElement).textContent = `${minPrice} BDT`;
    (this.container.querySelector('#max-price-display') as HTMLElement).textContent = `${maxPrice} BDT`;
  }

  private handleSortChange(e: Event): void {
    const select = e.target as HTMLSelectElement;
    this.filters.sort_by = select.value;
    this.performSearch();
  }

  private handlePageChange(e: Event): void {
    const button = e.target as HTMLButtonElement;
    const page = parseInt(button.getAttribute('data-page') || '1');
    this.filters.page = page;
    this.currentPage = page;
    this.performSearch();
  }

  private handleResultActions(e: Event): void {
    const target = e.target as HTMLElement;
    
    if (target.classList.contains('view-details')) {
      const resultId = target.getAttribute('data-result-id');
      this.viewResultDetails(resultId);
    } else if (target.classList.contains('book-now')) {
      const resultId = target.getAttribute('data-result-id');
      this.bookResult(resultId);
    } else if (target.classList.contains('view-journey')) {
      const journeyId = target.getAttribute('data-journey-id');
      this.viewJourneyDetails(journeyId);
    } else if (target.classList.contains('book-journey') || target.classList.contains('book-separately')) {
      const journeyId = target.getAttribute('data-journey-id');
      this.bookJourney(journeyId);
    }
  }

  private viewResultDetails(resultId: string | null): void {
    if (!resultId) return;
    // Implement result details modal
    console.log('View details for result:', resultId);
  }

  private bookResult(resultId: string | null): void {
    if (!resultId) return;
    const result = this.searchResults.find(r => r.id.toString() === resultId);
    if (result) {
      // Navigate to booking page
      window.location.href = `/booking.html?schedule_id=${result.id}&vehicle_id=${result.vehicle_id}`;
    }
  }

  private viewJourneyDetails(journeyId: string | null): void {
    if (!journeyId) return;
    // Implement journey details modal
    console.log('View journey details:', journeyId);
  }

  private bookJourney(journeyId: string | null): void {
    if (!journeyId) return;
    const journey = this.multiLegResults.find(j => j.journey_id === journeyId);
    if (journey) {
      // Navigate to multi-leg booking page
      console.log('Book journey:', journey);
    }
  }

  private async loadInitialData(): Promise<void> {
    // Load AI suggestions
    try {
      const suggestions = await aiTravelSuggestionService.getPersonalizedSuggestions();
      this.renderAISuggestions(suggestions.slice(0, 5));
    } catch (error) {
      console.error('Failed to load AI suggestions:', error);
    }

    // Get user location for nearby suggestions
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        this.filters.user_latitude = latitude;
        this.filters.user_longitude = longitude;
        
        try {
          await advancedSearchService.getNearbyLocations(latitude, longitude);
          // Nearby locations loaded successfully - can be used for enhanced suggestions
        } catch (error) {
          console.error('Failed to get nearby locations:', error);
        }
      });
    }
  }

  private renderAISuggestions(suggestions: any[]): void {
    const container = this.container.querySelector('#quick-suggestions');
    if (!container) return;

    if (suggestions.length === 0) {
      container.innerHTML = '<p>No suggestions available</p>';
      return;
    }

    container.innerHTML = suggestions.map(suggestion => `
      <div class="suggestion-card" data-suggestion-id="${suggestion.id}">
        <div class="suggestion-header">
          <span class="suggestion-icon">${this.getSuggestionIcon(suggestion.type)}</span>
          <h4>${suggestion.title}</h4>
        </div>
        <p class="suggestion-description">${suggestion.description}</p>
        <div class="suggestion-actions">
          <button class="btn-outline apply-suggestion" data-suggestion-id="${suggestion.id}">
            Apply
          </button>
        </div>
      </div>
    `).join('');

    // Add click handlers for suggestions
    container.querySelectorAll('.apply-suggestion').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const suggestionId = (e.target as HTMLElement).getAttribute('data-suggestion-id');
        this.applySuggestion(suggestionId);
      });
    });
  }

  private getSuggestionIcon(type: string): string {
    const icons: Record<string, string> = {
      'route': '🛣️',
      'destination': '🏖️',
      'offer': '💰',
      'flexible': '📅',
      'nearby': '📍'
    };
    return icons[type] || '💡';
  }

  private applySuggestion(suggestionId: string | null): void {
    if (!suggestionId) return;
    // Find and apply the suggestion
    console.log('Apply suggestion:', suggestionId);
  }

  private getActiveFilterCount(): number {
    let count = 0;
    if (this.filters.transport_type) count++;
    if (this.filters.min_price || this.filters.max_price) count++;
    if (this.filters.departure_time_start || this.filters.departure_time_end) count++;
    if (this.filters.min_rating) count++;
    if (this.filters.max_duration_hours) count++;
    if (this.filters.amenities && this.filters.amenities.length > 0) count++;
    if (this.filters.flexible_dates) count++;
    if (this.filters.near_user_location) count++;
    return count;
  }

  private calculateBookingPressure(available: number, total: number): 'low' | 'medium' | 'high' {
    const percentage = (available / total) * 100;
    if (percentage > 60) return 'low';
    if (percentage > 20) return 'medium';
    return 'high';
  }

  // Public methods for external interaction
  public setSearchParams(params: Partial<AdvancedSearchFilters>): void {
    this.filters = { ...this.filters, ...params };
    this.render();
  }

  public performSearchWithParams(params: Partial<AdvancedSearchFilters>): void {
    this.setSearchParams(params);
    this.performSearch();
  }
}

// Export for use in other components
export default AdvancedSearchComponent;
