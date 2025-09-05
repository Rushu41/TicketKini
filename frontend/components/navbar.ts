// components/navbar.ts
import { apiService } from '../services/api.ts';
import Utils from '../services/utils.ts';
import userNotificationService from '../services/userNotificationService.ts';

export class Navbar {
  private element: HTMLElement;
  private mobileMenuOpen = false;

  constructor() {
    this.element = this.createElement();
    this.attachEventListeners();
    this.updateAuthStatus();
  // Bootstrap real-time notifications when navbar loads
  this.bootstrapNotifications();
  }

  private createElement(): HTMLElement {
    const nav = document.createElement('nav');
    nav.className = 'fixed top-0 left-0 right-0 z-50 bg-white shadow-lg';
    nav.id = 'main-navbar';

    nav.innerHTML = `
      <div class="max-w-full mx-auto px-6 flex justify-between items-center h-20">
        <!-- Logo -->
        <div class="flex items-center">
          <div class="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-2xl tracking-wider transform hover:scale-105 transition-transform duration-200">
            ticket<span class="bg-white text-blue-600 px-2 rounded-md">kini</span>
          </div>
        </div>
        <!-- Main Navigation -->
        <div class="hidden md:flex items-center space-x-10">
          <a href="/" class="nav-link flex items-center gap-3 px-5 py-2 hover:bg-gray-100 rounded-full text-gray-800 font-semibold transition-all duration-200">
            <i class="fas fa-bus text-xl"></i> BUS
          </a>
          <a href="/train" class="nav-link flex items-center gap-3 px-5 py-2 hover:bg-gray-100 rounded-full text-gray-800 font-semibold transition-all duration-200">
            <i class="fas fa-train text-xl"></i> TRAIN
          </a>
          <a href="/flight" class="nav-link flex items-center gap-3 px-5 py-2 hover:bg-gray-100 rounded-full text-gray-800 font-semibold transition-all duration-200">
            <i class="fas fa-plane text-xl"></i> FLIGHT
          </a>
        </div>
        <!-- Auth Buttons -->
        <div class="hidden md:flex items-center space-x-4">
          <a id="my-bookings-btn" href="/pages/my-bookings.html" class="auth-required flex items-center gap-2 px-5 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-800 font-semibold transition-all duration-200" style="display: none;">
            <i class="fas fa-ticket-alt"></i> My Bookings
          </a>
          <a id="profile-btn" href="/pages/profile.html" class="auth-required flex items-center gap-2 px-5 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-800 font-semibold transition-all duration-200" style="display: none;">
            <i class="fas fa-user"></i> <span class="user-name">Profile</span>
          </a>
          <button id="logout-btn" class="auth-required px-5 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-full font-semibold transition-all duration-200" style="display: none;">
            <i class="fas fa-sign-out-alt"></i> Logout
          </button>
          <a href="/pages/login.html" class="auth-optional px-5 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-800 font-semibold transition-all duration-200">
            Login
          </a>
          <a href="/pages/signup.html" class="auth-optional px-5 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-full font-semibold transition-all duration-200">
            Sign Up
          </a>
        </div>
        <!-- Mobile Menu Button -->
        <button class="md:hidden bg-gray-100 hover:bg-gray-200 rounded-lg p-2 text-gray-800">
          <i class="fas fa-bars text-2xl"></i>
        </button>
      </div>
    `;

    return nav;
  }

  private attachEventListeners(): void {
    // Handle logout
    this.element.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.id === 'logout-btn') {
        this.handleLogout();
      }
      
      // Handle My Bookings button
      if (target.id === 'my-bookings-btn' || target.closest('#my-bookings-btn')) {
        e.preventDefault();
        Utils.navigateTo('/pages/my-bookings.html');
      }
    });
  }

  private updateAuthStatus(): void {
    const isAuthenticated = apiService.isAuthenticated();
    const authRequiredElements = this.element.querySelectorAll('.auth-required');
    const authOptionalElements = this.element.querySelectorAll('.auth-optional');
    const userNameElements = this.element.querySelectorAll('.user-name');

    if (isAuthenticated) {
      // Show authenticated elements
      authRequiredElements.forEach(el => {
        const element = el as HTMLElement;
        if (element.id === 'my-bookings-btn' || element.id === 'profile-btn') {
          element.style.display = 'flex'; // Show as flex to maintain layout
        } else {
          element.style.display = 'block';
        }
      });
      // Hide unauthenticated elements
      authOptionalElements.forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
      // Update user name
      const user = Utils.getLocalStorage<{name: string}>('user');
      if (user && user.name) {
        userNameElements.forEach(el => {
          el.textContent = `Welcome, ${user.name}`;
        });
      }
    } else {
      // Hide authenticated elements
      authRequiredElements.forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
      // Show unauthenticated elements
      authOptionalElements.forEach(el => {
        (el as HTMLElement).style.display = 'block';
      });
    }
  }

  private async handleLogout(): Promise<void> {
    try {
      await apiService.logout();
      Utils.showNotification('Logged out successfully', 'success');
      this.updateAuthStatus();
      setTimeout(() => {
        Utils.navigateTo('/');
      }, 1000);
    } catch (error) {
      Utils.showNotification('Error logging out', 'error');
    }
  }

  private async bootstrapNotifications(): Promise<void> {
    try {
      await userNotificationService.initialize();
    } catch (e) {
      console.warn('Notification bootstrap failed:', e);
    }
  }

  render(): HTMLElement {
    return this.element;
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.element);
  }

  // Public method to refresh auth status
  refreshAuthStatus(): void {
    this.updateAuthStatus();
  }
}
