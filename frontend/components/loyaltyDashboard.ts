import { loyaltyGamificationService, LoyaltyProgram, UserAchievement, PointTransaction, UserStats, getTierColor, getTierIcon, formatPoints, getAchievementBadge, formatCurrency } from '../services/loyalty';

export class LoyaltyDashboardComponent {
  private container: HTMLElement;
  private loyaltyProgram: LoyaltyProgram | null = null;
  private userStats: UserStats | null = null;
  private achievements: UserAchievement[] = [];
  private pointTransactions: PointTransaction[] = [];
  private currentView: 'overview' | 'achievements' | 'transactions' | 'rewards' | 'referrals' = 'overview';

  constructor(container: HTMLElement) {
    this.container = container;
    this.init();
  }

  private async init(): Promise<void> {
    await this.loadData();
    this.render();
    this.attachEventListeners();
  }

  private async loadData(): Promise<void> {
    try {
      // Load all loyalty data in parallel
      const [loyaltyProgram, userStats, achievements, transactions] = await Promise.all([
        loyaltyGamificationService.getLoyaltyProgram(),
        loyaltyGamificationService.getUserStats(),
        loyaltyGamificationService.getUserAchievements(),
        loyaltyGamificationService.getPointTransactions(undefined, { limit: 10 })
      ]);

      this.loyaltyProgram = loyaltyProgram;
      this.userStats = userStats;
      this.achievements = achievements;
      this.pointTransactions = transactions;
    } catch (error) {
      console.error('Failed to load loyalty data:', error);
    }
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="loyalty-dashboard">
        ${this.renderHeader()}
        ${this.renderNavigation()}
        ${this.renderContent()}
      </div>
    `;
  }

  private renderHeader(): string {
    if (!this.loyaltyProgram) {
      return `
        <div class="loyalty-header">
          <h2>🎯 Loyalty Program</h2>
          <div class="loading">Loading your loyalty information...</div>
        </div>
      `;
    }

    const tierProgress = this.loyaltyProgram.tier_points / (this.loyaltyProgram.tier_points + this.loyaltyProgram.next_tier_points_required) * 100;

    return `
      <div class="loyalty-header">
        <div class="tier-info">
          <div class="tier-badge" style="background-color: ${getTierColor(this.loyaltyProgram.current_tier)}">
            <span class="tier-icon">${getTierIcon(this.loyaltyProgram.current_tier)}</span>
            <span class="tier-name">${this.loyaltyProgram.current_tier}</span>
          </div>
          
          <div class="tier-progress">
            <div class="progress-info">
              <span class="current-points">${formatPoints(this.loyaltyProgram.tier_points)} points</span>
              <span class="next-tier-points">${formatPoints(this.loyaltyProgram.next_tier_points_required)} to next tier</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${tierProgress}%"></div>
            </div>
          </div>
        </div>
        
        <div class="points-summary">
          <div class="total-points">
            <span class="points-value">${formatPoints(this.loyaltyProgram.total_points)}</span>
            <span class="points-label">Total Points</span>
          </div>
          
          <div class="expiring-points">
            <span class="points-value">${formatPoints(this.loyaltyProgram.points_to_expire)}</span>
            <span class="points-label">Expiring Soon</span>
            <small class="expiry-date">by ${new Date(this.loyaltyProgram.points_expiry_date).toLocaleDateString()}</small>
          </div>
        </div>
      </div>
    `;
  }

  private renderNavigation(): string {
    const navItems = [
      { key: 'overview', label: '📊 Overview', icon: '📊' },
      { key: 'achievements', label: '🏆 Achievements', icon: '🏆' },
      { key: 'transactions', label: '💰 Points History', icon: '💰' },
      { key: 'rewards', label: '🎁 Rewards', icon: '🎁' },
      { key: 'referrals', label: '👥 Referrals', icon: '👥' }
    ];

    return `
      <nav class="loyalty-nav">
        ${navItems.map(item => `
          <button 
            class="nav-item ${this.currentView === item.key ? 'active' : ''}" 
            data-view="${item.key}"
          >
            ${item.icon} ${item.label}
          </button>
        `).join('')}
      </nav>
    `;
  }

  private renderContent(): string {
    switch (this.currentView) {
      case 'overview':
        return this.renderOverview();
      case 'achievements':
        return this.renderAchievements();
      case 'transactions':
        return this.renderTransactions();
      case 'rewards':
        return this.renderRewards();
      case 'referrals':
        return this.renderReferrals();
      default:
        return this.renderOverview();
    }
  }

  private renderOverview(): string {
    if (!this.userStats) {
      return '<div class="loading">Loading overview...</div>';
    }

    return `
      <div class="loyalty-overview">
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon">🎫</div>
            <div class="stat-content">
              <span class="stat-value">${this.userStats.total_bookings}</span>
              <span class="stat-label">Total Bookings</span>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon">💸</div>
            <div class="stat-content">
              <span class="stat-value">${formatCurrency(this.userStats.total_spent)}</span>
              <span class="stat-label">Total Spent</span>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon">🛣️</div>
            <div class="stat-content">
              <span class="stat-value">${this.userStats.total_distance_traveled.toLocaleString()} km</span>
              <span class="stat-label">Distance Traveled</span>
            </div>
          </div>
          
          <div class="stat-card">
            <div class="stat-icon">🏆</div>
            <div class="stat-content">
              <span class="stat-value">${this.userStats.achievements_count}</span>
              <span class="stat-label">Achievements</span>
            </div>
          </div>
        </div>
        
        <div class="overview-sections">
          <div class="section">
            <h3>🔥 Current Streak</h3>
            <div class="streak-info">
              <span class="streak-count">${this.userStats.streak_data.current_streak} days</span>
              <span class="streak-type">${this.userStats.streak_data.streak_type} streak</span>
              <div class="streak-progress">
                <small>Best: ${this.userStats.streak_data.longest_streak} days</small>
              </div>
            </div>
          </div>
          
          <div class="section">
            <h3>📍 Favorite Destinations</h3>
            <div class="destinations-list">
              ${this.userStats.favorite_destinations.slice(0, 5).map(dest => `
                <div class="destination-item">
                  <span class="destination-name">${dest.destination}</span>
                  <span class="visit-count">${dest.visits} visits</span>
                </div>
              `).join('')}
            </div>
          </div>
          
          <div class="section">
            <h3>🚗 Transport Preferences</h3>
            <div class="transport-chart">
              ${this.userStats.preferred_transport_types.map(transport => `
                <div class="transport-item">
                  <span class="transport-name">${transport.type}</span>
                  <div class="transport-bar">
                    <div class="transport-fill" style="width: ${transport.percentage}%"></div>
                  </div>
                  <span class="transport-percentage">${transport.percentage}%</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        
        <div class="recent-achievements">
          <h3>🏆 Recent Achievements</h3>
          <div class="achievements-preview">
            ${this.achievements.filter(a => a.is_completed).slice(0, 3).map(achievement => `
              <div class="achievement-card">
                <div class="achievement-badge">
                  ${getAchievementBadge(achievement.achievement)}
                </div>
                <div class="achievement-info">
                  <h4>${achievement.achievement.name}</h4>
                  <p>${achievement.achievement.description}</p>
                  <small>Earned ${new Date(achievement.earned_at).toLocaleDateString()}</small>
                </div>
                <div class="achievement-points">
                  +${achievement.achievement.points_reward} pts
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  private renderAchievements(): string {
    const completedAchievements = this.achievements.filter(a => a.is_completed);
    const inProgressAchievements = this.achievements.filter(a => !a.is_completed);

    return `
      <div class="achievements-section">
        <div class="achievements-header">
          <h3>🏆 Your Achievements</h3>
          <div class="achievements-stats">
            <span class="completed-count">${completedAchievements.length} completed</span>
            <span class="in-progress-count">${inProgressAchievements.length} in progress</span>
          </div>
        </div>
        
        <div class="achievements-tabs">
          <button class="tab-btn active" data-tab="completed">Completed</button>
          <button class="tab-btn" data-tab="in-progress">In Progress</button>
          <button class="tab-btn" data-tab="all">All</button>
        </div>
        
        <div class="achievements-content">
          <div id="completed-achievements" class="achievements-grid">
            ${completedAchievements.map(achievement => this.renderAchievementCard(achievement, true)).join('')}
          </div>
          
          <div id="in-progress-achievements" class="achievements-grid" style="display: none;">
            ${inProgressAchievements.map(achievement => this.renderAchievementCard(achievement, false)).join('')}
          </div>
          
          <div id="all-achievements" class="achievements-grid" style="display: none;">
            ${this.achievements.map(achievement => this.renderAchievementCard(achievement, achievement.is_completed)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  private renderAchievementCard(userAchievement: UserAchievement, isCompleted: boolean): string {
    const achievement = userAchievement.achievement;
    const progress = userAchievement.progress_percentage;

    return `
      <div class="achievement-card ${isCompleted ? 'completed' : 'in-progress'}">
        <div class="achievement-header">
          <div class="achievement-badge">
            ${getAchievementBadge(achievement)}
          </div>
          <div class="achievement-difficulty ${achievement.difficulty_level.toLowerCase()}">
            ${achievement.difficulty_level}
          </div>
        </div>
        
        <div class="achievement-content">
          <h4>${achievement.name}</h4>
          <p>${achievement.description}</p>
          
          ${!isCompleted ? `
            <div class="achievement-progress">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
              </div>
              <span class="progress-text">${progress}% complete</span>
            </div>
          ` : `
            <div class="achievement-completed">
              <span class="completed-date">
                ✓ Completed on ${new Date(userAchievement.earned_at).toLocaleDateString()}
              </span>
            </div>
          `}
        </div>
        
        <div class="achievement-footer">
          <div class="achievement-points">
            <span class="points-value">+${achievement.points_reward}</span>
            <span class="points-label">points</span>
          </div>
          <div class="achievement-category">
            ${achievement.category}
          </div>
        </div>
      </div>
    `;
  }

  private renderTransactions(): string {
    return `
      <div class="transactions-section">
        <div class="transactions-header">
          <h3>💰 Points History</h3>
          <div class="transactions-filters">
            <select id="transaction-filter">
              <option value="">All Transactions</option>
              <option value="EARNED">Earned</option>
              <option value="REDEEMED">Redeemed</option>
              <option value="EXPIRED">Expired</option>
              <option value="BONUS">Bonus</option>
            </select>
          </div>
        </div>
        
        <div class="transactions-list">
          ${this.pointTransactions.map(transaction => this.renderTransactionItem(transaction)).join('')}
        </div>
        
        <div class="transactions-pagination">
          <button class="load-more-btn">Load More Transactions</button>
        </div>
      </div>
    `;
  }

  private renderTransactionItem(transaction: PointTransaction): string {
    const isPositive = transaction.transaction_type === 'EARNED' || transaction.transaction_type === 'BONUS';
    const icon = this.getTransactionIcon(transaction.transaction_type);
    const color = isPositive ? 'positive' : 'negative';

    return `
      <div class="transaction-item ${color}">
        <div class="transaction-icon">
          ${icon}
        </div>
        
        <div class="transaction-content">
          <div class="transaction-description">
            ${transaction.description}
          </div>
          <div class="transaction-meta">
            <span class="transaction-date">${new Date(transaction.created_at).toLocaleDateString()}</span>
            <span class="transaction-type">${transaction.transaction_type}</span>
          </div>
        </div>
        
        <div class="transaction-points">
          <span class="points-value ${color}">
            ${isPositive ? '+' : '-'}${Math.abs(transaction.points)}
          </span>
          <span class="points-label">pts</span>
        </div>
      </div>
    `;
  }

  private renderRewards(): string {
    return `
      <div class="rewards-section">
        <div class="rewards-header">
          <h3>🎁 Available Rewards</h3>
          <div class="available-points">
            <span class="points-count">${this.loyaltyProgram ? formatPoints(this.loyaltyProgram.total_points) : '0'}</span>
            <span class="points-label">points available</span>
          </div>
        </div>
        
        <div class="rewards-categories">
          <button class="category-btn active" data-category="all">All</button>
          <button class="category-btn" data-category="DISCOUNT">Discounts</button>
          <button class="category-btn" data-category="UPGRADE">Upgrades</button>
          <button class="category-btn" data-category="VOUCHER">Vouchers</button>
          <button class="category-btn" data-category="EXPERIENCE">Experiences</button>
        </div>
        
        <div id="rewards-grid" class="rewards-grid">
          <div class="loading">Loading rewards...</div>
        </div>
      </div>
    `;
  }

  private renderReferrals(): string {
    return `
      <div class="referrals-section">
        <div class="referrals-header">
          <h3>👥 Invite Friends</h3>
          <p>Earn points for every friend you refer!</p>
        </div>
        
        <div class="referral-code-section">
          <div class="referral-code-container">
            <label>Your Referral Code:</label>
            <div class="referral-code-input">
              <input type="text" id="referral-code" readonly value="Loading...">
              <button class="copy-btn" data-copy="referral-code">Copy</button>
            </div>
          </div>
          
          <div class="referral-actions">
            <button class="share-btn" data-share="whatsapp">
              📱 Share on WhatsApp
            </button>
            <button class="share-btn" data-share="email">
              📧 Share via Email
            </button>
            <button class="share-btn" data-share="link">
              🔗 Copy Link
            </button>
          </div>
        </div>
        
        <div class="referral-stats">
          <div class="stat-card">
            <div class="stat-value" id="total-referrals">0</div>
            <div class="stat-label">Total Referrals</div>
          </div>
          
          <div class="stat-card">
            <div class="stat-value" id="successful-referrals">0</div>
            <div class="stat-label">Successful</div>
          </div>
          
          <div class="stat-card">
            <div class="stat-value" id="referral-points">0</div>
            <div class="stat-label">Points Earned</div>
          </div>
        </div>
        
        <div class="recent-referrals">
          <h4>Recent Referrals</h4>
          <div id="referrals-list" class="referrals-list">
            <div class="loading">Loading referrals...</div>
          </div>
        </div>
      </div>
    `;
  }

  private attachEventListeners(): void {
    // Navigation
    this.container.querySelectorAll('[data-view]').forEach(button => {
      button.addEventListener('click', (e) => {
        const view = (e.target as HTMLElement).getAttribute('data-view') as any;
        this.switchView(view);
      });
    });

    // Achievement tabs
    this.container.querySelectorAll('[data-tab]').forEach(button => {
      button.addEventListener('click', (e) => {
        const tab = (e.target as HTMLElement).getAttribute('data-tab');
        this.switchAchievementTab(tab);
      });
    });

    // Reward categories
    this.container.querySelectorAll('[data-category]').forEach(button => {
      button.addEventListener('click', (e) => {
        const category = (e.target as HTMLElement).getAttribute('data-category');
        this.filterRewards(category);
      });
    });

    // Copy buttons
    this.container.querySelectorAll('[data-copy]').forEach(button => {
      button.addEventListener('click', (e) => {
        const targetId = (e.target as HTMLElement).getAttribute('data-copy');
        this.copyToClipboard(targetId);
      });
    });

    // Share buttons
    this.container.querySelectorAll('[data-share]').forEach(button => {
      button.addEventListener('click', (e) => {
        const shareType = (e.target as HTMLElement).getAttribute('data-share');
        this.shareReferralCode(shareType);
      });
    });

    // Load more buttons
    this.container.querySelector('.load-more-btn')?.addEventListener('click', () => {
      this.loadMoreTransactions();
    });
  }

  private switchView(view: string): void {
    this.currentView = view as any;
    this.render();
    
    // Load specific data for the view
    switch (view) {
      case 'rewards':
        this.loadRewards();
        break;
      case 'referrals':
        this.loadReferralData();
        break;
    }
  }

  private switchAchievementTab(tab: string | null): void {
    if (!tab) return;
    
    // Update tab buttons
    this.container.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    this.container.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
    
    // Show/hide content
    this.container.querySelectorAll('.achievements-grid').forEach(grid => {
      (grid as HTMLElement).style.display = 'none';
    });
    const targetGrid = this.container.querySelector(`#${tab}-achievements`) as HTMLElement;
    if (targetGrid) {
      targetGrid.style.display = 'grid';
    }
  }

  private async loadRewards(): Promise<void> {
    try {
      const rewards = await loyaltyGamificationService.getRewardCatalog();
      this.renderRewardsGrid(rewards);
    } catch (error) {
      console.error('Failed to load rewards:', error);
    }
  }

  private renderRewardsGrid(rewards: any[]): void {
    const container = this.container.querySelector('#rewards-grid');
    if (!container) return;

    if (rewards.length === 0) {
      container.innerHTML = '<div class="no-rewards">No rewards available</div>';
      return;
    }

    container.innerHTML = rewards.map(reward => `
      <div class="reward-card ${reward.points_required > (this.loyaltyProgram?.total_points || 0) ? 'insufficient-points' : ''}">
        <div class="reward-image">
          ${reward.image_url ? `<img src="${reward.image_url}" alt="${reward.name}">` : '🎁'}
        </div>
        
        <div class="reward-content">
          <h4>${reward.name}</h4>
          <p>${reward.description}</p>
          
          <div class="reward-value">
            <span class="value">${formatCurrency(reward.value, reward.currency)}</span>
            <span class="category">${reward.category}</span>
          </div>
        </div>
        
        <div class="reward-footer">
          <div class="points-required">
            <span class="points">${formatPoints(reward.points_required)}</span>
            <span class="label">points</span>
          </div>
          
          <button 
            class="redeem-btn ${reward.points_required > (this.loyaltyProgram?.total_points || 0) ? 'disabled' : ''}"
            data-reward-id="${reward.id}"
            ${reward.points_required > (this.loyaltyProgram?.total_points || 0) ? 'disabled' : ''}
          >
            Redeem
          </button>
        </div>
      </div>
    `).join('');

    // Add redeem button handlers
    container.querySelectorAll('.redeem-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const rewardId = parseInt((e.target as HTMLElement).getAttribute('data-reward-id') || '0');
        this.redeemReward(rewardId);
      });
    });
  }

