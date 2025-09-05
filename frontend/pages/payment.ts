// Payment page functionality
import { apiService, PaymentRequest, Booking } from '../services/api.ts';
import Utils from '../services/utils.ts';

class PaymentPage {
  private bookingId: string | null;
  private bookingData: Booking | null = null;
  private paymentForm: HTMLFormElement | null = null;
  private paymentButton: HTMLButtonElement | null = null;
  private totalAmount: number = 0;
  // Coupon state
  private appliedCouponCode: string | null = null;
  private couponDiscount: number = 0;
  // Apply coupon toggle
  private applyCouponToggle: boolean = true;
  // User pass status
  private userPassStatus: any = null;
  // Payment step tracking
  private currentStep: number = 1;
  private maxSteps: number = 3;

  constructor() {
    this.bookingId = Utils.getQueryParam('booking_id');
    console.log('Payment page initialized with booking ID:', this.bookingId);
    
    // Debug: Check what's in localStorage
    const bookingData = Utils.getLocalStorage<any>('booking_data');
    const pendingBooking = Utils.getLocalStorage<any>('pending_booking');
    console.log('Local storage - booking_data:', bookingData);
    console.log('Local storage - pending_booking:', pendingBooking);
    
    this.init();
  }

  private async init(): Promise<void> {
    await this.initializeElements();
    this.attachEventListeners();
    this.loadUserPassStatus();
    this.loadBookingData();
    this.setupPageUnloadHandler();
    this.initializePaymentSteps();
  }

  private async initializeElements(): Promise<void> {
    // Check if user is authenticated
    if (!(await apiService.isAuthenticated())) {
      Utils.showNotification('Please login to continue with payment', 'warning');
      setTimeout(() => {
        Utils.navigateTo('login.html');
      }, 2000);
      return;
    }

    this.paymentForm = document.getElementById('paymentForm') as HTMLFormElement;
    this.paymentButton = document.getElementById('paymentBtn') as HTMLButtonElement;

    // Hide mobile fields with utility class instead of inline style
    const mobileFields = document.getElementById('mobile-fields');
    if (mobileFields) mobileFields.classList.add('hidden');

    // Coupon UI a11y
    const couponInput = document.getElementById('coupon-input') as HTMLInputElement | null;
    if (couponInput) {
      couponInput.setAttribute('maxlength', '32');
      couponInput.setAttribute('autocomplete', 'off');
    }

    // Apply coupon checkbox
    const couponToggle = document.getElementById('apply-coupon-toggle') as HTMLInputElement | null;
    if (couponToggle) {
      this.applyCouponToggle = true;
      couponToggle.checked = true;
      couponToggle.addEventListener('change', () => {
        this.applyCouponToggle = !!couponToggle.checked;
      });
    }
  }

