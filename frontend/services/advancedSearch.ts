export interface TransportType {
  BUS: 'BUS';
  TRAIN: 'PLANE';
  PLANE: 'PLANE';
  ALL: 'ALL';
}

export interface SeatClass {
  ECONOMY: 'ECONOMY';
  BUSINESS: 'BUSINESS';
  FIRST: 'FIRST';
  AC: 'AC';
  NON_AC: 'NON_AC';
  SLEEPER: 'SLEEPER';
  SHOVON: 'SHOVON';
}

export interface LocationSuggestion {
  id: number;
  name: string;
  code: string;
  city: string;
  state?: string;
  location_type: string;
  aliases?: string[];
  is_major_hub: boolean;
  latitude?: number;
  longitude?: number;
}

export interface AdvancedSearchFilters {
  from_location: string;
  to_location: string;
  travel_date: string;
  return_date?: string;
  transport_type?: keyof TransportType;
  seat_class?: keyof SeatClass;
  min_price?: number;
  max_price?: number;
  departure_time_start?: string;
  departure_time_end?: string;
  arrival_time_start?: string;
  arrival_time_end?: string;
  max_duration_hours?: number;
  min_rating?: number;
  amenities?: string[];
  flexible_dates: boolean;
  flexible_date_range: number;
  sort_by: string;
  page: number;
  per_page: number;
  near_user_location: boolean;
  user_latitude?: number;
  user_longitude?: number;
  max_distance_km?: number;
}

export interface SearchResult {
  id: number;
  vehicle_id: number;
  vehicle_number: string;
  vehicle_name: string;
  transport_type: string;
  operator_name: string;
  from_location: string;
  to_location: string;
  departure_time: string;
  arrival_time: string;
  duration: number;
  distance_km?: number;
  available_classes: Record<string, { price: number; available: number }>;
  base_price: number;
  current_price: number;
  discount_percentage?: number;
  total_seats: number;
  available_seats: number;
  rating?: number;
  total_reviews: number;
  amenities: string[];
  alternative_dates?: Array<{ date: string; price: number }>;
  is_direct: boolean;
  total_legs: number;
  layover_duration?: number;
}

export interface MultiLegSearchResult {
  journey_id: string;
  origin: string;
  destination: string;
  total_duration: number;
  total_distance?: number;
  total_cost: number;
  total_legs: number;
  legs: SearchResult[];
  layovers: Array<{
    location: string;
    duration_minutes: number;
    facilities: string[];
  }>;
  requires_separate_bookings: boolean;
  can_book_together: boolean;
}

export interface DynamicPricing {
  vehicle_id: number;
  seat_class: string;
  base_price: number;
  current_price: number;
  demand_factor: number;
  time_factor: number;
  seasonal_factor: number;
  day_of_week_factor: number;
  price_trend: 'increasing' | 'decreasing' | 'stable';
  predicted_tomorrow?: number;
  cheapest_day_this_week?: string;
  book_now_recommended: boolean;
  reason?: string;
}

export interface NearbyLocation {
  location: LocationSuggestion;
  distance_km: number;
  travel_time_minutes?: number;
  available_routes: number;
  cheapest_price?: number;
}

export class AdvancedSearchService {
  // Location autocomplete with smart suggestions
  async getLocationSuggestions(query: string, limit: number = 10): Promise<LocationSuggestion[]> {
    const response = await fetch(`/api/search/locations/suggestions?q=${encodeURIComponent(query)}&limit=${limit}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    return data.suggestions || [];
  }

  // Advanced search with all filters
  async advancedSearch(filters: AdvancedSearchFilters): Promise<{
    results: SearchResult[];
    total: number;
    page: number;
    per_page: number;
    multi_leg_options?: MultiLegSearchResult[];
    nearby_alternatives?: NearbyLocation[];
  }> {
    const response = await fetch('/api/search/advanced', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(filters)
    });
    return await response.json();
  }

  // Get dynamic pricing information
  async getDynamicPricing(vehicleId: number, seatClass: string, travelDate: string): Promise<DynamicPricing> {
    const response = await fetch(`/api/pricing/dynamic/${vehicleId}?seat_class=${seatClass}&travel_date=${travelDate}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    return await response.json();
  }

  // Get price predictions and trends
  async getPriceTrends(fromLocation: string, toLocation: string, dateRange: number = 30): Promise<{
    historical_prices: Array<{ date: string; price: number }>;
    predicted_prices: Array<{ date: string; predicted_price: number; confidence: number }>;
    cheapest_days: string[];
    price_alerts: Array<{ message: string; type: 'info' | 'warning' | 'success' }>;
  }> {
    const response = await fetch(`/api/pricing/trends?from_location=${encodeURIComponent(fromLocation)}&to_location=${encodeURIComponent(toLocation)}&date_range=${dateRange}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    return await response.json();
  }

  // Get nearby locations based on user's position
  async getNearbyLocations(
    latitude: number, 
    longitude: number, 
    radius: number = 50
  ): Promise<NearbyLocation[]> {
    const response = await fetch(`/api/search/nearby?latitude=${latitude}&longitude=${longitude}&radius=${radius}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    return data.nearby_locations || [];
  }

  // Multi-leg journey planning
  async findMultiLegJourneys(
    fromLocation: string,
    toLocation: string,
    travelDate: string,
    maxLegs: number = 3
  ): Promise<MultiLegSearchResult[]> {
    const response = await fetch(`/api/search/multi-leg?from_location=${encodeURIComponent(fromLocation)}&to_location=${encodeURIComponent(toLocation)}&travel_date=${travelDate}&max_legs=${maxLegs}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    return data.journeys || [];
  }

  // Get flexible date options
  async getFlexibleDatePrices(
    fromLocation: string,
    toLocation: string,
    centerDate: string,
    flexRange: number = 3
  ): Promise<Array<{
    date: string;
    min_price: number;
    available_options: number;
    price_difference: number;
  }>> {
    const response = await fetch(`/api/search/flexible-dates?from_location=${encodeURIComponent(fromLocation)}&to_location=${encodeURIComponent(toLocation)}&center_date=${centerDate}&flex_range=${flexRange}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    return data.flexible_options || [];
  }

  // Save search for later notifications
  async saveSearchAlert(filters: Partial<AdvancedSearchFilters>, alertType: 'price_drop' | 'availability'): Promise<boolean> {
    try {
      await fetch('/api/search/save-alert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          filters,
          alert_type: alertType
        })
      });
      return true;
    } catch (error) {
      console.error('Failed to save search alert:', error);
      return false;
    }
  }

