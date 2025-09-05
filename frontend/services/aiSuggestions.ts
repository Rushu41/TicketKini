export interface TravelSuggestion {
  id: string;
  type: 'route' | 'destination' | 'offer' | 'flexible' | 'nearby';
  title: string;
  description: string;
  confidence_score: number;
  data: {
    from_location?: string;
    to_location?: string;
    suggested_dates?: string[];
    price_range?: { min: number; max: number };
    transport_types?: string[];
    reason?: string;
    discount_percentage?: number;
    expires_at?: string;
  };
  action: {
    type: 'search' | 'book' | 'save' | 'compare';
    url?: string;
    params?: Record<string, any>;
  };
  priority: number;
  created_at: string;
}

export interface UserPreference {
  user_id: number;
  preferred_transport_types: string[];
  preferred_seat_classes: string[];
  budget_range: { min: number; max: number };
  preferred_departure_times: string[];
  frequent_routes: Array<{ from: string; to: string; frequency: number }>;
  amenity_preferences: string[];
  booking_lead_time_days: number;
  price_sensitivity: 'low' | 'medium' | 'high';
  comfort_priority: number; // 1-5 scale
  speed_priority: number; // 1-5 scale
  updated_at: string;
}

export interface PopularDestination {
  destination: string;
  growth_percentage: number;
  current_week_searches: number;
  last_week_searches: number;
  popular_from_locations: string[];
  average_price_range: { min: number; max: number };
  peak_travel_days: string[];
  seasonal_trends: Array<{
    month: string;
    popularity_score: number;
    average_price: number;
  }>;
}

export interface RouteRecommendation {
  from_location: string;
  to_location: string;
  recommendation_score: number;
  reasons: string[];
  best_travel_dates: string[];
  estimated_savings: number;
  alternative_routes: Array<{
    description: string;
    estimated_duration: number;
    estimated_cost: number;
  }>;
}