  private attachEventListeners(): void {
    if (!this.paymentForm || !this.paymentButton) {
      return;
    }
    
    // Payment form submission
    this.paymentForm.addEventListener('submit', (e) => this.handlePayment(e));

    // Payment method selection
    const paymentMethods = document.querySelectorAll('input[name="payment_method"]');
    paymentMethods.forEach(method => {
      method.addEventListener('change', () => {
        this.handlePaymentMethodChange();
        this.updatePaymentMethodUI();
      });
    });

    // Card number formatting & preview
    const cardNumberInput = document.getElementById('card_number') as HTMLInputElement;
    if (cardNumberInput) {
      cardNumberInput.addEventListener('input', (e) => {
        this.formatCardNumber(e);
        const num = (e.target as HTMLInputElement).value || '';
        const preview = document.getElementById('previewNumber');
        if (preview) preview.textContent = num.trim() || '•••• •••• •••• ••••';
        this.updateCardBrand(num);
      });
      cardNumberInput.setAttribute('aria-label', 'Card number');
    }

    // Expiry date formatting & preview
    const expiryInput = document.getElementById('expiry_date') as HTMLInputElement;
    if (expiryInput) {
      expiryInput.addEventListener('input', (e) => {
        this.formatExpiryDate(e);
        const val = (e.target as HTMLInputElement).value || '';
        const preview = document.getElementById('previewExpiry');
        if (preview) preview.textContent = val || 'MM/YY';
      });
      expiryInput.setAttribute('aria-label', 'Expiry date');
    }

    // CVV validation
    const cvvInput = document.getElementById('cvv') as HTMLInputElement;
    if (cvvInput) {
      cvvInput.addEventListener('input', (e) => {
        this.validateCVV(e);
        const cvvValue = (e.target as HTMLInputElement).value;
        this.updateCVVPreview(cvvValue);
      });
      cvvInput.addEventListener('focus', () => this.flipCard(true));
      cvvInput.addEventListener('blur', () => this.flipCard(false));
      cvvInput.setAttribute('aria-label', 'Security code');
    }

    // Card holder preview
    const holderInput = document.getElementById('card_holder') as HTMLInputElement;
    if (holderInput) {
      holderInput.addEventListener('input', (e) => {
        const val = (e.target as HTMLInputElement).value.toUpperCase() || '';
        const preview = document.getElementById('previewHolder');
        if (preview) preview.textContent = val || 'CARDHOLDER';
      });
      holderInput.setAttribute('aria-label', 'Card holder name');
    }

    // Back button
    const backButton = document.querySelector('a[href="booking.html"]');
    if (backButton) {
      backButton.addEventListener('click', (e) => {
        e.preventDefault();
        Utils.goBack();
      });
    }

    // Coupon: apply
    const applyBtn = document.getElementById('apply-coupon-btn');
    const couponInput = document.getElementById('coupon-input') as HTMLInputElement | null;
    if (applyBtn && couponInput) {
      applyBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!this.applyCouponToggle) {
          this.showCouponMessage('Enable "Apply coupon" to use a code', 'info');
          return;
        }
        const code = (couponInput.value || '').trim();
        if (!code) {
          this.showCouponMessage('Please enter a coupon code', 'warning');
          return;
        }
        
        console.log('=== Applying Coupon ===');
        console.log('Coupon code:', code);
        console.log('Current total amount:', this.totalAmount);
        console.log('Current booking ID:', this.bookingId);
        
        // For bookings with booking ID, verify through API
        if (this.bookingId) {
          let bookingIdForCoupon = parseInt(this.bookingId);
          
          console.log('Verifying coupon with booking ID:', bookingIdForCoupon);
          
          try {
            // Verify coupon via API
            const res = await apiService.verifyCoupon(code, bookingIdForCoupon);
            
            if (res.success && res.data && (res.data as any).valid) {
              const data = res.data as any;
              this.appliedCouponCode = code;
              this.couponDiscount = data.discount_amount || 0;
              this.updateSummaryWithDiscount(data.final_amount, data.discount_amount, data.coupon_type);
              this.toggleCouponAppliedUI(true, code);
              this.showCouponMessage(data.message || 'Coupon applied successfully', 'success');
            } else {
              const d = res.data as any;
              const msg = d?.message || d?.error || res.error || 'Invalid coupon code';
              this.appliedCouponCode = null;
              this.couponDiscount = 0;
              this.toggleCouponAppliedUI(false);
              this.updateSummaryWithDiscount();
              this.showCouponMessage(msg, 'error');
            }
          } catch (error) {
            console.error('Coupon verification error:', error);
            // Fallback: Try manual coupon validation for common codes
            if (this.validateManualCoupon(code)) {
              return;
            }
            this.showCouponMessage('Error verifying coupon. Please try again.', 'error');
          }
        } else {
          // For pending bookings without booking ID, use manual validation
          console.log('No booking ID, trying manual coupon validation');
          if (this.validateManualCoupon(code)) {
            return;
          }
          this.showCouponMessage('Unable to verify coupon at this time', 'error');
        }
      });
    }

    // Coupon: remove
    const removeBtn = document.getElementById('remove-coupon-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.appliedCouponCode = null;
        this.couponDiscount = 0;
        this.toggleCouponAppliedUI(false);
        this.updateSummaryWithDiscount();
        this.showCouponMessage('Coupon removed', 'info');
        if (couponInput) couponInput.value = '';
      });
    }
  }

  private async loadUserPassStatus(): Promise<void> {
    try {
      const response = await apiService.getUserPassStatus();
      
      if (response.success && response.data) {
        this.userPassStatus = response.data;
        this.displayPassInformation();
      }
    } catch (error) {
      console.error('Failed to load user pass status:', error);
    }
  }

  private displayPassInformation(): void {
    if (!this.userPassStatus) return;

    // Add pass status information before the coupon section
    const couponSection = document.querySelector('.coupon-section');
    
    // Remove existing pass info to prevent duplicates
    const existingPassInfo = document.getElementById('pass-info');
    if (existingPassInfo) {
      existingPassInfo.remove();
    }
    
    if (couponSection && !document.getElementById('pass-info')) {
      const passInfoHtml = `
        <div id="pass-info" class="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 mb-6 border border-blue-200 relative z-10">
          <h4 class="text-lg font-semibold text-gray-800 mb-3">
            <i class="fas fa-crown text-yellow-500"></i> Your Pass Status
          </h4>
          <div class="grid grid-cols-1 gap-3">
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium text-gray-600">Current Tier:</span>
                <span class="px-2 py-1 rounded-full text-xs font-semibold ${this.getTierColor()}">${this.userPassStatus.current_tier}</span>
              </div>
              <div class="text-sm text-gray-600">
                <strong>${this.userPassStatus.total_bookings}</strong> bookings completed
              </div>
              ${this.userPassStatus.discount_rate !== '0%' ? `
                <div class="text-sm text-green-600 font-medium">
                  🎉 You get ${this.userPassStatus.discount_rate} discount!
                </div>
              ` : ''}
            </div>
            
            ${this.userPassStatus.next_tier.name ? `
              <div class="space-y-2">
                <div class="text-sm font-medium text-gray-600">Progress to ${this.userPassStatus.next_tier.name}:</div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="bg-blue-600 h-2 rounded-full" style="width: ${this.userPassStatus.next_tier.percentage}%"></div>
                </div>
                <div class="text-xs text-gray-500">
                  ${this.userPassStatus.next_tier.remaining} more bookings needed
                </div>
              </div>
            ` : `
              <div class="text-sm text-yellow-600 font-medium">
                🏆 Congratulations! You've reached the highest tier!
              </div>
            `}
          </div>
          
          ${this.userPassStatus.available_coupon_codes.length > 0 ? `
            <div class="mt-3 p-3 bg-white rounded border">
              <div class="text-sm font-medium text-gray-700 mb-2">Your Pass Codes:</div>
              <div class="flex flex-wrap gap-2">
                ${this.userPassStatus.available_coupon_codes.map((code: string) => `
                  <button class="pass-code-btn px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium hover:bg-blue-200 transition-colors" data-code="${code}">
                    ${code}
                  </button>
                `).join('')}
              </div>
              <div class="text-xs text-gray-500 mt-2">Click to use your pass discount</div>
            </div>
          ` : ''}
        </div>
      `;

      couponSection.insertAdjacentHTML('beforebegin', passInfoHtml);

      // Add click handlers for pass code buttons
      document.querySelectorAll('.pass-code-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const code = (e.target as HTMLButtonElement).dataset.code;
          if (code) {
            const couponInput = document.getElementById('coupon-input') as HTMLInputElement;
            if (couponInput) {
              couponInput.value = code;
              // Auto-apply the pass code
              const applyBtn = document.getElementById('apply-coupon-btn') as HTMLButtonElement;
              if (applyBtn) {
                applyBtn.click();
              }
            }
          }
        });
      });
    }
  }

  private getTierColor(): string {
    if (!this.userPassStatus) return 'bg-gray-100 text-gray-700';
    
    switch (this.userPassStatus.current_tier) {
      case 'Gold':
        return 'bg-yellow-100 text-yellow-800';
      case 'Silver':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-blue-100 text-blue-700';
    }
  }

  private async loadBookingData(): Promise<void> {
    console.log('=== Loading Booking Data ===');
    console.log('Booking ID from URL:', this.bookingId);
    
    if (!this.bookingId) {
      console.log('No booking ID in URL, checking localStorage...');
      
      // Check both possible storage keys for booking data
      let pendingBooking = Utils.getLocalStorage<any>('pending_booking');
      if (!pendingBooking) {
        pendingBooking = Utils.getLocalStorage<any>('booking_data');
        console.log('Checking booking_data:', pendingBooking);
      } else {
        console.log('Found pending_booking:', pendingBooking);
      }
      
      if (pendingBooking) {
        console.log('Found booking data in localStorage:', pendingBooking);
        
        // Handle both total_price and total_amount naming
        const rawAmount = pendingBooking.total_price || pendingBooking.total_amount;
        console.log('Raw amount from booking:', rawAmount, typeof rawAmount);
        
        this.totalAmount = rawAmount || 0;
        
        // Ensure totalAmount is a number
        if (typeof this.totalAmount === 'string') {
          this.totalAmount = parseFloat(this.totalAmount) || 0;
        }
        
        // Set booking ID if available
        if (pendingBooking.booking_id || pendingBooking.id) {
          this.bookingId = String(pendingBooking.booking_id || pendingBooking.id);
        }
        
        console.log('Final values:');
        console.log('- Total amount:', this.totalAmount, typeof this.totalAmount);
        console.log('- Booking ID:', this.bookingId);
        
        // Always show timer for pending bookings
        this.startExpiryTimer();
        this.renderBookingSummary(pendingBooking);
        return;
      } else {
        console.error('No booking data found in localStorage!');
        const allStorage: { [key: string]: string | null } = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            allStorage[key] = localStorage.getItem(key);
          }
        }
        console.log('All localStorage contents:', allStorage);
      }

      Utils.showNotification('No booking found. Please start a new booking.', 'error');
      setTimeout(() => {
        Utils.navigateTo('search.html');
      }, 2000);
      return;
    }

    try {
      const response = await apiService.getBookingDetails(parseInt(this.bookingId));
      if (response.success && response.data) {
        console.log('Booking details loaded from API:', response.data);
        this.bookingData = response.data;
        this.totalAmount = response.data.total_price;
        // Show booking expiry timer if booking is in CART or PENDING status
        if (response.data.status === 'CART' || response.data.status === 'PENDING') {
          this.startExpiryTimer();
        }
        this.renderBookingSummary(response.data);
      } else {
        console.warn('Failed to load booking details from API, checking localStorage...');
        // Fallback to localStorage
        const pendingBooking = Utils.getLocalStorage<any>('pending_booking') || Utils.getLocalStorage<any>('booking_data');
        if (pendingBooking && (pendingBooking.booking_id === parseInt(this.bookingId) || pendingBooking.id === parseInt(this.bookingId))) {
          this.totalAmount = pendingBooking.total_price || pendingBooking.total_amount || 0;
          this.renderBookingSummary(pendingBooking);
        } else {
          Utils.showNotification('Booking not found', 'error');
          setTimeout(() => {
            Utils.navigateTo('search.html');
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Error loading booking:', error);
      // Fallback to localStorage
      const pendingBooking = Utils.getLocalStorage<any>('pending_booking') || Utils.getLocalStorage<any>('booking_data');
      if (pendingBooking && (pendingBooking.booking_id === parseInt(this.bookingId) || pendingBooking.id === parseInt(this.bookingId))) {
        this.totalAmount = pendingBooking.total_price || pendingBooking.total_amount || 0;
        this.renderBookingSummary(pendingBooking);
      } else {
        Utils.showNotification('Error loading booking details', 'error');
        setTimeout(() => {
          Utils.navigateTo('search.html');
        }, 2000);
      }
    }
  }

  private renderBookingSummary(booking: any): void {
    const summaryContainer = document.getElementById('booking-summary');
    if (!summaryContainer) return;

    // Handle different seat data formats
    const seatsCount = booking.selected_seats?.length || 
                      booking.seats?.length || 
                      (booking.passenger_details?.length) || 0;
    
    // Handle different price formats
    const totalAmount = booking.total_price || booking.total_amount || this.totalAmount;
    
    // Ensure the class-level totalAmount is updated
    if (totalAmount && totalAmount !== this.totalAmount) {
      this.totalAmount = typeof totalAmount === 'string' ? parseFloat(totalAmount) : totalAmount;
    }
    
    console.log('Rendering summary with:', {
      seats: seatsCount,
      totalAmount: this.totalAmount,
      originalBookingAmount: totalAmount,
      bookingData: booking
    });

    summaryContainer.innerHTML = `
      <div class="bg-white rounded-lg p-6 shadow-md glass-card">
        <h3 class="text-lg font-semibold mb-4">Booking Summary</h3>
        <div class="space-y-3">
          <div class="flex justify-between">
            <span class="text-gray-600">Booking ID:</span>
            <span class="font-medium">${booking.id || booking.booking_id || 'Pending'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Seats:</span>
            <span class="font-medium">${seatsCount}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Seat Numbers:</span>
            <span class="font-medium">${(booking.selected_seats || booking.seats || []).join(', ') || 'N/A'}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Seat Class:</span>
            <span class="font-medium">${Utils.capitalizeFirst(booking.seat_class || 'Economy')}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Total Amount:</span>
            <span class="font-bold text-lg" id="summary-total">${Utils.formatCurrency(this.totalAmount)}</span>
          </div>
          <div class="flex justify-between" id="summary-discount-row" style="display:none">
            <span class="text-gray-600">Discount:</span>
            <span class="font-medium text-green-600" id="summary-discount">-</span>
          </div>
          <div class="border-t pt-3 flex justify-between">
            <span class="text-gray-800 font-semibold">Payable:</span>
            <span class="text-lg font-extrabold text-blue-700" id="summary-payable">${Utils.formatCurrency(this.computePayable())}</span>
          </div>
        </div>
      </div>
    `;
  }

  private computePayable(): number {
    const discount = this.couponDiscount || 0;
    return Math.max(0, this.totalAmount - discount);
  }

  private updateSummaryWithDiscount(finalAmount?: number, discountAmount?: number, couponType?: string): void {
    const totalEl = document.getElementById('summary-total');
    const discountRow = document.getElementById('summary-discount-row') as HTMLElement | null;
    const discountEl = document.getElementById('summary-discount');
    const payableEl = document.getElementById('summary-payable');

    const discount = typeof discountAmount === 'number' ? discountAmount : this.couponDiscount;

    if (discountRow && discountEl) {
      if (discount > 0) {
        discountRow.style.display = '';
        discountEl.textContent = `- ${Utils.formatCurrency(discount)}${couponType ? ' (' + couponType + ')' : ''}`;
      } else {
        discountRow.style.display = 'none';
      }
    }

    const payable = typeof finalAmount === 'number' ? Math.max(0, finalAmount) : this.computePayable();
    if (payableEl) payableEl.textContent = Utils.formatCurrency(payable);
    if (totalEl) totalEl.textContent = Utils.formatCurrency(this.totalAmount);

    // If mobile payment fields are visible, update the instruction amount as well
    const mobileAmount = document.getElementById('mobile-amount');
    if (mobileAmount) {
      mobileAmount.textContent = Utils.formatCurrency(payable);
    }
  }

  private async handlePayment(e: Event): Promise<void> {
    e.preventDefault();

    if (!this.paymentForm || !this.paymentButton) {
      Utils.showNotification('Form not properly initialized', 'error');
      return;
    }

    if (!this.validatePaymentForm()) {
      return;
    }

    // Progress to final step
    this.updatePaymentStep(3);

    // Disable button and show loading
    Utils.disableButton(this.paymentButton, 'Processing payment...');

    try {
      const formData = new FormData(this.paymentForm);
      const paymentMethod = formData.get('payment_method') as string;
      
      const paymentData: PaymentRequest = {
        booking_id: parseInt(this.bookingId || '0'),
        amount: this.totalAmount,
        payment_method: paymentMethod.toUpperCase(),
        coupon_code: this.applyCouponToggle ? (this.appliedCouponCode || undefined) : undefined,
        apply_coupon: this.applyCouponToggle,
  discount_amount: 0, // discounts applied server-side
  service_charge: 0,
        payment_details: {}
      };

      // Add payment-specific details
      if (paymentMethod === 'card') {
        paymentData.payment_details = {
          card_number: formData.get('card_number') as string,
          card_holder: formData.get('card_holder') as string,
          expiry_date: formData.get('expiry_date') as string,
          cvv: formData.get('cvv') as string,
        };
      } else if (['bkash', 'nagad', 'rocket', 'upay'].includes(paymentMethod)) {
        paymentData.payment_details = {
          mobile_number: formData.get('mobile_number') as string,
          transaction_id: formData.get('transaction_id') as string,
        };
      }

      const response = await apiService.createPayment(paymentData);

      if (response.success && response.data) {
        Utils.showNotification('Payment successful!', 'success');
        
        // Store payment and booking data for confirmation page
        Utils.setLocalStorage('lastPayment', response.data);
        if (this.bookingData) {
          Utils.setLocalStorage('lastBooking', this.bookingData);
        }
        
        // Store the selected schedule data if available
        const selectedSchedule = Utils.getLocalStorage('selectedSchedule');
        if (selectedSchedule) {
          Utils.setLocalStorage('selectedSchedule', selectedSchedule);
        }
        
        Utils.removeLocalStorage('pending_booking');
        setTimeout(() => {
          Utils.navigateTo(`confirmation.html?payment_id=${response.data!.id}&booking_id=${this.bookingId}`);
        }, 2000);
      } else {
        let errorMessage = 'Payment failed';
        if (response.error) {
          if (typeof response.error === 'string') {
            errorMessage = response.error;
          } else if (typeof response.error === 'object' && (response.error as any).detail) {
            errorMessage = (response.error as any).detail;
          }
        }
        if (errorMessage.includes('no longer available')) {
          Utils.showNotification('Selected seats are no longer available. Please select different seats.', 'error');
          setTimeout(() => Utils.navigateTo('search.html'), 3000);
        } else {
          Utils.showNotification(errorMessage, 'error');
        }
      }
    } catch (error) {
      Utils.showNotification('Network error. Please try again.', 'error');
    } finally {
      if (this.paymentButton) {
        Utils.enableButton(this.paymentButton);
      }
    }
  }

  private showCouponMessage(message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info'): void {
    const el = document.getElementById('coupon-message');
    if (!el) return;
    el.classList.remove('hidden');
    el.textContent = message;
    el.className = 'text-sm mt-2 ' + (type === 'success' ? 'text-green-600' : type === 'warning' ? 'text-yellow-700' : type === 'error' ? 'text-red-600' : 'text-gray-600');
  }

  private toggleCouponAppliedUI(applied: boolean, code?: string): void {
    const appliedEl = document.getElementById('applied-coupon');
    const codeEl = document.getElementById('applied-coupon-code');
    const input = document.getElementById('coupon-input') as HTMLInputElement | null;
    const applyBtn = document.getElementById('apply-coupon-btn') as HTMLButtonElement | null;

    if (appliedEl) appliedEl.classList.toggle('hidden', !applied);
    if (codeEl && code) codeEl.textContent = code.toUpperCase();
    if (input) input.disabled = applied;
    if (applyBtn) applyBtn.disabled = applied;
  }

  private validatePaymentForm(): boolean {
    const paymentMethod = (document.querySelector('input[name="payment_method"]:checked') as HTMLInputElement)?.value;
    
    if (!paymentMethod) {
      Utils.showNotification('Please select a payment method', 'warning');
      return false;
    }

    if (paymentMethod === 'card') {
      const cardNumber = (document.getElementById('card_number') as HTMLInputElement)?.value;
      const cardHolder = (document.getElementById('card_holder') as HTMLInputElement)?.value;
      const expiryDate = (document.getElementById('expiry_date') as HTMLInputElement)?.value;
      const cvv = (document.getElementById('cvv') as HTMLInputElement)?.value;

      if (!cardNumber || !cardHolder || !expiryDate || !cvv) {
        Utils.showNotification('Please fill in all card details', 'warning');
        return false;
      }

      if (!this.validateCardNumber(cardNumber)) {
        Utils.showNotification('Please enter a valid card number', 'warning');
        return false;
      }

      if (!this.validateExpiryDate(expiryDate)) {
        Utils.showNotification('Please enter a valid expiry date', 'warning');
        return false;
      }

      if (!this.validateCVVValue(cvv)) {
        Utils.showNotification('Please enter a valid CVV', 'warning');
        return false;
      }
    } else if (['bkash', 'nagad', 'rocket', 'upay'].includes(paymentMethod)) {
      const mobileNumber = (document.getElementById('mobile_number') as HTMLInputElement)?.value;
      
      if (!mobileNumber) {
        Utils.showNotification('Please enter your mobile number', 'warning');
        return false;
      }
      
      if (!this.validateMobileNumber(mobileNumber)) {
        Utils.showNotification('Please enter a valid mobile number', 'warning');
        return false;
      }
    }

    return true;
  }

  private validateMobileNumber(mobile: string): boolean {
    // Bangladesh mobile number validation
    const cleanMobile = mobile.replace(/[^\d]/g, '');
    return /^01[3-9]\d{8}$/.test(cleanMobile);
  }

  private validateCardNumber(cardNumber: string): boolean {
    // Remove spaces and check if it's a valid card number (basic validation)
    const cleanNumber = cardNumber.replace(/\s/g, '');
    return /^\d{13,19}$/.test(cleanNumber);
  }

  private validateExpiryDate(expiryDate: string): boolean {
    const [month, year] = expiryDate.split('/');
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear() % 100;
    const currentMonth = currentDate.getMonth() + 1;

    const expMonth = parseInt(month);
    const expYear = parseInt(year);

    if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
      return false;
    }

    return expMonth >= 1 && expMonth <= 12;
  }

  private validateCVVValue(cvv: string): boolean {
    return /^\d{3,4}$/.test(cvv);
  }

  private handlePaymentMethodChange(): void {
    const selectedMethod = (document.querySelector('input[name="payment_method"]:checked') as HTMLInputElement)?.value;
    const cardFields = document.getElementById('card-fields');
    const mobileFields = document.getElementById('mobile-fields');
    const mobileAmount = document.getElementById('mobile-amount');
    
    if (cardFields) {
      cardFields.classList.toggle('hidden', selectedMethod !== 'card');
    }
    
    if (mobileFields) {
      const isMobile = ['bkash', 'nagad', 'rocket', 'upay'].includes(selectedMethod || '');
      mobileFields.classList.toggle('hidden', !isMobile);
      
      if (isMobile && mobileAmount) {
        // Show current payable (without tax/service)
        mobileAmount.textContent = Utils.formatCurrency(this.computePayable());
      }
    }

    // Progress to step 2 when payment method is selected
    if (selectedMethod) {
      this.updatePaymentStep(2);
    }
  }

  private formatCardNumber(e: Event): void {
    const input = e.target as HTMLInputElement;
    let value = input.value.replace(/\s/g, '');
    
    // Add spaces every 4 digits
    value = value.replace(/(\d{4})(?=\d)/g, '$1 ');
    
    // Limit to 19 characters (16 digits + 3 spaces)
    value = value.substring(0, 19);
    
    input.value = value;
  }

  private formatExpiryDate(e: Event): void {
    const input = e.target as HTMLInputElement;
    let value = input.value.replace(/\D/g, '');
    
    // Add slash after 2 digits
    if (value.length >= 2) {
      value = value.substring(0, 2) + '/' + value.substring(2);
    }
    
    // Limit to 5 characters (MM/YY)
    value = value.substring(0, 5);
    
    input.value = value;
  }

  private validateCVV(e: Event): void {
    const input = e.target as HTMLInputElement;
    let value = input.value.replace(/\D/g, '');
    
    // Limit to 4 digits
    value = value.substring(0, 4);
    
    input.value = value;
  }

  private startExpiryTimer(): void {
    const expiryElement = document.createElement('div');
    expiryElement.id = 'booking-expiry';
    expiryElement.className = 'bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4';
    expiryElement.innerHTML = `
      <div class="flex items-center">
        <i class="fas fa-clock text-yellow-600 mr-2"></i>
        <span class="text-sm font-medium text-yellow-800">Booking expires in: <span id="timer" class="font-bold">15:00</span></span>
      </div>
    `;

    // Insert after the info banner
    const infoBanner = document.querySelector('.bg-white');
    if (infoBanner && infoBanner.parentNode) {
      infoBanner.parentNode.insertBefore(expiryElement, infoBanner.nextSibling);
    }

    // Start countdown (15 minutes)
    let timeLeft = 15 * 60; // 15 minutes in seconds
    const timer = setInterval(() => {
      const minutes = Math.floor(timeLeft / 60);
      const seconds = timeLeft % 60;
      const timerElement = document.getElementById('timer');
      
      if (timerElement) {
        timerElement.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      }
      
      if (timeLeft <= 0) {
        clearInterval(timer);
        Utils.showNotification('Booking expired. Please start a new booking.', 'error');
        setTimeout(() => Utils.navigateTo('search.html'), 3000);
      }
      
      timeLeft--;
    }, 1000);
  }

  private setupPageUnloadHandler(): void {
    // Remove automatic cart cancellation on page unload
    // Let the backend auto-expiry system handle abandoned carts after 30 minutes
    // This prevents bookings from being cancelled when users navigate within the site
    console.log('Payment page unload handler setup - automatic cancellation disabled');
  }

  // Enhanced Card Preview Methods
  private flipCard(showBack: boolean): void {
    const cardPreview = document.getElementById('cardPreview');
    if (cardPreview) {
      if (showBack) {
        cardPreview.classList.add('flipped');
      } else {
        cardPreview.classList.remove('flipped');
      }
    }
  }

  private updateCardBrand(cardNumber: string): void {
    const brandElement = document.getElementById('cardBrand');
    if (!brandElement) return;

    const cleanNumber = cardNumber.replace(/\s/g, '');
    let brand = 'CARD';

    if (/^4/.test(cleanNumber)) {
      brand = 'VISA';
    } else if (/^5[1-5]/.test(cleanNumber)) {
      brand = 'MASTERCARD';
    } else if (/^3[47]/.test(cleanNumber)) {
      brand = 'AMEX';
    } else if (/^6/.test(cleanNumber)) {
      brand = 'DISCOVER';
    }

    brandElement.textContent = brand;
  }

  private updateCVVPreview(cvv: string): void {
    const previewCVV = document.getElementById('previewCVV');
    if (previewCVV) {
      previewCVV.textContent = cvv || '•••';
    }
  }

  // Payment Step Management
  private initializePaymentSteps(): void {
    this.updatePaymentStep(1);
  }

  private updatePaymentStep(step: number): void {
    this.currentStep = Math.min(Math.max(1, step), this.maxSteps);
    
    const steps = document.querySelectorAll('.payment-steps .step');
    steps.forEach((stepEl, index) => {
      const stepNumber = index + 1;
      
      stepEl.classList.remove('active', 'completed');
      
      if (stepNumber < this.currentStep) {
        stepEl.classList.add('completed');
      } else if (stepNumber === this.currentStep) {
        stepEl.classList.add('active');
      }
    });
  }

  private nextStep(): void {
    if (this.currentStep < this.maxSteps) {
      this.updatePaymentStep(this.currentStep + 1);
    }
  }

  private prevStep(): void {
    if (this.currentStep > 1) {
      this.updatePaymentStep(this.currentStep - 1);
    }
  }

  private updatePaymentMethodUI(): void {
    const paymentMethodCards = document.querySelectorAll('.payment-method-card');
    paymentMethodCards.forEach(card => {
      const input = card.querySelector('input[type="radio"]') as HTMLInputElement;
      if (input && input.checked) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
  }

  // Fallback manual coupon validation for common codes
  private validateManualCoupon(code: string): boolean {
    const upperCode = code.toUpperCase();
    let discount = 0;
    let couponType = '';
    
    // Silver pass codes (5% discount)
    if (['SILVER20', 'SILVERPASS'].includes(upperCode)) {
      discount = Math.floor(this.totalAmount * 0.05);
      couponType = 'Silver Pass (5%)';
    }
    // Gold pass codes (8% discount)
    else if (['GOLD40', 'GOLDPASS'].includes(upperCode)) {
      discount = Math.floor(this.totalAmount * 0.08);
      couponType = 'Gold Pass (8%)';
    }
    // Other common codes
    else if (['WELCOME10', 'FIRST10'].includes(upperCode)) {
      discount = Math.floor(this.totalAmount * 0.10);
      couponType = 'Welcome Discount (10%)';
    }
    else if (['SAVE5', 'DISCOUNT5'].includes(upperCode)) {
      discount = Math.floor(this.totalAmount * 0.05);
      couponType = 'Save More (5%)';
    }
    
    if (discount > 0) {
      this.appliedCouponCode = code;
      this.couponDiscount = discount;
      const finalAmount = this.totalAmount - discount;
      this.updateSummaryWithDiscount(finalAmount, discount, couponType);
      this.toggleCouponAppliedUI(true, code);
      this.showCouponMessage(`${couponType} applied successfully! You saved ৳${discount}`, 'success');
      return true;
    }
    
    return false;
  }
}

// Initialize payment page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PaymentPage();
});