  private async loadReferralData(): Promise<void> {
    try {
      const referralInfo = await loyaltyGamificationService.getReferralInfo();
      this.updateReferralInfo(referralInfo);
    } catch (error) {
      console.error('Failed to load referral data:', error);
    }
  }

  private updateReferralInfo(referralInfo: any): void {
    // Update referral code
    const codeInput = this.container.querySelector('#referral-code') as HTMLInputElement;
    if (codeInput) {
      codeInput.value = referralInfo.referral_code;
    }

    // Update stats
    const totalElement = this.container.querySelector('#total-referrals');
    const successfulElement = this.container.querySelector('#successful-referrals');
    const pointsElement = this.container.querySelector('#referral-points');

    if (totalElement) totalElement.textContent = referralInfo.total_referrals.toString();
    if (successfulElement) successfulElement.textContent = referralInfo.successful_referrals.toString();
    if (pointsElement) pointsElement.textContent = formatPoints(referralInfo.total_points_earned);

    // Update referrals list
    const listContainer = this.container.querySelector('#referrals-list');
    if (listContainer) {
      listContainer.innerHTML = referralInfo.recent_referrals.map((referral: any) => `
        <div class="referral-item">
          <div class="referral-info">
            <span class="referral-contact">${referral.email || referral.phone || 'Anonymous'}</span>
            <span class="referral-status ${referral.status.toLowerCase()}">${referral.status}</span>
          </div>
          <div class="referral-date">
            ${new Date(referral.created_at).toLocaleDateString()}
          </div>
        </div>
      `).join('');
    }
  }