export class AITravelSuggestionService {
  // Get personalized travel suggestions based on user history and preferences
  async getPersonalizedSuggestions(userId?: number): Promise<TravelSuggestion[]> {
    const response = await fetch(`/api/ai/suggestions${userId ? `?user_id=${userId}` : ''}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    return data.suggestions || [];
  }

  // Get trending destinations and popular routes
  async getTrendingDestinations(fromLocation?: string, limit: number = 10): Promise<PopularDestination[]> {
    const response = await fetch(`/api/ai/trending-destinations?${fromLocation ? `from_location=${encodeURIComponent(fromLocation)}&` : ''}limit=${limit}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    return data.destinations || [];
  }

  // Get smart route recommendations based on preferences and constraints
  async getRouteRecommendations(
    preferences: {
      budget?: number;
      travel_date?: string;
      preferred_transport?: string;
      duration_preference?: 'fastest' | 'cheapest' | 'comfortable';
      group_size?: number;
    },
    fromLocation?: string
  ): Promise<RouteRecommendation[]> {
    const response = await fetch('/api/ai/route-recommendations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        preferences,
        from_location: fromLocation
      })
    });
    const data = await response.json();
    return data.recommendations || [];
  }

  // Update user preferences based on search and booking behavior
  async updateUserPreferences(preferences: Partial<UserPreference>): Promise<boolean> {
    try {
      await fetch('/api/ai/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(preferences)
      });
      return true;
    } catch (error) {
      console.error('Failed to update preferences:', error);
      return false;
    }
  }

  // Get user's current preferences
  async getUserPreferences(userId?: number): Promise<UserPreference | null> {
    try {
      const response = await fetch(`/api/ai/preferences${userId ? `?user_id=${userId}` : ''}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      console.error('Failed to get preferences:', error);
      return null;
    }
  }

  // Get smart price predictions and booking timing suggestions
  async getBookingTimingSuggestions(
    fromLocation: string,
    toLocation: string,
    travelDate: string
  ): Promise<{
    recommendation: 'book_now' | 'wait' | 'flexible_dates';
    confidence: number;
    reasoning: string;
    price_prediction: {
      current_price: number;
      predicted_price_in_week: number;
      predicted_price_change: number;
      optimal_booking_date: string;
    };
    alternative_suggestions: Array<{
      suggestion: string;
      potential_savings: number;
      trade_off: string;
    }>;
  }> {
    const response = await fetch('/api/ai/booking-timing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        from_location: fromLocation,
        to_location: toLocation,
        travel_date: travelDate
      })
    });
    return await response.json();
  }

  // Get weather-based travel suggestions
  async getWeatherBasedSuggestions(preferences?: {
    avoid_rain?: boolean;
    prefer_cool_weather?: boolean;
    outdoor_activities?: boolean;
  }): Promise<Array<{
    destination: string;
    weather_score: number;
    expected_weather: string;
    activities_suggestion: string[];
    best_travel_window: { start: string; end: string };
  }>> {
    const response = await fetch('/api/ai/weather-suggestions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(preferences || {})
    });
    const data = await response.json();
    return data.suggestions || [];
  }

  // Get group travel recommendations
  async getGroupTravelSuggestions(
    groupSize: number,
    preferences: {
      budget_per_person?: number;
      activity_type?: string[];
      accommodation_needed?: boolean;
      travel_dates?: { start: string; end: string };
    }
  ): Promise<Array<{
    destination: string;
    group_discount_available: boolean;
    recommended_transport: string;
    estimated_cost_per_person: number;
    group_activities: string[];
    accommodation_options: Array<{
      type: string;
      estimated_cost: number;
      group_capacity: number;
    }>;
  }>> {
    const response = await fetch('/api/ai/group-suggestions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        group_size: groupSize,
        preferences
      })
    });
    const data = await response.json();
    return data.suggestions || [];
  }

  // Save a suggestion interaction for improving future recommendations
  async trackSuggestionInteraction(
    suggestionId: string,
    action: 'viewed' | 'clicked' | 'booked' | 'dismissed' | 'saved'
  ): Promise<void> {
    try {
      await fetch('/api/ai/track-interaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          suggestion_id: suggestionId,
          action,
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('Failed to track suggestion interaction:', error);
    }
  }

  // Get budget-optimized travel suggestions
  async getBudgetOptimizedSuggestions(
    maxBudget: number,
    fromLocation?: string,
    flexibleDates: boolean = true
  ): Promise<Array<{
    destination: string;
    total_estimated_cost: number;
    savings_vs_popular_option: number;
    travel_dates: string[];
    transport_breakdown: Array<{
      type: string;
      cost: number;
      duration: number;
    }>;
    money_saving_tips: string[];
  }>> {
    const response = await fetch('/api/ai/budget-suggestions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        max_budget: maxBudget,
        from_location: fromLocation,
        flexible_dates: flexibleDates
      })
    });
    const data = await response.json();
    return data.suggestions || [];
  }
}

// Export singleton instance
export const aiTravelSuggestionService = new AITravelSuggestionService();

// Utility functions
export const formatSuggestionReason = (reasons: string[]): string => {
  if (reasons.length === 0) return '';
  if (reasons.length === 1) return reasons[0];
  if (reasons.length === 2) return reasons.join(' and ');
  return `${reasons.slice(0, -1).join(', ')}, and ${reasons[reasons.length - 1]}`;
};

export const getSuggestionIcon = (type: TravelSuggestion['type']): string => {
  const icons: Record<string, string> = {
    'route': '🛣️',
    'destination': '🏖️',
    'offer': '💰',
    'flexible': '📅',
    'nearby': '📍'
  };
  return icons[type] || '💡';
};

export const calculateSavingsPercentage = (originalPrice: number, suggestedPrice: number): number => {
  return Math.round(((originalPrice - suggestedPrice) / originalPrice) * 100);
};

export const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.8) return '#22c55e'; // Green
  if (confidence >= 0.6) return '#f59e0b'; // Yellow
  return '#ef4444'; // Red
};

export const formatWeatherScore = (score: number): string => {
  if (score >= 8) return 'Excellent';
  if (score >= 6) return 'Good';
  if (score >= 4) return 'Fair';
  return 'Poor';
};
