// Search Results Page Logic
import { apiService, SearchRequest, TripResult } from '../services/api.ts';
import Utils from '../services/utils.ts';

// Initialize navigation authentication state
async function initializeNavigation() {
  const isAuthenticated = await apiService.isAuthenticated();
  const authContainer = document.getElementById('auth-buttons');
  if (!authContainer) return;

  if (isAuthenticated) {
    const user = Utils.getLocalStorage<{ name: string }>('user');
    authContainer.innerHTML = `
      <a href="./my-bookings.html" class="text-gray-700 hover:text-cyan-600 transition-colors">My Bookings</a>
      <a href="./profile.html" class="text-gray-700 hover:text-cyan-600 transition-colors">${(user && user.name) ? user.name : 'Profile'}</a>
      <button id="logout-btn" class="text-red-600 hover:text-red-700 font-semibold">Logout</button>
    `;

  const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await apiService.logout();
          Utils.showNotification('Logged out successfully', 'success');
          setTimeout(() => {
            Utils.navigateTo('/pages/login.html');
          }, 600);
        } catch (error) {
          Utils.showNotification('Error logging out', 'error');
        }
      });
    }
  } else {
    authContainer.innerHTML = `
      <a href="./login.html" class="text-gray-700 hover:text-cyan-600 transition-colors">Login</a>
      <a href="./signup.html" class="btn btn-gradient px-4 py-2">Sign Up</a>
    `;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM Content Loaded');
  
  // Initialize navigation authentication state
  await initializeNavigation();
  
  // Search lock to prevent duplicate searches
  let isSearching = false;
  let isRendering = false;
  
  const searchForm = document.getElementById('searchForm') as HTMLFormElement;
  const sourceSelect = document.getElementById('source') as HTMLSelectElement;
  const destSelect = document.getElementById('destination') as HTMLSelectElement;
  const dateInput = document.getElementById('travel_date') as HTMLInputElement;
  const vehicleTypeSelect = document.getElementById('vehicle_type') as HTMLSelectElement;
  const resultsContainer = document.getElementById('trip-results') as HTMLElement;
  const filtersContainer = document.getElementById('filters-container') as HTMLElement;
  const paginationContainer = document.getElementById('pagination') as HTMLElement;
  const sortBySelect = document.getElementById('sort-by') as HTMLSelectElement;
  const sourceCityEl = document.getElementById('source-city');
  const destCityEl = document.getElementById('dest-city');
  const travelDateEl = document.getElementById('travel-date');
  const resultsSummaryEl = document.getElementById('results-summary');

  // Set minimum date to today to prevent past date selection
  if (dateInput) {
    dateInput.min = Utils.getTodayDate();
    // If current value is in the past, reset to today
    if (dateInput.value && dateInput.value < Utils.getTodayDate()) {
      dateInput.value = Utils.getTodayDate();
    }
  }

  console.log('Elements found:', {
    searchForm: !!searchForm,
    sourceSelect: !!sourceSelect,
    destSelect: !!destSelect,
    dateInput: !!dateInput,
    vehicleTypeSelect: !!vehicleTypeSelect,
    resultsContainer: !!resultsContainer
  });

  let currentFilters: SearchRequest = {} as SearchRequest;
  let appliedFilters: {
    vehicleType?: string[];
    departureTime?: string;
    operators?: string[];
    priceRange?: { min: number; max: number };
  } = {};
  let allTrips: TripResult[] = [];
  let filteredTrips: TripResult[] = [];
  let displayedTrips: TripResult[] = []; // Track what's actually shown on the page
  let totalPages = 1;
  let currentPage = 1;
  let totalResults = 0;
  let hasFiltersApplied = false; // Track if any filters are active

  // --- Helpers ---
  function getUrlParams(): SearchRequest {
    // First check URL parameters (they take precedence if available)
    const urlParams = new URLSearchParams(window.location.search);
    const hasUrlParams = urlParams.has('source') && urlParams.has('destination');
    
    if (hasUrlParams) {
      return {
        source: urlParams.get('source') || '',
        destination: urlParams.get('destination') || '',
        travel_date: urlParams.get('travel_date') || Utils.getTodayDate(),
        vehicle_type: urlParams.get('vehicle_type') || 'bus',
        sort_by: urlParams.get('sort_by') || 'departure_time_early_late',
        page: parseInt(urlParams.get('page') || '1'),
        limit: 20,
      };
    }
    
    // Fall back to sessionStorage for search data from index.html
    const sessionData = sessionStorage.getItem('searchData');
    if (sessionData) {
      try {
        const searchData = JSON.parse(sessionData);
        
        const searchRequest = {
          source: searchData.source || '',
          destination: searchData.destination || '',
          travel_date: searchData.travel_date || Utils.getTodayDate(),
          vehicle_type: searchData.vehicle_type || 'bus',
          sort_by: 'departure_time_early_late',
          page: 1,
          limit: 20,
        };
        
        return searchRequest;
      } catch (e) {
        console.error('Error parsing session search data:', e);
      }
    }
    
    // Default empty search
    return {
      source: '',
      destination: '',
      travel_date: Utils.getTodayDate(),
      vehicle_type: 'bus',
      sort_by: 'departure_time_early_late',
      page: 1,
      limit: 20,
    };
  }

  function updateUrlFromFilters() {
    const params = new URLSearchParams({
      source: currentFilters.source,
      destination: currentFilters.destination,
      travel_date: currentFilters.travel_date,
      vehicle_type: currentFilters.vehicle_type || 'bus',
      sort_by: currentFilters.sort_by || 'departure_time_early_late',
      page: (currentFilters.page || 1).toString(),
    });
    window.history.replaceState({}, '', `?${params.toString()}`);
  }

  function updateFormFromFilters() {
    if (sourceSelect) sourceSelect.value = currentFilters.source;
    if (destSelect) destSelect.value = currentFilters.destination;
    if (dateInput) {
      // Ensure we don't set a past date
      const today = Utils.getTodayDate();
      if (currentFilters.travel_date && currentFilters.travel_date >= today) {
        dateInput.value = currentFilters.travel_date;
      } else {
        dateInput.value = today;
        currentFilters.travel_date = today; // Update the filter as well
      }
    }
    if (vehicleTypeSelect) vehicleTypeSelect.value = currentFilters.vehicle_type || 'bus';
    if (sortBySelect) sortBySelect.value = currentFilters.sort_by || 'departure_time_early_late';
  }

  function updateHeader() {
    if (sourceCityEl) sourceCityEl.textContent = currentFilters.source;
    if (destCityEl) destCityEl.textContent = currentFilters.destination;
    if (travelDateEl) {
      const date = new Date(currentFilters.travel_date);
        travelDateEl.textContent = date.toLocaleDateString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric'
        });
    }
    if (resultsSummaryEl) {
      if (hasFiltersApplied) {
        // Filters applied, show filtered count of total
        resultsSummaryEl.textContent = `${filteredTrips.length} of ${allTrips.length} results (filtered)`;
      } else {
        // No filters applied, show total available trips
        resultsSummaryEl.textContent = `${allTrips.length} results available`;
      }
    }
  }

  // --- Load Locations ---
  async function loadLocations(vehicleType = 'bus') {
    if (!sourceSelect || !destSelect) {
      console.error('Source or destination select elements not found');
      return;
    }
    
    sourceSelect.innerHTML = '<option value="">Loading locations...</option>';
    destSelect.innerHTML = '<option value="">Loading locations...</option>';
    try {
      const response = await apiService.searchLocations(vehicleType, 100, '');
        if (response.success && response.data) {
        sourceSelect.innerHTML = '<option value="">Select departure location</option>';
        destSelect.innerHTML = '<option value="">Select destination location</option>';
            response.data.forEach(location => {
                const displayName = location.full_name || `${location.name}, ${location.city}`;
                const option = new Option(displayName, location.code);
          sourceSelect.add(option.cloneNode(true) as HTMLOptionElement);
          destSelect.add(option as HTMLOptionElement);
        });
        // Restore selected values
        if (currentFilters.source) sourceSelect.value = currentFilters.source;
        if (currentFilters.destination) destSelect.value = currentFilters.destination;
        } else {
            throw new Error('Failed to load locations');
        }
    } catch (error) {
      sourceSelect.innerHTML = '<option value="">Could not load locations</option>';
      destSelect.innerHTML = '<option value="">Could not load locations</option>';
    }
  }

  // --- Load Filters ---
  async function loadFilters() {
    filtersContainer.innerHTML = '<div class="animate-pulse">Loading filters...</div>';
    
    try {
      // Get unique values from current search results for dynamic filters
      const uniqueOperators = [...new Set(allTrips.map(trip => trip.operator_name).filter(Boolean))];
      const vehicleTypes = [...new Set(allTrips.map(trip => {
        // Extract vehicle type from vehicle amenities or class_prices
        if (trip.amenities && trip.amenities.includes('AC')) return 'AC';
        if (trip.class_prices && typeof trip.class_prices === 'object') {
          const classes = Object.keys(trip.class_prices);
          if (classes.includes('ac')) return 'AC';
          if (classes.includes('non_ac')) return 'Non-AC';
        }
        return 'Non-AC'; // Default
      }))];
      
      const prices = allTrips.map(trip => {
        if (trip.class_prices && typeof trip.class_prices === 'object') {
          const prices = Object.values(trip.class_prices).filter(p => typeof p === 'number' && p > 0);
          return prices.length > 0 ? Math.min(...prices) : 0;
        }
        return 0;
      }).filter(p => p > 0);
      
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 1000;
      
      filtersContainer.innerHTML = `
        <!-- Vehicle Type Filter -->
        <div class="mb-6">
          <h4 class="font-semibold mb-3 text-gray-700 flex items-center">
            <i class="fas fa-car text-blue-600 mr-2"></i>
            Vehicle Type
          </h4>
          <div class="space-y-2">
            ${vehicleTypes.map(type => `
              <label class="flex items-center hover:bg-gray-50 p-2 rounded cursor-pointer">
                <input type="checkbox" class="mr-2 vehicle-type-filter text-blue-600 focus:ring-blue-500" value="${type}" />
                <span class="text-sm">${type}</span>
              </label>
            `).join('')}
          </div>
        </div>
        
        <!-- Departure Time Filter -->
        <div class="mb-6">
          <h4 class="font-semibold mb-3 text-gray-700 flex items-center">
            <i class="fas fa-clock text-green-600 mr-2"></i>
            Departure Time
          </h4>
          <div class="space-y-2">
            <label class="flex items-center hover:bg-gray-50 p-2 rounded cursor-pointer">
              <input type="radio" name="departure-time" class="mr-2 departure-time-filter text-green-600 focus:ring-green-500" value="early-morning" />
              <span class="text-sm">Early Morning (06:00 - 12:00)</span>
            </label>
            <label class="flex items-center hover:bg-gray-50 p-2 rounded cursor-pointer">
              <input type="radio" name="departure-time" class="mr-2 departure-time-filter text-green-600 focus:ring-green-500" value="afternoon" />
              <span class="text-sm">Afternoon (12:00 - 18:00)</span>
            </label>
            <label class="flex items-center hover:bg-gray-50 p-2 rounded cursor-pointer">
              <input type="radio" name="departure-time" class="mr-2 departure-time-filter text-green-600 focus:ring-green-500" value="evening" />
              <span class="text-sm">Evening (18:00 - 24:00)</span>
            </label>
            <label class="flex items-center hover:bg-gray-50 p-2 rounded cursor-pointer">
              <input type="radio" name="departure-time" class="mr-2 departure-time-filter text-green-600 focus:ring-green-500" value="night" />
              <span class="text-sm">Night (00:00 - 06:00)</span>
            </label>
          </div>
        </div>
        
        <!-- Transport Operators Filter -->
        <div class="mb-6">
          <h4 class="font-semibold mb-3 text-gray-700 flex items-center">
            <i class="fas fa-building text-purple-600 mr-2"></i>
            Transport Operators
          </h4>
          <div class="space-y-2 max-h-40 overflow-y-auto">
            ${uniqueOperators.map(operator => `
              <label class="flex items-center hover:bg-gray-50 p-2 rounded cursor-pointer">
                <input type="checkbox" class="mr-2 operator-filter text-purple-600 focus:ring-purple-500" value="${operator}" />
                <span class="text-sm">${operator}</span>
              </label>
            `).join('')}
          </div>
        </div>
        
        <!-- Price Range Filter -->
        <div class="mb-6">
          <h4 class="font-semibold mb-3 text-gray-700 flex items-center">
            <i class="fas fa-money-bill-wave text-orange-600 mr-2"></i>
            Price Range
          </h4>
          <div class="space-y-3">
            <div class="flex items-center space-x-2">
              <input type="number" id="min-price" min="0" max="${maxPrice}" value="${minPrice}" 
                     class="w-20 px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" placeholder="Min" />
              <span class="text-sm text-gray-500">to</span>
              <input type="number" id="max-price" min="0" max="${maxPrice}" value="${maxPrice}"
                     class="w-20 px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" placeholder="Max" />
            </div>
            <div class="flex justify-between text-xs text-gray-500">
              <span>৳${minPrice}</span>
              <span>৳${maxPrice}</span>
            </div>
          </div>
        </div>
        
        <!-- Apply Filters Button -->
        <button id="apply-filters-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-semibold transition-colors shadow-md hover:shadow-lg">
          <i class="fas fa-filter mr-2" aria-hidden="true"></i>
          <span>Apply Filters</span>
        </button>
      `;
      
      // Attach filter event listeners
      attachFilterListeners();
      updateFilterCounter();
      
    } catch (error) {
      console.error('Error loading filters:', error);
      filtersContainer.innerHTML = '<div class="text-red-500 text-sm">Failed to load filters.</div>';
    }
  }

  // --- Render Results ---
  function renderResults(trips: TripResult[]) {
    if (isRendering) {
      console.warn('renderResults already in progress, skipping...');
      return;
    }
    
    isRendering = true;
    displayedTrips = trips; // Track what's actually being displayed
    console.log(`renderResults called with ${trips.length} trips`);
    
    // Add a stack trace to see where this is being called from
    console.trace('renderResults call stack');
    
    if (trips.length === 0) {
      resultsContainer.innerHTML = '<p class="text-center text-gray-500 py-8">No trips found for your search criteria</p>';
      isRendering = false;
      return;
    }
    
    // Clear the container and render trips
    console.log('Clearing results container and rendering new trips');
    resultsContainer.innerHTML = trips.map(trip => createTripCard(trip)).join('');
    console.log('Results rendered successfully');
    
    // Reset the flag with a small delay to prevent rapid successive calls
    setTimeout(() => {
      isRendering = false;
    }, 100);
  }

  function createTripCard(trip: TripResult): string {
    const departureTime = Utils.formatTime(trip.departure_time);
    const arrivalTime = Utils.formatTime(trip.arrival_time);
    
    // Use schedule price if available (admin-set price), otherwise use class prices
    let lowestPrice = 0;
    if (trip.schedule_price && trip.schedule_price > 0) {
      // Use admin-set schedule price as the base price
      lowestPrice = trip.schedule_price;
    } else if (trip.class_prices && typeof trip.class_prices === 'object') {
      // Fallback to class prices if no schedule price
      const prices = Object.values(trip.class_prices).filter(p => typeof p === 'number' && p > 0);
      lowestPrice = prices.length > 0 ? Math.min(...prices) : 0;
    }
    const price = Utils.formatCurrency(lowestPrice);
    
    // Fix: Avoid 'undefined' and '[object Object]' issues
    const operatorName = trip.operator_name || 'Unknown Operator';
    const vehicleName = trip.vehicle_name || '';
    const vehicleNumber = trip.vehicle_number || '';
    
    // Fix: Handle available_seats using dynamic seat count from admin settings
    let availableSeats = 0;
    if (trip.total_seats && typeof trip.total_seats === 'number') {
      // Use dynamic seat count from admin settings
      availableSeats = trip.total_seats;
      
      // Subtract booked seats if available
      if (typeof trip.available_seats === 'object' && trip.available_seats !== null) {
        const bookedSeats = Object.values(trip.available_seats)
          .map((cls: any) => cls.booked || 0)
          .reduce((a: number, b: number) => a + b, 0);
        availableSeats = Math.max(0, trip.total_seats - bookedSeats);
      }
    } else if (typeof trip.available_seats === 'number') {
      availableSeats = trip.available_seats;
    } else if (typeof trip.available_seats === 'object' && trip.available_seats !== null) {
      availableSeats = Object.values(trip.available_seats)
        .map((cls: any) => cls.available || 0)
        .reduce((a: number, b: number) => a + b, 0);
    }
    
    // Handle amenities/facilities
    const amenities = Array.isArray(trip.amenities) ? trip.amenities : [];
    
    return `
      <div class="bg-white/90 glass-card rounded-lg shadow p-6 hover:shadow-lg transition-shadow trip-card card-animated">
        <div class="flex justify-between items-start mb-4">
          <div class="flex-1">
            <div class="flex items-center gap-4 mb-2">
              <h3 class="text-lg font-semibold text-gray-800">${operatorName}</h3>
              ${vehicleName ? `<span class="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">${vehicleName}</span>` : ''}
              ${vehicleNumber ? `<span class="text-xs text-gray-500">${vehicleNumber}</span>` : ''}
            </div>
            <p class="text-sm text-gray-600">
              <i class="fas fa-map-marker-alt text-blue-500 mr-1" aria-hidden="true"></i>
              ${trip.source_name} 
              <i class="fas fa-arrow-right mx-2 text-gray-400" aria-hidden="true"></i> 
              ${trip.destination_name}
            </p>
          </div>
          <div class="text-right">
            <div class="text-2xl font-bold text-blue-600">${price}</div>
            <div class="text-sm text-gray-500">starts from</div>
          </div>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-center">
          <div class="bg-gray-50 p-3 rounded">
            <div class="text-xs text-gray-500 mb-1">Departure</div>
            <div class="font-semibold text-gray-800">${departureTime}</div>
          </div>
          <div class="bg-gray-50 p-3 rounded">
            <div class="text-xs text-gray-500 mb-1">Arrival</div>
            <div class="font-semibold text-gray-800">${arrivalTime}</div>
          </div>
          <div class="bg-gray-50 p-3 rounded">
            <div class="text-xs text-gray-500 mb-1">Duration</div>
            <div class="font-semibold text-gray-800">${trip.duration || 'N/A'}</div>
          </div>
          <div class="bg-gray-50 p-3 rounded">
            <div class="text-xs text-gray-500 mb-1">Available Seats</div>
            <div class="font-semibold ${availableSeats > 0 ? 'text-green-600' : 'text-red-600'}">${availableSeats}</div>
          </div>
        </div>
        
        ${amenities.length > 0 ? `
        <div class="mb-4">
          <div class="text-xs text-gray-500 mb-2">Amenities</div>
          <div class="flex flex-wrap gap-2">
            ${amenities.map((facility: string) => `
              <span class="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">${facility}</span>
            `).join('')}
          </div>
        </div>
        ` : ''}
        
        <div class="flex items-center justify-between pt-4 border-t border-gray-100">
          <div class="text-sm text-gray-600">
            <i class="fas fa-star text-yellow-400 mr-1" aria-hidden="true"></i>
            ${trip.rating || 'No rating'} | ${trip.total_reviews || 0} reviews
          </div>
          <button 
            data-trip-id="${trip.id}"
            data-vehicle-id="${trip.vehicle_id}"
            data-schedule-id="${trip.id}"
            data-travel-date="${currentFilters.travel_date}"
            class="book-now-btn bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2"
            aria-label="View seats for ${operatorName} ${vehicleName ? '(' + vehicleName + ')' : ''}">
            <i class="fas fa-eye" aria-hidden="true"></i>
            <span>View Seats</span>
          </button>
        </div>
      </div>
    `;
  }

  // --- Event Delegation for View Seats ---
  resultsContainer.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('book-now-btn') || target.closest('.book-now-btn')) {
      const btn = target.classList.contains('book-now-btn') ? target : target.closest('.book-now-btn');
      const vehicleId = btn?.getAttribute('data-vehicle-id');
      const scheduleId = btn?.getAttribute('data-schedule-id');
      const travelDate = btn?.getAttribute('data-travel-date');
      
      if (vehicleId && travelDate) {
        // Find the trip data for this selection to store schedule information
        const tripId = btn?.getAttribute('data-trip-id');
        const selectedTrip = allTrips.find((trip: TripResult) => trip.id.toString() === tripId);
        
        if (selectedTrip) {
          // Store the complete schedule information for the confirmation page
          const scheduleData = {
            id: selectedTrip.id,
            vehicle_id: selectedTrip.vehicle_id,
            source_name: selectedTrip.source_name,
            destination_name: selectedTrip.destination_name,
            departure_time: selectedTrip.departure_time,
            arrival_time: selectedTrip.arrival_time,
            duration: selectedTrip.duration,
            operator_name: selectedTrip.operator_name,
            vehicle_name: selectedTrip.vehicle_name,
            vehicle_number: selectedTrip.vehicle_number,
            travel_date: travelDate,
            // Also store formatted travel date for display
            formatted_travel_date: Utils.formatDate(travelDate)
          };
          
          Utils.setLocalStorage('selectedSchedule', scheduleData);
          console.log('Stored selected schedule:', scheduleData);
        }
        
        // Navigate to booking page with parameters
        const params = new URLSearchParams({
          vehicle_id: vehicleId,
          schedule_id: scheduleId || '',
          date: travelDate
        });
        Utils.navigateTo(`booking.html?${params.toString()}`);
      } else {
        Utils.showNotification('Invalid booking details', 'error');
      }
    }
  });

  // --- Pagination ---
  function renderPagination() {
    if (totalPages <= 1) {
      paginationContainer.innerHTML = '';
      return;
    }
    let pagesHtml = '';
    pagesHtml += `
      <button id="prev-btn" ${currentPage === 1 ? 'disabled' : ''} 
              class="px-3 py-1 border rounded ${currentPage === 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'hover:bg-blue-600 hover:text-white'} transition">
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
        <span class="sr-only">Previous page</span>
      </button>
    `;
    for (let i = 1; i <= totalPages; i++) {
      pagesHtml += `
        <button data-page="${i}" 
                class="page-btn px-3 py-1 border rounded ${i === currentPage ? 'bg-blue-600 text-white' : 'hover:bg-blue-600 hover:text-white'} transition">
          ${i}
        </button>
      `;
    }
    pagesHtml += `
      <button id="next-btn" ${currentPage === totalPages ? 'disabled' : ''} 
              class="px-3 py-1 border rounded ${currentPage === totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'hover:bg-blue-600 hover:text-white'} transition">
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
        <span class="sr-only">Next page</span>
      </button>
    `;
    paginationContainer.innerHTML = `<div class="flex items-center gap-2">${pagesHtml}</div>`;
  }

  // --- Perform Search ---
  async function performSearch() {
    if (!resultsContainer) {
      console.error('Results container not found');
      return;
    }
    
    if (isSearching) {
      console.log('Search already in progress, skipping...');
      return;
    }
    
    isSearching = true;
    console.log('Starting search with filters:', currentFilters);
    
    // Validate search parameters
    if (!currentFilters.source || !currentFilters.destination) {
      console.error('Missing source or destination for search');
      resultsContainer.innerHTML = '<p class="text-center text-gray-500 py-8">Please select both source and destination to search for trips.</p>';
      isSearching = false;
      return;
    }
    
    Utils.showLoading(resultsContainer, 'Searching for trips...');
    try {
      // Get results for filtering, using small limit for debugging
      const searchFilters = { ...currentFilters, limit: 20, page: 1 };
      console.log('Search filters:', searchFilters);
      
      const response = await apiService.searchTrips(searchFilters);
      console.log('Search response:', response);
      
      if (response.success && response.data) {
        // Store all trips for filtering and deduplicate by schedule ID
        console.log('Raw trips from API:', response.data.trips.length);
        allTrips = response.data.trips;
        
        // Log first few trips to debug
        allTrips.slice(0, 3).forEach((trip, index) => {
          console.log(`Trip ${index}: ID=${trip.id}, Vehicle=${trip.vehicle_id}, Operator=${trip.operator_name}, Source=${trip.source_name}, Dest=${trip.destination_name}, Departure=${trip.departure_time}`);
        });
        
        // Comprehensive deduplication based on multiple fields
        const seenTrips = new Set();
        const originalLength = allTrips.length;
        allTrips = allTrips.filter(trip => {
          // Create a unique key based on multiple trip characteristics
          const tripKey = `${trip.vehicle_id}-${trip.source_name}-${trip.destination_name}-${trip.departure_time}-${trip.arrival_time}`;
          
          if (seenTrips.has(tripKey)) {
            console.warn(`Duplicate trip found: ID=${trip.id}, Key=${tripKey}, Operator=${trip.operator_name}`);
            return false;
          }
          seenTrips.add(tripKey);
          return true;
        });
        
        console.log(`Comprehensive deduplication: ${originalLength} -> ${allTrips.length} trips (removed ${originalLength - allTrips.length} duplicates)`);
        
        console.log(`After deduplication: ${allTrips.length} unique trips`);
        filteredTrips = [...allTrips];
        hasFiltersApplied = false; // No filters applied initially
        
        totalResults = allTrips.length; // Use deduplicated count
        totalPages = Math.ceil(totalResults / (currentFilters.limit || 20));
        currentPage = currentFilters.page || 1;
        
        // Apply pagination to filtered results
        const startIndex = (currentPage - 1) * (currentFilters.limit || 20);
        const endIndex = startIndex + (currentFilters.limit || 20);
        const paginatedTrips = filteredTrips.slice(startIndex, endIndex);
        
        renderResults(paginatedTrips);
        renderPagination();
        updateHeader();
        showFilteredResultsInfo(); // Update the count display
        
        // Load filters after getting results
        await loadFilters();
        
      } else {
        resultsContainer.innerHTML = `<p class="text-center text-gray-500 py-8">${response.error || 'No trips found for the selected criteria.'}</p>`;
        filtersContainer.innerHTML = '<div class="text-gray-500 text-sm">No filters available</div>';
      }
    } catch (error) {
      console.error('Search error:', error);
      resultsContainer.innerHTML = '<p class="text-center text-red-500 py-8">Error loading results. Please try again later.</p>';
      filtersContainer.innerHTML = '<div class="text-red-500 text-sm">Error loading filters</div>';
    } finally {
      Utils.hideLoading(resultsContainer);
      isSearching = false;
      console.log('Search completed, lock released');
    }
  }

  // --- Sorting Functions ---
  function sortTrips(trips: TripResult[], sortBy: string): TripResult[] {
    const sorted = [...trips]; // Create a copy to avoid mutating the original array
    
    switch (sortBy) {
      case 'price_low_high':
        return sorted.sort((a, b) => getTripMinPrice(a) - getTripMinPrice(b));
      
      case 'price_high_low':
        return sorted.sort((a, b) => getTripMinPrice(b) - getTripMinPrice(a));
      
      case 'rating_high_low':
        return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      
      case 'departure_time_early_late':
        return sorted.sort((a, b) => {
          const timeA = convertTimeToMinutes(a.departure_time);
          const timeB = convertTimeToMinutes(b.departure_time);
          return timeA - timeB;
        });
      
      case 'departure_time_late_early':
        return sorted.sort((a, b) => {
          const timeA = convertTimeToMinutes(a.departure_time);
          const timeB = convertTimeToMinutes(b.departure_time);
          return timeB - timeA;
        });
      
      case 'duration_short_long':
        return sorted.sort((a, b) => {
          const durationA = convertDurationToMinutes(a.duration);
          const durationB = convertDurationToMinutes(b.duration);
          return durationA - durationB;
        });
      
      case 'duration_long_short':
        return sorted.sort((a, b) => {
          const durationA = convertDurationToMinutes(a.duration);
          const durationB = convertDurationToMinutes(b.duration);
          return durationB - durationA;
        });
      
      default:
        // Default to departure time early to late
        return sorted.sort((a, b) => {
          const timeA = convertTimeToMinutes(a.departure_time);
          const timeB = convertTimeToMinutes(b.departure_time);
          return timeA - timeB;
        });
    }
  }
  
  function convertTimeToMinutes(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }
  
  function convertDurationToMinutes(durationString: string): number {
    // Handle different duration formats like "6h 30m", "6:30", "390 minutes", etc.
    if (durationString.includes('h') && durationString.includes('m')) {
      // Format: "6h 30m"
      const hours = parseInt(durationString.split('h')[0].trim());
      const minutes = parseInt(durationString.split('h')[1].replace('m', '').trim());
      return hours * 60 + minutes;
    } else if (durationString.includes(':')) {
      // Format: "6:30"
      const [hours, minutes] = durationString.split(':').map(Number);
      return hours * 60 + minutes;
    } else if (durationString.includes('minute')) {
      // Format: "390 minutes"
      return parseInt(durationString.replace(/\D/g, ''));
    } else {
      // Try to extract numbers and assume it's in minutes
      const numbers = durationString.match(/\d+/g);
      if (numbers && numbers.length >= 2) {
        // Assume first number is hours, second is minutes
        return parseInt(numbers[0]) * 60 + parseInt(numbers[1]);
      } else if (numbers && numbers.length === 1) {
        // Assume it's total minutes
        return parseInt(numbers[0]);
      }
    }
    return 0; // Default fallback
  }

  // --- Filter Functions ---
  function attachFilterListeners() {
    // Apply filters button
    const applyBtn = document.getElementById('apply-filters-btn');
    if (applyBtn) {
      applyBtn.addEventListener('click', applyFilters);
    }
    
    // Auto-apply filters when checkboxes change
    const filterInputs = filtersContainer.querySelectorAll('input[type="checkbox"], input[type="radio"]');
    filterInputs.forEach(input => {
      input.addEventListener('change', () => {
        applyFilters();
        updateFilterCounter();
      });
    });
    
    // Price range inputs
    const minPriceInput = document.getElementById('min-price') as HTMLInputElement;
    const maxPriceInput = document.getElementById('max-price') as HTMLInputElement;
    
    if (minPriceInput && maxPriceInput) {
      minPriceInput.addEventListener('input', () => {
        applyFilters();
        updateFilterCounter();
      });
      maxPriceInput.addEventListener('input', () => {
        applyFilters();
        updateFilterCounter();
      });
    }
  }
  
  function applyFilters() {
    // Get selected vehicle types
    const vehicleTypes = Array.from(document.querySelectorAll('.vehicle-type-filter:checked'))
      .map(input => (input as HTMLInputElement).value);
    
    // Get selected departure time
    const departureTime = (document.querySelector('.departure-time-filter:checked') as HTMLInputElement)?.value;
    
    // Get selected operators
    const operators = Array.from(document.querySelectorAll('.operator-filter:checked'))
      .map(input => (input as HTMLInputElement).value);
    
    // Get price range
    const minPrice = parseInt((document.getElementById('min-price') as HTMLInputElement)?.value || '0');
    const maxPrice = parseInt((document.getElementById('max-price') as HTMLInputElement)?.value || '999999');
    
    // Get the actual price range from the data for comparison
    const prices = allTrips.map(trip => getTripMinPrice(trip)).filter(p => p > 0);
    const actualMinPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const actualMaxPrice = prices.length > 0 ? Math.max(...prices) : 1000;
    
    // Check if any filters are applied
    hasFiltersApplied = vehicleTypes.length > 0 || 
                      !!departureTime || 
                      operators.length > 0 || 
                      minPrice > actualMinPrice || 
                      maxPrice < actualMaxPrice;
    
    // Update applied filters
    appliedFilters = {
      vehicleType: vehicleTypes.length > 0 ? vehicleTypes : undefined,
      departureTime: departureTime || undefined,
      operators: operators.length > 0 ? operators : undefined,
      priceRange: { min: minPrice, max: maxPrice }
    };
    
    // Apply filters to trips
    filteredTrips = allTrips.filter(trip => {
      // Vehicle type filter
      if (appliedFilters.vehicleType && appliedFilters.vehicleType.length > 0) {
        const tripVehicleType = getTripVehicleType(trip);
        if (!appliedFilters.vehicleType.includes(tripVehicleType)) {
          return false;
        }
      }
      
      // Departure time filter
      if (appliedFilters.departureTime) {
        const tripHour = parseInt(trip.departure_time.split(':')[0]);
        const timeSlot = getTimeSlot(tripHour);
        if (timeSlot !== appliedFilters.departureTime) {
          return false;
        }
      }
      
      // Operators filter
      if (appliedFilters.operators && appliedFilters.operators.length > 0) {
        if (!appliedFilters.operators.includes(trip.operator_name)) {
          return false;
        }
      }
      
      // Price range filter
      if (appliedFilters.priceRange) {
        const tripPrice = getTripMinPrice(trip);
        if (tripPrice < appliedFilters.priceRange.min || tripPrice > appliedFilters.priceRange.max) {
          return false;
        }
      }
      
      return true;
    });
    
    // Apply sorting to filtered results
    const sortBy = sortBySelect?.value || 'departure_time_early_late';
    filteredTrips = sortTrips(filteredTrips, sortBy);
    
    // Update pagination based on filtered results
    currentPage = 1;
    
    // Render filtered results
    const startIndex = (currentPage - 1) * (currentFilters.limit || 20);
    const endIndex = startIndex + (currentFilters.limit || 20);
    const paginatedTrips = filteredTrips.slice(startIndex, endIndex);
    
    renderResults(paginatedTrips);
    updateHeader();
    renderPagination();
    updateFilterCounter();
    showFilteredResultsInfo(); // Show filtered results information
  }
  
  function getTripVehicleType(trip: TripResult): string {
    // Check amenities for AC (case-insensitive)
    if (trip.amenities && trip.amenities.some(amenity => amenity.toLowerCase() === 'ac')) {
      return 'AC';
    }
    
    // Check class_prices for AC/Non-AC categories
    if (trip.class_prices && typeof trip.class_prices === 'object') {
      const classes = Object.keys(trip.class_prices);
      if (classes.includes('ac')) return 'AC';
      if (classes.includes('non_ac')) return 'Non-AC';
    }
    
    return 'Non-AC';
  }
  
  function getTripMinPrice(trip: TripResult): number {
    if (trip.class_prices && typeof trip.class_prices === 'object') {
      const prices = Object.values(trip.class_prices).map(Number);
      return Math.min(...prices);
    }
    return 0;
  }

  function getTimeSlot(hour: number): string {
    if (hour >= 6 && hour < 12) return 'early-morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 24) return 'evening';
    return 'night';
  }
  
  function clearAllFilters() {
    // Reset all filter inputs
    const filterInputs = filtersContainer.querySelectorAll('input[type="checkbox"], input[type="radio"]');
    filterInputs.forEach(input => {
      (input as HTMLInputElement).checked = false;
    });
    
    // Reset price inputs
    const minPriceInput = document.getElementById('min-price') as HTMLInputElement;
    const maxPriceInput = document.getElementById('max-price') as HTMLInputElement;
    
    if (minPriceInput && maxPriceInput) {
      const prices = allTrips.map(trip => getTripMinPrice(trip)).filter(p => p > 0);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 1000;
      
      minPriceInput.value = minPrice.toString();
      maxPriceInput.value = maxPrice.toString();
    }
    
    // Reset applied filters
    appliedFilters = {};
    hasFiltersApplied = false; // Reset filters flag
    
    // Show all results
    filteredTrips = [...allTrips];
    // totalResults should remain as allTrips.length (don't change it here)
    totalPages = Math.ceil(allTrips.length / (currentFilters.limit || 20));
    currentPage = 1;
    
    // Render all results
    const startIndex = (currentPage - 1) * (currentFilters.limit || 20);
    const endIndex = startIndex + (currentFilters.limit || 20);
    const paginatedTrips = filteredTrips.slice(startIndex, endIndex);
    
    renderResults(paginatedTrips);
    updateHeader();
    renderPagination();
    updateFilterCounter();
    showFilteredResultsInfo(); // Update count display
  }
  
  function updateFilterCounter() {
    const activeFiltersCount = getActiveFiltersCount();
    const clearBtn = document.getElementById('clear-filters-btn');
    if (clearBtn) {
      if (activeFiltersCount > 0) {
        clearBtn.textContent = `Clear All (${activeFiltersCount})`;
        clearBtn.classList.remove('text-gray-400');
        clearBtn.classList.add('text-red-600');
      } else {
        clearBtn.textContent = 'Clear All';
        clearBtn.classList.remove('text-red-600');
        clearBtn.classList.add('text-gray-400');
      }
    }
  }
  
  function getActiveFiltersCount(): number {
    let count = 0;
    
    // Count vehicle type filters
    const vehicleTypeFilters = document.querySelectorAll('.vehicle-type-filter:checked');
    count += vehicleTypeFilters.length;
    
    // Count departure time filter
    const departureTimeFilter = document.querySelector('.departure-time-filter:checked');
    if (departureTimeFilter) count++;
    
    // Count operator filters
    const operatorFilters = document.querySelectorAll('.operator-filter:checked');
    count += operatorFilters.length;
    
    // Count price range filter (if changed from default)
    const minPriceInput = document.getElementById('min-price') as HTMLInputElement;
    const maxPriceInput = document.getElementById('max-price') as HTMLInputElement;
    
    if (minPriceInput && maxPriceInput) {
      const prices = allTrips.map(trip => getTripMinPrice(trip)).filter(p => p > 0);
      const defaultMin = prices.length > 0 ? Math.min(...prices) : 0;
      const defaultMax = prices.length > 0 ? Math.max(...prices) : 1000;
      
      if (parseInt(minPriceInput.value) !== defaultMin || parseInt(maxPriceInput.value) !== defaultMax) {
        count++;
      }
    }
    
    return count;
  }
  
  function showFilteredResultsInfo() {
    const resultsCountEl = document.getElementById('results-count');
    if (resultsCountEl) {
      console.log(`Count Update - hasFiltersApplied: ${hasFiltersApplied}, displayedTrips: ${displayedTrips.length}, filteredTrips: ${filteredTrips.length}, allTrips: ${allTrips.length}`);
      
      if (hasFiltersApplied) {
        // Filters applied - show what's displayed vs filtered total vs all total
        resultsCountEl.textContent = `Showing ${displayedTrips.length} of ${filteredTrips.length} filtered results (${allTrips.length} total)`;
      } else {
        // No filters - show what's displayed vs total available
        resultsCountEl.textContent = `Showing ${displayedTrips.length} of ${allTrips.length} results`;
      }
    }
  }
  
  // --- Global Functions (accessible from HTML) ---
  (window as any).clearAllFilters = clearAllFilters;
  (window as any).sortResults = () => {
    // Apply sorting to current filtered results
    applyFilters();
  };

  // --- Event Listeners ---
  if (searchForm) {
    searchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      currentFilters = {
        source: sourceSelect?.value || '',
        destination: destSelect?.value || '',
        travel_date: dateInput?.value || '',
        vehicle_type: vehicleTypeSelect?.value || 'bus',
        sort_by: sortBySelect?.value || 'departure_time_early_late',
        page: 1,
        limit: 20,
      };
      updateUrlFromFilters();
      await performSearch();
    });
  } else {
    console.warn('searchForm not found');
  }

  if (vehicleTypeSelect) {
    vehicleTypeSelect.addEventListener('change', async () => {
      await loadLocations(vehicleTypeSelect.value);
    });
  } else {
    console.warn('vehicleTypeSelect not found');
  }

  if (sortBySelect) {
    sortBySelect.addEventListener('change', () => {
      // Apply sorting to current filtered results
      applyFilters();
    });
  } else {
    console.warn('sortBySelect not found');
  }

  if (paginationContainer) {
    paginationContainer.addEventListener('click', async (e) => {
      const target = (e.target as HTMLElement);
      if (target.closest('.page-btn')) {
        e.preventDefault();
        const page = parseInt(target.closest('.page-btn')?.getAttribute('data-page') || '1');
        if (page !== currentPage) {
          currentPage = page;
          // Apply pagination to filtered results
          const startIndex = (currentPage - 1) * (currentFilters.limit || 20);
          const endIndex = startIndex + (currentFilters.limit || 20);
          const paginatedTrips = filteredTrips.slice(startIndex, endIndex);
          renderResults(paginatedTrips);
          renderPagination();
          showFilteredResultsInfo(); // Update count display
        }
      } else if (target.closest('#prev-btn')) {
        e.preventDefault();
        if (currentPage > 1) {
          currentPage = currentPage - 1;
          const startIndex = (currentPage - 1) * (currentFilters.limit || 20);
          const endIndex = startIndex + (currentFilters.limit || 20);
          const paginatedTrips = filteredTrips.slice(startIndex, endIndex);
          renderResults(paginatedTrips);
          renderPagination();
          showFilteredResultsInfo(); // Update count display
        }
      } else if (target.closest('#next-btn')) {
        e.preventDefault();
        if (currentPage < totalPages) {
          currentPage = currentPage + 1;
          const startIndex = (currentPage - 1) * (currentFilters.limit || 20);
          const endIndex = startIndex + (currentFilters.limit || 20);
          const paginatedTrips = filteredTrips.slice(startIndex, endIndex);
          renderResults(paginatedTrips);
          renderPagination();
          showFilteredResultsInfo(); // Update count display
        }
      }
    });
  } else {
    console.warn('paginationContainer not found');
  }

  // Clear filters button
  const clearFiltersBtn = document.getElementById('clear-filters-btn');
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', (e) => {
      e.preventDefault();
      clearAllFilters();
    });
  }
  
  // --- Initial Load ---
  (async function init() {
    currentFilters = getUrlParams();
    
    // Update URL with search parameters to preserve them during navigation
    updateUrlFromFilters();
    
    await loadLocations(currentFilters.vehicle_type);
    updateFormFromFilters();
    await performSearch(); // This will call loadFilters after getting results
  })();
});