  private filterRewards(category: string | null): void {
    // Update category buttons
    this.container.querySelectorAll('.category-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    this.container.querySelector(`[data-category="${category}"]`)?.classList.add('active');

    // Filter rewards
    if (category === 'all') {
      this.loadRewards();
    } else {
      this.loadRewards(); // In a real implementation, you'd filter by category
    }
  }

  private async redeemReward(rewardId: number): Promise<void> {
    try {
      const result = await loyaltyGamificationService.redeemReward(rewardId);
      
      if (result.success) {
        alert(`Reward redeemed successfully! ${result.voucher_code ? `Voucher code: ${result.voucher_code}` : ''}`);
        await this.loadData(); // Refresh data
        this.render();
      } else {
        alert(`Failed to redeem reward: ${result.message}`);
      }
    } catch (error) {
      console.error('Failed to redeem reward:', error);
      alert('Failed to redeem reward. Please try again.');
    }
  }

  private copyToClipboard(targetId: string | null): void {
    if (!targetId) return;
    
    const input = this.container.querySelector(`#${targetId}`) as HTMLInputElement;
    if (input) {
      input.select();
      document.execCommand('copy');
      
      // Show feedback
      const button = this.container.querySelector(`[data-copy="${targetId}"]`);
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      }
    }
  }