  // Get popular routes based on user location and preferences
  async getPopularRoutes(userLocation?: string, limit: number = 10): Promise<Array<{
    from_location: string;
    to_location: string;
    popularity_score: number;
    avg_price: number;
    available_operators: number;
    trending: boolean;
  }>> {
    const response = await fetch(`/api/search/popular-routes?user_location=${encodeURIComponent(userLocation || '')}&limit=${limit}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    return data.popular_routes || [];
  }

  // Get real-time availability updates
  async getRealtimeAvailability(scheduleIds: number[]): Promise<Record<number, {
    available_seats: number;
    current_price: number;
    last_updated: string;
    booking_pressure: 'low' | 'medium' | 'high';
  }>> {
    const response = await fetch('/api/search/realtime-availability', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        schedule_ids: scheduleIds
      })
    });
    const data = await response.json();
    return data.availability || {};
  }
}

// Export singleton instance
export const advancedSearchService = new AdvancedSearchService();

// Utility functions
export const createSearchFilters = (overrides: Partial<AdvancedSearchFilters> = {}): AdvancedSearchFilters => ({
  from_location: '',
  to_location: '',
  travel_date: new Date().toISOString().split('T')[0],
  return_date: undefined,
  transport_type: undefined,
  seat_class: undefined,
  min_price: undefined,
  max_price: undefined,
  departure_time_start: undefined,
  departure_time_end: undefined,
  arrival_time_start: undefined,
  arrival_time_end: undefined,
  max_duration_hours: undefined,
  min_rating: undefined,
  amenities: [],
  flexible_dates: false,
  flexible_date_range: 2,
  sort_by: 'departure_time',
  page: 1,
  per_page: 20,
  near_user_location: false,
  user_latitude: undefined,
  user_longitude: undefined,
  max_distance_km: undefined,
  ...overrides
});

export const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours === 0) {
    return `${mins}min`;
  } else if (mins === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${mins}min`;
  }
};

export const formatPrice = (price: number, currency: string = 'BDT'): string => {
  return `${price.toLocaleString()} ${currency}`;
};

export const getAmenityIcon = (amenity: string): string => {
  const amenityIcons: Record<string, string> = {
    'wifi': '📶',
    'ac': '❄️',
    'toilet': '🚽',
    'charging_port': '🔌',
    'meal_service': '🍽️',
    'entertainment': '📺',
    'restroom': '🚻',
    'blanket': '🛏️',
    'reading_light': '💡'
  };
  return amenityIcons[amenity] || '✓';
};

export const getTransportIcon = (type: string): string => {
  const transportIcons: Record<string, string> = {
    'BUS': '🚌',
    'TRAIN': '🚂',
    'PLANE': '✈️',
    'ALL': '🚀'
  };
  return transportIcons[type] || '🚗';
};

export const calculateBookingPressure = (availableSeats: number, totalSeats: number): 'low' | 'medium' | 'high' => {
  const percentage = (availableSeats / totalSeats) * 100;
  
  if (percentage > 60) return 'low';
  if (percentage > 20) return 'medium';
  return 'high';
};

export const shouldShowPriceAlert = (currentPrice: number, basePrice: number, threshold: number = 0.1): boolean => {
  const priceIncrease = (currentPrice - basePrice) / basePrice;
  return priceIncrease > threshold;
};
