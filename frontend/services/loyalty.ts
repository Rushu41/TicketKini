export interface LoyaltyProgram {
  id: number;
  user_id: number;
  current_tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  total_points: number;
  tier_points: number;
  next_tier_points_required: number;
  points_to_expire: number;
  points_expiry_date: string;
  member_since: string;
  benefits: string[];
  tier_benefits: Record<string, string[]>;
}

export interface PointTransaction {
  id: number;
  user_id: number;
  points: number;
  transaction_type: 'EARNED' | 'REDEEMED' | 'EXPIRED' | 'BONUS' | 'REFERRAL';
  description: string;
  reference_id?: string;
  reference_type?: 'BOOKING' | 'REFERRAL' | 'REVIEW' | 'ACHIEVEMENT';
  created_at: string;
  expires_at?: string;
}

export interface Achievement {
  id: number;
  name: string;
  description: string;
  category: string;
  criteria_type: string;
  criteria_value: number;
  badge_icon: string;
  badge_color: string;
  points_reward: number;
  difficulty_level: 'EASY' | 'MEDIUM' | 'HARD' | 'LEGENDARY';
  is_active: boolean;
  unlock_conditions?: string[];
}

export interface UserAchievement {
  id: number;
  user_id: number;
  achievement_id: number;
  achievement: Achievement;
  earned_at: string;
  progress_percentage: number;
  is_completed: boolean;
  milestone_reached?: number;
}

export interface Referral {
  id: number;
  referrer_id: number;
  referred_id?: number;
  referral_code: string;
  email?: string;
  phone?: string;
  status: 'PENDING' | 'REGISTERED' | 'FIRST_BOOKING' | 'COMPLETED';
  referrer_points_earned: number;
  referred_points_earned: number;
  created_at: string;
  completed_at?: string;
}

export interface RewardCatalog {
  id: number;
  name: string;
  description: string;
  category: 'DISCOUNT' | 'UPGRADE' | 'VOUCHER' | 'EXPERIENCE' | 'MERCHANDISE';
  points_required: number;
  value: number;
  currency: string;
  image_url?: string;
  terms_conditions: string[];
  is_active: boolean;
  stock_quantity?: number;
  expiry_days: number;
  tier_requirement?: string;
}

export interface UserStats {
  total_bookings: number;
  total_spent: number;
  total_distance_traveled: number;
  favorite_destinations: Array<{ destination: string; visits: number }>;
  preferred_transport_types: Array<{ type: string; percentage: number }>;
  average_booking_value: number;
  co2_saved: number;
  achievements_count: number;
  loyalty_tier: string;
  total_points_earned: number;
  total_points_redeemed: number;
  streak_data: {
    current_streak: number;
    longest_streak: number;
    streak_type: 'booking' | 'login' | 'review';
  };
}

