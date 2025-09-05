// Modern Profile Page - TypeScript Implementation
import { apiService } from '../services/api.ts';
import Utils from '../services/utils.ts';

interface UserData {
  id: number;
  name: string;
  email: string;
  phone: string;
  gender?: string;
  date_of_birth?: string;
  id_type?: string;
  id_number?: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at?: string;
}

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
}

class ModernProfilePage {
  private userData: UserData | null = null;
  private bookingStats = {
    totalBookings: 0,
    totalSpent: 0,
    loyaltyPoints: 0,
    memberSince: 2024
  };

  constructor() {
    this.init();
  }

  // Ensure any API message or error turns into a readable string
  private toMessage(val: any): string {
    if (val == null) return '';
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map(v => this.toMessage(v)).filter(Boolean).join('; ');
    if (typeof val === 'object') {
      if ((val as any).detail) return this.toMessage((val as any).detail);
      if ((val as any).message) return this.toMessage((val as any).message);
      if ((val as any).error) return this.toMessage((val as any).error);
      try { return JSON.stringify(val); } catch { return String(val); }
    }
    return String(val);
  }

  private async init(): Promise<void> {
    // Check authentication
    if (!(await apiService.isAuthenticated())) {
      Utils.showNotification('Please login to view profile', 'error');
      setTimeout(() => Utils.navigateTo('login.html'), 2000);
      return;
    }

    // Load profile data
    await this.loadProfileData();
    
    // Setup event handlers
    this.setupEventHandlers();
    
    // Show content
    this.showProfileContent();
  }

  private async loadProfileData(): Promise<void> {
    try {
      const response = await apiService.getCurrentUser();
      
      if (response.success && response.data) {
        this.userData = response.data;
        console.log('Profile: User data loaded:', this.userData);
        
        await this.loadBookingStats();
        this.populateProfileData();
        
        console.log('Profile: Data population completed');
      } else {
        console.error('Profile: Failed to load user data:', response);
        throw new Error('Failed to load user data');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      Utils.showNotification('Error loading profile data', 'error');
      this.showErrorState();
    }
  }

  private async loadBookingStats(): Promise<void> {
    if (!this.userData) return;

    try {
      console.log('Profile: Loading booking stats for user:', this.userData.id);
      const response = await apiService.getUserBookings(this.userData.id);
      
      console.log('Profile: Booking stats response:', response);
      
      if (response.success && response.data) {
        let bookings: BookingData[] = [];
        
        // Handle paginated response structure
        if (Array.isArray(response.data)) {
          bookings = response.data as BookingData[];
        } else if (response.data.data && Array.isArray(response.data.data)) {
          // If the response has pagination structure
          bookings = response.data.data as BookingData[];
        } else {
          bookings = response.data as BookingData[];
        }
        
        console.log('Profile: Processed bookings array:', bookings);
        
        this.bookingStats.totalBookings = bookings.length;
        // Only count confirmed bookings in total spent
        this.bookingStats.totalSpent = bookings
          .filter(b => String(b.status).toUpperCase() === 'CONFIRMED')
          .reduce((sum, booking) => sum + (Number(booking.total_price) || 0), 0);
        this.bookingStats.loyaltyPoints = Math.floor(this.bookingStats.totalSpent / 100);
        this.bookingStats.memberSince = new Date(this.userData.created_at).getFullYear();
        
        console.log('Profile: Calculated booking stats:', this.bookingStats);
      } else {
        console.warn('Profile: Booking stats response not successful:', response);
      }
    } catch (error) {
      console.warn('Profile: Could not load booking stats:', error);
      // Don't throw error, just use default stats (0s)
    }
  }

  private populateProfileData(): void {
    if (!this.userData) return;

    const user = this.userData;

    // Update avatar and header
    const initials = user.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';
    this.updateElement('avatarText', initials);
    this.updateElement('userName', user.name || 'Unknown User');
    this.updateElement('userEmail', user.email || 'No email provided');

    // Update stats
    this.updateElement('totalBookings', this.bookingStats.totalBookings.toString());
    this.updateElement('totalSpent', `৳${this.bookingStats.totalSpent.toLocaleString()}`);
    this.updateElement('loyaltyPoints', this.bookingStats.loyaltyPoints.toString());
    this.updateElement('memberSince', this.bookingStats.memberSince.toString());

    // Update personal information
    this.updateElement('profileName', user.name || 'Not provided');
    this.updateElement('profileDob', user.date_of_birth ? this.formatDate(user.date_of_birth) : 'Not provided');
    this.updateElement('profileGender', this.capitalizeFirst(user.gender) || 'Not specified');
    this.updateElement('profileNationality', 'Bangladeshi');

    // Update contact details
    this.updateElement('profileEmail', user.email || 'Not provided');
    this.updateElement('profilePhone', user.phone || 'Not provided');
    this.updateElement('profileEmergency', 'Not provided');
    this.updateElement('profileAddress', 'Not provided');

    // Update identification
    this.updateElement('profileIdType', this.capitalizeFirst(user.id_type) || 'Not provided');
    this.updateElement('profileIdNumber', user.id_number || 'Not provided');
    this.updateElement('profilePassport', 'Not provided');

    // Update account status
    this.updateElement('profileMemberSince', this.formatDate(user.created_at));
    this.updateElement('profileLastLogin', 'Just now');
  }

  private updateElement(id: string, text: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = text;
    }
  }

