import { apiService } from '../services/api.js';
import Utils from '../services/utils.js';

class LoginPage {
  private currentTab: 'user' | 'admin' = 'user';
  private isLoading = false;

  constructor() {
    this.init();
  }

  private init() {
    this.setupTabs();
    this.setupPasswordToggle();
    this.setupValidation();
    this.setupForms();
    this.checkAutoLogin();
  }

  private setupTabs() {
    const userTab = document.getElementById('user-tab') as HTMLButtonElement;
    const adminTab = document.getElementById('admin-tab') as HTMLButtonElement;
    const userPanel = document.getElementById('user-panel') as HTMLElement;
    const adminPanel = document.getElementById('admin-panel') as HTMLElement;

    const switchTab = (tab: 'user' | 'admin') => {
      this.currentTab = tab;
      
      // Update tab buttons with neumorphic styles
      userTab.classList.toggle('active', tab === 'user');
      adminTab.classList.toggle('active', tab === 'admin');
      
      // Update ARIA attributes
      userTab.setAttribute('aria-selected', (tab === 'user').toString());
      adminTab.setAttribute('aria-selected', (tab === 'admin').toString());
      
      // Switch panels with animation
      if (tab === 'user') {
        adminPanel.classList.add('hidden');
        userPanel.classList.remove('hidden');
        userPanel.classList.add('tab-slide-enter');
      } else {
        userPanel.classList.add('hidden');
        adminPanel.classList.remove('hidden');
        adminPanel.classList.add('tab-slide-enter');
      }
      
      // Remove animation class after transition
      setTimeout(() => {
        userPanel.classList.remove('tab-slide-enter');
        adminPanel.classList.remove('tab-slide-enter');
      }, 300);
    };

    userTab.addEventListener('click', () => switchTab('user'));
    adminTab.addEventListener('click', () => switchTab('admin'));

    // Check URL params for admin tab
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin') === '1') {
      switchTab('admin');
    }
  }

  private setupPasswordToggle() {
    const toggleBtn = document.getElementById('toggle-password') as HTMLButtonElement;
    const passwordInput = document.getElementById('password') as HTMLInputElement;
    
    if (toggleBtn && passwordInput) {
      toggleBtn.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        
        const icon = toggleBtn.querySelector('i') as HTMLElement;
        icon.className = isPassword ? 'fas fa-eye-slash text-gray-400 hover:text-gray-600' : 'fas fa-eye text-gray-400 hover:text-gray-600';
      });
    }
  }

  private setupValidation() {
    const emailInput = document.getElementById('email') as HTMLInputElement;
    const passwordInput = document.getElementById('password') as HTMLInputElement;
    
    if (emailInput) {
      emailInput.addEventListener('input', () => this.validateEmail(emailInput));
      emailInput.addEventListener('blur', () => this.validateEmail(emailInput));
    }
    
    if (passwordInput) {
      passwordInput.addEventListener('input', () => this.validatePassword(passwordInput));
      passwordInput.addEventListener('blur', () => this.validatePassword(passwordInput));
    }
  }

  private validateEmail(input: HTMLInputElement): boolean {
    const email = input.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(email);
    
    const messageEl = document.getElementById('email-message') as HTMLElement;
    const iconEl = document.getElementById('email-icon') as HTMLElement;
    
    if (email === '') {
      input.className = input.className.replace(/(border-red-500|border-green-500)/g, 'border-gray-300');
      messageEl.textContent = '';
      iconEl.classList.add('hidden');
      return false;
    }
    
    if (isValid) {
      input.className = input.className.replace(/border-red-500/g, '') + ' border-green-500';
      messageEl.textContent = 'Valid email address';
      messageEl.className = 'text-sm mt-1 transition-all duration-300 text-green-600';
      iconEl.classList.remove('hidden');
    } else {
      input.className = input.className.replace(/border-green-500/g, '') + ' border-red-500';
      messageEl.textContent = 'Please enter a valid email address';
      messageEl.className = 'text-sm mt-1 transition-all duration-300 text-red-600';
      iconEl.classList.add('hidden');
    }
    
    return isValid;
  }

  private validatePassword(input: HTMLInputElement): boolean {
    const password = input.value;
    const messageEl = document.getElementById('password-message') as HTMLElement;
    const strengthEl = document.getElementById('password-strength') as HTMLElement;
    
    if (password === '') {
      input.className = input.className.replace(/(border-red-500|border-green-500)/g, 'border-gray-300');
      messageEl.textContent = '';
      strengthEl.classList.add('hidden');
      return false;
    }
    
    const strength = this.calculatePasswordStrength(password);
    
    // Show strength indicator
    strengthEl.classList.remove('hidden');
    strengthEl.className = `password-strength mt-2 ${this.getStrengthClass(strength)}`;
    
    if (strength >= 3) {
      input.className = input.className.replace(/border-red-500/g, '') + ' border-green-500';
      messageEl.textContent = 'Strong password';
      messageEl.className = 'text-sm mt-1 transition-all duration-300 text-green-600';
      return true;
    } else if (strength >= 2) {
      input.className = input.className.replace(/(border-red-500|border-green-500)/g, 'border-yellow-500');
      messageEl.textContent = 'Medium strength password';
      messageEl.className = 'text-sm mt-1 transition-all duration-300 text-yellow-600';
      return true;
    } else {
      input.className = input.className.replace(/border-green-500/g, '') + ' border-red-500';
      messageEl.textContent = 'Password too weak';
      messageEl.className = 'text-sm mt-1 transition-all duration-300 text-red-600';
      return false;
    }
  }

  private calculatePasswordStrength(password: string): number {
    let strength = 0;
    
    if (password.length >= 8) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    return Math.min(strength, 3);
  }

  private getStrengthClass(strength: number): string {
    if (strength <= 1) return 'strength-weak';
    if (strength === 2) return 'strength-medium';
    return 'strength-strong';
  }

  private setupForms() {
    const userForm = document.getElementById('user-form') as HTMLFormElement;
    const adminForm = document.getElementById('admin-form') as HTMLFormElement;
    
    if (userForm) {
      userForm.addEventListener('submit', (e) => this.handleUserLogin(e));
    }
    
    if (adminForm) {
      adminForm.addEventListener('submit', (e) => this.handleAdminLogin(e));
    }
    
    // Setup forgot password
    const forgotLink = document.getElementById('forgot-link') as HTMLAnchorElement;
    if (forgotLink) {
      forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.showAlert('Password reset functionality will be available soon!', 'info');
      });
    }
  }

  private async handleUserLogin(e: Event) {
    e.preventDefault();
    
    if (this.isLoading) return;
    
    const email = (document.getElementById('email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('password') as HTMLInputElement).value;
    const remember = (document.getElementById('remember') as HTMLInputElement).checked;
    
    // Validate inputs
    const emailValid = this.validateEmail(document.getElementById('email') as HTMLInputElement);
    const passwordValid = password.length >= 6;
    
    if (!emailValid || !passwordValid) {
      this.showAlert('Please fix the errors and try again.', 'error');
      return;
    }
    
    this.setLoading(true, 'user');
    
    try {
      const response = await apiService.login({ email, password });
      
      if (response.success && response.data) {
        // Store auth token
        apiService.setToken(response.data.access_token);
        
        // Get user details
        const userResponse = await apiService.getCurrentUser();
        if (userResponse.success && userResponse.data) {
          // Store user data
          Utils.setLocalStorage('user', userResponse.data);
          
          if (remember) {
            Utils.setLocalStorage('remember_login', 'true');
          }
          
          this.showAlert('🎉 Welcome back! Redirecting to your dashboard...', 'success');
          
          // Redirect after short delay
          setTimeout(() => {
            const returnUrl = new URLSearchParams(window.location.search).get('return') || '../index.html';
            window.location.href = returnUrl;
          }, 1500);
        }
      } else {
        this.showAlert(response.error || 'Login failed. Please check your credentials.', 'error');
      }
    } catch (error) {
      console.error('Login error:', error);
      this.showAlert('An error occurred. Please try again later.', 'error');
    } finally {
      this.setLoading(false, 'user');
    }
  }

  private async handleAdminLogin(e: Event) {
    e.preventDefault();
    
    if (this.isLoading) return;
    
    const email = (document.getElementById('admin-email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('admin-password') as HTMLInputElement).value;
    
    if (!email || !password) {
      this.showAlert('Please enter both email and password.', 'error');
      return;
    }
    
    this.setLoading(true, 'admin');
    
    try {
      const response = await apiService.adminLogin({ email, password });
      
      if (response.success && response.data) {
        // Store auth token
        apiService.setToken(response.data.access_token);
        
        // Get user details and verify admin status
        const userResponse = await apiService.getCurrentUser();
        if (userResponse.success && userResponse.data?.is_admin) {
          Utils.setLocalStorage('user', userResponse.data);
          
          this.showAlert('🔐 Admin access granted! Welcome to the control panel...', 'success');
          
          setTimeout(() => {
            window.location.href = 'admin.html';
          }, 1500);
        } else {
          this.showAlert('Admin access denied for this account.', 'error');
        }
      } else {
        this.showAlert(response.error || 'Invalid admin credentials.', 'error');
      }
    } catch (error) {
      console.error('Admin login error:', error);
      this.showAlert('An error occurred. Please try again later.', 'error');
    } finally {
      this.setLoading(false, 'admin');
    }
  }

  private setLoading(loading: boolean, type: 'user' | 'admin') {
    this.isLoading = loading;
    
    const btnId = type === 'user' ? 'login-btn' : 'admin-login-btn';
    const spinnerId = type === 'user' ? 'login-spinner' : 'admin-spinner';
    const textId = type === 'user' ? 'login-text' : 'admin-text';
    
    const btn = document.getElementById(btnId) as HTMLButtonElement;
    const spinner = document.getElementById(spinnerId) as HTMLElement;
    const text = document.getElementById(textId) as HTMLElement;
    
    if (btn && spinner && text) {
      btn.disabled = loading;
      
      if (loading) {
        spinner.classList.remove('hidden');
        text.textContent = 'Signing In...';
        btn.classList.add('opacity-75');
      } else {
        spinner.classList.add('hidden');
        text.textContent = type === 'user' ? 'Sign In' : 'Sign In as Admin';
        btn.classList.remove('opacity-75');
      }
    }
  }

  private showAlert(message: string, type: 'success' | 'error' | 'info') {
    const container = document.getElementById('alert-container') as HTMLElement;
    if (!container) return;
    
    // Clear any existing alerts
    container.innerHTML = '';
    
    const alertConfig = {
      success: {
        bgClass: 'bg-green-50 border border-green-200',
        textClass: 'text-green-800',
        iconClass: 'fas fa-check-circle text-green-500'
      },
      error: {
        bgClass: 'bg-red-50 border border-red-200',
        textClass: 'text-red-800',
        iconClass: 'fas fa-exclamation-circle text-red-500'
      },
      info: {
        bgClass: 'bg-blue-50 border border-blue-200',
        textClass: 'text-blue-800',
        iconClass: 'fas fa-info-circle text-blue-500'
      }
    }[type];
    
    const alertId = `alert-${Date.now()}`;
    
    container.innerHTML = `
      <div id="${alertId}" class="${alertConfig.bgClass} p-4 rounded-lg shadow-sm simple-alert">
        <div class="flex items-center gap-3">
          <i class="${alertConfig.iconClass}"></i>
          <span class="${alertConfig.textClass} font-medium">${message}</span>
          <button class="ml-auto text-gray-400 hover:text-gray-600 transition-colors" onclick="this.parentElement.parentElement.remove()">
            <i class="fas fa-times text-sm"></i>
          </button>
        </div>
      </div>
    `;
    
    // Simple entrance animation
    const alertElement = document.getElementById(alertId);
    if (alertElement) {
      alertElement.style.transform = 'translateY(-20px)';
      alertElement.style.opacity = '0';
      
      requestAnimationFrame(() => {
        alertElement.style.transition = 'all 0.3s ease-out';
        alertElement.style.transform = 'translateY(0)';
        alertElement.style.opacity = '1';
      });
      
      // Auto-hide after 3 seconds
      setTimeout(() => {
        if (alertElement && alertElement.parentElement) {
          alertElement.style.transition = 'all 0.3s ease-in';
          alertElement.style.transform = 'translateY(-20px)';
          alertElement.style.opacity = '0';
          
          setTimeout(() => {
            if (alertElement.parentElement) {
              alertElement.remove();
            }
          }, 300);
        }
      }, 3000);
    }
  }

  private checkAutoLogin() {
    // Check if user is already logged in
    const token = apiService.getToken();
    const user = Utils.getLocalStorage('user');
    
    if (token && user) {
      this.showAlert('You are already logged in. Redirecting...', 'info');
      setTimeout(() => {
        const returnUrl = new URLSearchParams(window.location.search).get('return') || '../index.html';
        window.location.href = returnUrl;
      }, 1500);
    }
  }
}

// Initialize the login page
document.addEventListener('DOMContentLoaded', () => {
  new LoginPage();
});

// Add custom CSS animations
const style = document.createElement('style');
style.textContent = `
  .simple-alert {
    transition: all 0.3s ease-out;
  }
  
  .simple-alert:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
`;
document.head.appendChild(style);