export class LoyaltyGamificationService {
  // Get user's loyalty program details
  async getLoyaltyProgram(userId?: number): Promise<LoyaltyProgram | null> {
    try {
      const response = await fetch(`/api/loyalty/program${userId ? `?user_id=${userId}` : ''}`, {
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
      console.error('Failed to get loyalty program:', error);
      return null;
    }
  }

  // Get user's point transaction history
  async getPointTransactions(
    userId?: number,
    filters?: {
      transaction_type?: string;
      start_date?: string;
      end_date?: string;
      limit?: number;
    }
  ): Promise<PointTransaction[]> {
    const queryParams = new URLSearchParams();
    if (userId) queryParams.append('user_id', userId.toString());
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) queryParams.append(key, value.toString());
      });
    }

    const response = await fetch(`/api/loyalty/transactions?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    return data.transactions || [];
  }

  // Get all available achievements
  async getAchievements(category?: string): Promise<Achievement[]> {
    const response = await fetch(`/api/loyalty/achievements${category ? `?category=${category}` : ''}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    return data.achievements || [];
  }

  // Get user's achievement progress
  async getUserAchievements(userId?: number): Promise<UserAchievement[]> {
    const response = await fetch(`/api/loyalty/user-achievements${userId ? `?user_id=${userId}` : ''}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    return data.user_achievements || [];
  }

  // Get user's referral information
  async getReferralInfo(userId?: number): Promise<{
    referral_code: string;
    total_referrals: number;
    successful_referrals: number;
    pending_referrals: number;
    total_points_earned: number;
    recent_referrals: Referral[];
  }> {
    const response = await fetch(`/api/loyalty/referrals${userId ? `?user_id=${userId}` : ''}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    return await response.json();
  }

  // Create a new referral
  async createReferral(contact: { email?: string; phone?: string }): Promise<Referral> {
    const response = await fetch('/api/loyalty/referrals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(contact)
    });
    return await response.json();
  }

  // Get reward catalog
  async getRewardCatalog(filters?: {
    category?: string;
    max_points?: number;
    tier_requirement?: string;
  }): Promise<RewardCatalog[]> {
    const queryParams = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) queryParams.append(key, value.toString());
      });
    }

    const response = await fetch(`/api/loyalty/rewards?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    return data.rewards || [];
  }

  // Redeem points for a reward
  async redeemReward(rewardId: number): Promise<{
    success: boolean;
    message: string;
    voucher_code?: string;
    expiry_date?: string;
    remaining_points: number;
  }> {
    const response = await fetch('/api/loyalty/redeem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ reward_id: rewardId })
    });
    return await response.json();
  }

  // Get user statistics and progress
  async getUserStats(userId?: number): Promise<UserStats> {
    const response = await fetch(`/api/loyalty/stats${userId ? `?user_id=${userId}` : ''}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    return await response.json();
  }

  // Get leaderboard
  async getLeaderboard(
    category: 'points' | 'bookings' | 'distance' | 'referrals' = 'points',
    timeframe: 'weekly' | 'monthly' | 'yearly' | 'all_time' = 'monthly',
    limit: number = 10
  ): Promise<Array<{
    rank: number;
    user_id: number;
    username: string;
    avatar?: string;
    value: number;
    tier: string;
    is_current_user: boolean;
  }>> {
    const response = await fetch(`/api/loyalty/leaderboard?category=${category}&timeframe=${timeframe}&limit=${limit}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    return data.leaderboard || [];
  }

  // Get daily/weekly challenges
  async getChallenges(): Promise<Array<{
    id: number;
    name: string;
    description: string;
    challenge_type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    target_value: number;
    current_progress: number;
    points_reward: number;
    bonus_reward?: number;
    expires_at: string;
    is_completed: boolean;
  }>> {
    const response = await fetch('/api/loyalty/challenges', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    return data.challenges || [];
  }

  // Track user activity for gamification
  async trackActivity(
    activity: {
      type: 'SEARCH' | 'BOOKING' | 'REVIEW' | 'REFERRAL' | 'SOCIAL_SHARE' | 'PROFILE_COMPLETE';
      value?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<{
    points_earned: number;
    new_achievements: Achievement[];
    tier_progress: {
      current_tier: string;
      tier_progress: number;
      next_tier: string;
      points_to_next_tier: number;
    };
  }> {
    const response = await fetch('/api/loyalty/track-activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(activity)
    });
    return await response.json();
  }

  // Get tier benefits and next tier requirements
  async getTierInfo(): Promise<{
    current_tier: string;
    current_benefits: string[];
    next_tier: string;
    next_tier_benefits: string[];
    points_required: number;
    progress_percentage: number;
  }> {
    const response = await fetch('/api/loyalty/tier-info', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    return await response.json();
  }

  // Get personalized offers based on loyalty tier and activity
  async getPersonalizedOffers(): Promise<Array<{
    id: number;
    title: string;
    description: string;
    discount_percentage: number;
    discount_amount: number;
    applicable_routes: string[];
    applicable_transport_types: string[];
    expires_at: string;
    usage_limit: number;
    used_count: number;
    tier_exclusive: boolean;
  }>> {
    const response = await fetch('/api/loyalty/personalized-offers', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    return data.offers || [];
  }
}

// Export singleton instance
export const loyaltyGamificationService = new LoyaltyGamificationService();

// Utility functions
export const getTierColor = (tier: string): string => {
  const colors: Record<string, string> = {
    'BRONZE': '#CD7F32',
    'SILVER': '#C0C0C0',
    'GOLD': '#FFD700',
    'PLATINUM': '#E5E4E2'
  };
  return colors[tier] || '#9CA3AF';
};

export const getTierIcon = (tier: string): string => {
  const icons: Record<string, string> = {
    'BRONZE': '🥉',
    'SILVER': '🥈',
    'GOLD': '🥇',
    'PLATINUM': '💎'
  };
  return icons[tier] || '🎖️';
};

export const formatPoints = (points: number): string => {
  if (points >= 1000000) {
    return `${(points / 1000000).toFixed(1)}M`;
  } else if (points >= 1000) {
    return `${(points / 1000).toFixed(1)}K`;
  }
  return points.toString();
};

export const getAchievementBadge = (achievement: Achievement): string => {
  const difficulty = achievement.difficulty_level;
  const base = achievement.badge_icon || '🏆';
  
  switch (difficulty) {
    case 'EASY': return `${base} 🌟`;
    case 'MEDIUM': return `${base} ⭐⭐`;
    case 'HARD': return `${base} ⭐⭐⭐`;
    case 'LEGENDARY': return `${base} 🌟⭐⭐⭐`;
    default: return base;
  }
};

export const calculateProgress = (current: number, target: number): number => {
  return Math.min((current / target) * 100, 100);
};

export const getStreakIcon = (streakType: string): string => {
  const icons: Record<string, string> = {
    'booking': '📅',
    'login': '🔥',
    'review': '✍️'
  };
  return icons[streakType] || '⚡';
};

export const formatCurrency = (amount: number, currency: string = 'BDT'): string => {
  return `${amount.toLocaleString()} ${currency}`;
};

export const getDifficultyColor = (difficulty: string): string => {
  const colors: Record<string, string> = {
    'EASY': '#22c55e',
    'MEDIUM': '#f59e0b',
    'HARD': '#ef4444',
    'LEGENDARY': '#8b5cf6'
  };
  return colors[difficulty] || '#6b7280';
};