  private formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return dateString;
    }
  }

  private capitalizeFirst(str?: string): string {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  private showProfileContent(): void {
    const loadingState = document.getElementById('loadingState');
    const profileContent = document.getElementById('profileContent');
    
    if (loadingState) loadingState.style.display = 'none';
    if (profileContent) profileContent.classList.remove('hidden');
  }

  private showErrorState(): void {
    const loadingState = document.getElementById('loadingState');
    if (loadingState) {
      loadingState.innerHTML = `
        <div class="text-center py-20">
          <i class="fas fa-exclamation-triangle text-6xl text-red-400 mb-4"></i>
          <h2 class="text-2xl font-bold text-white mb-2">Error Loading Profile</h2>
          <p class="text-white/70 mb-4">Unable to load your profile information</p>
          <button onclick="location.reload()" class="btn-primary px-6 py-3">
            <i class="fas fa-redo mr-2"></i>Try Again
          </button>
        </div>
      `;
    }
  }

  private setupEventHandlers(): void {
    // Make functions globally available for onclick handlers
    (window as any).logout = () => this.logout();
    (window as any).editPersonalInfo = () => this.editPersonalInfo();
    (window as any).editContactInfo = () => this.editContactInfo();
    (window as any).editIdInfo = () => this.editIdInfo();
    (window as any).manageAccount = () => this.manageAccount();
    (window as any).changePassword = () => this.changePassword();
    (window as any).downloadData = () => this.downloadData();
    (window as any).deleteAccount = () => this.deleteAccount();
    (window as any).closeModal = () => this.closeModal();
    (window as any).saveModalChanges = () => this.saveModalChanges();
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

  private editPersonalInfo(): void {
    this.showEditModal('Personal Information', [
      { label: 'Full Name', id: 'name', type: 'text', value: this.userData?.name || '', required: true },
      { label: 'Date of Birth', id: 'date_of_birth', type: 'date', value: this.userData?.date_of_birth || '' },
      { label: 'Gender', id: 'gender', type: 'select', value: this.userData?.gender || '', options: [
        { value: '', label: 'Select Gender' },
        { value: 'male', label: 'Male' },
        { value: 'female', label: 'Female' },
        { value: 'other', label: 'Other' }
      ]}
    ]);
  }

  private editContactInfo(): void {
    this.showEditModal('Contact Information', [
      { label: 'Email Address', id: 'email', type: 'email', value: this.userData?.email || '', required: true },
      { label: 'Phone Number', id: 'phone', type: 'tel', value: this.userData?.phone || '', required: true },
      { label: 'Emergency Contact', id: 'emergency_contact', type: 'tel', value: '' },
      { label: 'Address', id: 'address', type: 'textarea', value: '' }
    ]);
  }

  private editIdInfo(): void {
    this.showEditModal('Identification', [
      { label: 'ID Type', id: 'id_type', type: 'select', value: this.userData?.id_type || '', options: [
        { value: '', label: 'Select ID Type' },
        { value: 'nid', label: 'National ID' },
        { value: 'passport', label: 'Passport' },
        { value: 'birth_certificate', label: 'Birth Certificate' },
        { value: 'driving_license', label: 'Driving License' }
      ]},
      { label: 'ID Number', id: 'id_number', type: 'text', value: this.userData?.id_number || '' },
      { label: 'Passport Number', id: 'passport_number', type: 'text', value: '' }
    ]);
  }

  private manageAccount(): void {
    Utils.showNotification('Account management features coming soon! ⚙️', 'info');
  }

  private changePassword(): void {
    this.showEditModal('Change Password', [
      { label: 'Current Password', id: 'current_password', type: 'password', value: '', required: true },
      { label: 'New Password', id: 'new_password', type: 'password', value: '', required: true },
      { label: 'Confirm New Password', id: 'confirm_password', type: 'password', value: '', required: true }
    ]);
  }

  private async downloadData(): Promise<void> {
    try {
      Utils.showNotification('Preparing data export...', 'info');
      
      const userData = {
        user: this.userData,
        bookingStats: this.bookingStats,
        exportDate: new Date().toISOString()
      };

      const dataStr = JSON.stringify(userData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `TicketKini-UserData-${this.userData?.id}-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      Utils.showNotification('Data exported successfully! 📥', 'success');
    } catch (error) {
      console.error('Export error:', error);
      Utils.showNotification('Failed to export data', 'error');
    }
  }

  private deleteAccount(): void {
    const confirmed = confirm('⚠️ Are you sure you want to delete your account? This action cannot be undone.');
    
    if (confirmed) {
      Utils.showNotification('Account deletion feature is currently disabled for safety. Please contact support.', 'warning');
    }
  }

  private showEditModal(title: string, fields: any[]): void {
    const modal = document.getElementById('editModal');
    const modalContent = document.getElementById('modalContent');
    
    if (!modal || !modalContent) return;

    const fieldsHtml = fields.map(field => {
      if (field.type === 'select') {
        return `
          <div class="mb-4">
            <label for="${field.id}" class="block text-sm font-medium text-white/80 mb-2">${field.label}</label>
            <select id="${field.id}" name="${field.id}" ${field.required ? 'required' : ''} 
              class="glass-input w-full px-3 py-2">
              ${field.options.map((opt: any) => `
                <option value="${opt.value}" ${opt.value === field.value ? 'selected' : ''}>${opt.label}</option>
              `).join('')}
            </select>
          </div>
        `;
      } else if (field.type === 'textarea') {
        return `
          <div class="mb-4">
            <label for="${field.id}" class="block text-sm font-medium text-white/80 mb-2">${field.label}</label>
            <textarea id="${field.id}" name="${field.id}" ${field.required ? 'required' : ''} 
              class="glass-input w-full px-3 py-2 h-24 resize-none" 
              placeholder="Enter ${field.label.toLowerCase()}">${field.value}</textarea>
          </div>
        `;
      } else {
        return `
          <div class="mb-4">
            <label for="${field.id}" class="block text-sm font-medium text-white/80 mb-2">${field.label}</label>
            <input type="${field.type}" id="${field.id}" name="${field.id}" 
              value="${field.value}" ${field.required ? 'required' : ''} 
              class="glass-input w-full px-3 py-2" 
              placeholder="Enter ${field.label.toLowerCase()}">
          </div>
        `;
      }
    }).join('');

    modalContent.innerHTML = `
      <div class="text-center mb-6">
        <h3 class="text-2xl font-bold text-white">${title}</h3>
        <p class="text-white/70 mt-2">Update your ${title.toLowerCase()}</p>
      </div>
      
      <form id="editForm" class="space-y-4">
        ${fieldsHtml}
        
        <div class="flex gap-3 pt-4">
          <button type="button" onclick="closeModal()" 
            class="flex-1 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">
            Cancel
          </button>
          <button type="submit" 
            class="flex-1 btn-primary px-4 py-3">
            Save Changes
          </button>
        </div>
      </form>
    `;

    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Setup form submission
    const form = document.getElementById('editForm') as HTMLFormElement;
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveModalChanges();
      });
    }
  }

  private closeModal(): void {
    const modal = document.getElementById('editModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  private async saveModalChanges(): Promise<void> {
    const form = document.getElementById('editForm') as HTMLFormElement;
    if (!form) return;

    try {
      const formData = new FormData(form);
      const updateData: any = {};

      // Collect form data
      for (let [key, value] of formData.entries()) {
        if (typeof value === 'string' && value.trim() !== '') {
          updateData[key] = value.trim();
        }
      }

      // Handle password changes
      if (updateData.current_password && updateData.new_password && updateData.confirm_password) {
        if (updateData.new_password !== updateData.confirm_password) {
          Utils.showNotification('New passwords do not match', 'error');
          return;
        }
  // Map to backend-expected field name and remove temp fields
  updateData.password = updateData.new_password;
  delete updateData.new_password;
  delete updateData.current_password;
  delete updateData.confirm_password;
      }

      Utils.showNotification('Updating profile...', 'info');

      const response = await apiService.updateProfile(updateData);

      if (response.success) {
        Utils.showNotification('Profile updated successfully! ✨', 'success');
        this.closeModal();
        
        // Reload profile data
        await this.loadProfileData();
      } else {
        const msg = this.toMessage(response.error || response.message) || 'Failed to update profile';
        throw new Error(msg);
      }
    } catch (error) {
      console.error('Update error:', error);
      const msg = error instanceof Error ? error.message : this.toMessage(error);
      Utils.showNotification(msg || 'Error updating profile', 'error');
    }
  }
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
  new ModernProfilePage();
});