  private shareReferralCode(shareType: string | null): void {
    const codeInput = this.container.querySelector('#referral-code') as HTMLInputElement;
    const referralCode = codeInput?.value || '';
    const shareUrl = `${window.location.origin}/signup.html?ref=${referralCode}`;
    const shareText = `Join TravelSync and get exclusive travel deals! Use my referral code: ${referralCode}`;

    switch (shareType) {
      case 'whatsapp':
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`);
        break;
      case 'email':
        window.location.href = `mailto:?subject=Join TravelSync&body=${encodeURIComponent(shareText + '\n\n' + shareUrl)}`;
        break;
      case 'link':
        this.copyToClipboard('referral-code');
        break;
    }
  }

  private async loadMoreTransactions(): Promise<void> {
    try {
      const moreTransactions = await loyaltyGamificationService.getPointTransactions(
        undefined,
        { limit: 10 }
      );
      
      this.pointTransactions.push(...moreTransactions);
      this.renderTransactions();
    } catch (error) {
      console.error('Failed to load more transactions:', error);
    }
  }

  private getTransactionIcon(type: string): string {
    const icons: Record<string, string> = {
      'EARNED': '💰',
      'REDEEMED': '🎁',
      'EXPIRED': '⏰',
      'BONUS': '🎉',
      'REFERRAL': '👥'
    };
    return icons[type] || '💸';
  }

  // Public methods
  public async refresh(): Promise<void> {
    await this.loadData();
    this.render();
  }

  public switchToView(view: string): void {
    this.switchView(view);
  }
}

export default LoyaltyDashboardComponent;
