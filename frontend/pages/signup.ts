// Enhanced Multi-Step Signup page functionality
import { apiService, SignupRequest } from '../services/api.ts';
import Utils from '../services/utils.ts';

interface StepValidation {
  isValid: boolean;
  errors: string[];
}

class SignupPage {
  private form!: HTMLFormElement;
  private currentStep: number = 1;
  private totalSteps: number = 4;
  
  // Form elements
  private fullNameInput!: HTMLInputElement;
  private emailInput!: HTMLInputElement;
  private phoneInput!: HTMLInputElement;
  private genderSelect!: HTMLSelectElement;
  private dateOfBirthInput!: HTMLInputElement;
  private idTypeSelect!: HTMLSelectElement;
  private idNumberInput!: HTMLInputElement;
  private passwordInput!: HTMLInputElement;
  private confirmPasswordInput!: HTMLInputElement;
  private termsCheckbox!: HTMLInputElement;
  
  // Navigation elements
  private prevButton!: HTMLButtonElement;
  private nextButton!: HTMLButtonElement;
  private submitButton!: HTMLButtonElement;
  private stepCounter!: HTMLElement;
  private progressBar!: HTMLElement;
  
  // Step indicators
  private stepIndicators!: HTMLElement[];
  private formSteps!: HTMLElement[];
  
  // Background animation elements
  private dynamicBackground!: HTMLElement;
  // private particlesContainer!: HTMLElement; // DISABLED - No particles
  
  // Tunnel/Portal animation elements - DISABLED
  // private tunnelContainer!: HTMLElement;
  // private wormholeEffect!: HTMLElement;
  // private dimensionShift!: HTMLElement;
  // Universe transition disabled - no more circle animation
  // private universeTransition!: HTMLElement;

  constructor() {
    this.initializeElements();
    this.attachEventListeners();
    this.updateUI(false); // No tunnel animation on initial load
    this.checkAuthStatus();
    this.setupDateConstraints();
    this.testBackendConnection();
  }

  private initializeElements(): void {
    this.form = document.getElementById('signupForm') as HTMLFormElement;
    
    // Form inputs
    this.fullNameInput = document.getElementById('fullName') as HTMLInputElement;
    this.emailInput = document.getElementById('email') as HTMLInputElement;
    this.phoneInput = document.getElementById('phone') as HTMLInputElement;
    this.genderSelect = document.getElementById('gender') as HTMLSelectElement;
    this.dateOfBirthInput = document.getElementById('dateOfBirth') as HTMLInputElement;
    this.idTypeSelect = document.getElementById('idType') as HTMLSelectElement;
    this.idNumberInput = document.getElementById('idNumber') as HTMLInputElement;
    this.passwordInput = document.getElementById('password') as HTMLInputElement;
    this.confirmPasswordInput = document.getElementById('confirmPassword') as HTMLInputElement;
    this.termsCheckbox = document.getElementById('terms') as HTMLInputElement;
    
    // Navigation
    this.prevButton = document.getElementById('prevStep') as HTMLButtonElement;
    this.nextButton = document.getElementById('nextStep') as HTMLButtonElement;
    this.submitButton = document.getElementById('submitBtn') as HTMLButtonElement;
    this.stepCounter = document.getElementById('stepCounter') as HTMLElement;
    this.progressBar = document.getElementById('progressBar') as HTMLElement;
    
    // Step indicators and form steps
    this.stepIndicators = [];
    this.formSteps = [];
    
    for (let i = 1; i <= this.totalSteps; i++) {
      const indicator = document.getElementById(`step-${i}-indicator`) as HTMLElement;
      const step = document.getElementById(`step-${i}`) as HTMLElement;
      
      if (indicator) this.stepIndicators.push(indicator);
      if (step) this.formSteps.push(step);
    }

    // Background animation system
    this.dynamicBackground = document.getElementById('dynamicBackground') as HTMLElement;
    // this.particlesContainer = document.getElementById('particlesContainer') as HTMLElement; // DISABLED
    
    // Tunnel/Portal animation system - DISABLED
    // this.tunnelContainer = document.getElementById('tunnelContainer') as HTMLElement;
    // this.wormholeEffect = document.getElementById('wormholeEffect') as HTMLElement;
    // this.dimensionShift = document.getElementById('dimensionShift') as HTMLElement;
    // Universe transition disabled - no more circle animation
    // this.universeTransition = document.getElementById('universeTransition') as HTMLElement;
    
    // Initialize particles and animations
    this.initializeBackgroundAnimations();
  }

  private setupDateConstraints(): void {
    // Set max date to today (user must be at least 0 years old)
    const today = new Date().toISOString().split('T')[0];
    this.dateOfBirthInput.max = today;
    
    // Set min date to 120 years ago (reasonable age limit)
    const minDate = new Date();
    minDate.setFullYear(minDate.getFullYear() - 120);
    this.dateOfBirthInput.min = minDate.toISOString().split('T')[0];
  }

  private attachEventListeners(): void {
    // Form submission
    this.form.addEventListener('submit', (e) => this.handleSignup(e));

    // Navigation buttons
    this.prevButton.addEventListener('click', () => this.previousStep());
    this.nextButton.addEventListener('click', () => this.nextStep());

    // Real-time validation
    this.fullNameInput.addEventListener('blur', () => this.validateField('fullName'));
    this.fullNameInput.addEventListener('input', () => this.clearFieldError('fullName'));
    
    this.emailInput.addEventListener('blur', () => this.validateField('email'));
    this.emailInput.addEventListener('input', () => this.clearFieldError('email'));
    
    this.phoneInput.addEventListener('blur', () => this.validateField('phone'));
    this.phoneInput.addEventListener('input', () => this.clearFieldError('phone'));
    
    this.genderSelect.addEventListener('change', () => this.validateField('gender'));
    this.dateOfBirthInput.addEventListener('blur', () => this.validateField('dateOfBirth'));
    this.idTypeSelect.addEventListener('change', () => this.validateField('idType'));
    this.idNumberInput.addEventListener('blur', () => this.validateField('idNumber'));
    
    this.passwordInput.addEventListener('input', () => {
      this.validateField('password');
      this.updatePasswordStrength();
    });
    
    this.confirmPasswordInput.addEventListener('blur', () => this.validateField('confirmPassword'));
    this.termsCheckbox.addEventListener('change', () => this.validateField('terms'));

    // Password visibility toggle
    const togglePassword = document.getElementById('togglePassword');
    const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
    
    if (togglePassword) {
      togglePassword.addEventListener('click', () => this.togglePasswordVisibility('password'));
    }
    
    if (toggleConfirmPassword) {
      toggleConfirmPassword.addEventListener('click', () => this.togglePasswordVisibility('confirmPassword'));
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (this.currentStep < this.totalSteps) {
          this.nextStep();
        } else {
          this.handleSignup(e);
        }
      }
    });
  }

  private checkAuthStatus(): void {
    // Temporarily disabled to allow signup page access
    // TODO: Re-enable after fixing authentication check
    /*
    if (apiService.isAuthenticated()) {
      Utils.navigateTo('../index.html');
    }
    */
  }

  private validateField(fieldName: string): boolean {
    switch (fieldName) {
      case 'fullName':
        return this.validateFullName();
      case 'email':
        return this.validateEmail();
      case 'phone':
        return this.validatePhone();
      case 'gender':
        return this.validateGender();
      case 'dateOfBirth':
        return this.validateDateOfBirth();
      case 'idType':
        return this.validateIdType();
      case 'idNumber':
        return this.validateIdNumber();
      case 'password':
        return this.validatePassword();
      case 'confirmPassword':
        return this.validateConfirmPassword();
      case 'terms':
        return this.validateTerms();
      default:
        return false;
    }
  }

  private validateStep(step: number): StepValidation {
    const errors: string[] = [];
    let isValid = true;

    switch (step) {
      case 1:
        if (!this.validateFullName()) {
          errors.push('Please enter a valid full name');
          isValid = false;
        }
        if (!this.validateEmail()) {
          errors.push('Please enter a valid email address');
          isValid = false;
        }
        break;
        
      case 2:
        if (!this.validatePhone()) {
          errors.push('Please enter a valid phone number');
          isValid = false;
        }
        if (!this.validateGender()) {
          errors.push('Please select your gender');
          isValid = false;
        }
        if (!this.validateDateOfBirth()) {
          errors.push('Please enter a valid date of birth');
          isValid = false;
        }
        break;
        
      case 3:
        if (!this.validateIdType()) {
          errors.push('Please select your ID type');
          isValid = false;
        }
        if (!this.validateIdNumber()) {
          errors.push('Please enter a valid ID number');
          isValid = false;
        }
        break;
        
      case 4:
        if (!this.validatePassword()) {
          errors.push('Please enter a strong password');
          isValid = false;
        }
        if (!this.validateConfirmPassword()) {
          errors.push('Passwords do not match');
          isValid = false;
        }
        if (!this.validateTerms()) {
          errors.push('Please accept the terms and conditions');
          isValid = false;
        }
        break;
    }

    return { isValid, errors };
  }

  private nextStep(): void {
    const validation = this.validateStep(this.currentStep);
    
    if (!validation.isValid) {
      this.showAlert(validation.errors.join('. '), 'error');
      return;
    }

    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
      this.updateUI(true); // Trigger tunnel animation when moving to next step
      this.showAlert('Step completed successfully!', 'success', 2000);
    }
  }

  private previousStep(): void {
    if (this.currentStep > 1) {
      this.currentStep--;
      this.updateUI(false); // No tunnel animation when going back
    }
  }

  private updateUI(triggerAnimation: boolean = false): void {
    // Update progress bar
    const progress = (this.currentStep / this.totalSteps) * 100;
    this.progressBar.style.width = `${progress}%`;

    // Update step counter
    this.stepCounter.textContent = `Step ${this.currentStep} of ${this.totalSteps}`;

    // Update step indicators
    this.stepIndicators.forEach((indicator, index) => {
      indicator.classList.remove('active', 'completed');
      
      if (index + 1 < this.currentStep) {
        indicator.classList.add('completed');
        indicator.innerHTML = '<i class="fas fa-check"></i>';
      } else if (index + 1 === this.currentStep) {
        indicator.classList.add('active');
        indicator.textContent = (index + 1).toString();
      } else {
        indicator.textContent = (index + 1).toString();
      }
    });

    // Update form steps
    this.formSteps.forEach((step, index) => {
      step.classList.remove('active');
      step.classList.add('hidden');
      
      if (index + 1 === this.currentStep) {
        step.classList.remove('hidden');
        step.classList.add('active');
      }
    });

    // Update navigation buttons
    this.prevButton.disabled = this.currentStep === 1;
    
    if (this.currentStep === this.totalSteps) {
      this.nextButton.classList.add('hidden');
      this.submitButton.classList.remove('hidden');
    } else {
      this.nextButton.classList.remove('hidden');
      this.submitButton.classList.add('hidden');
    }
    
    // Trigger background animation for step change ONLY when requested
    if (triggerAnimation) {
      this.triggerStepAnimation();
    }
  }

  private async handleSignup(e: Event): Promise<void> {
    e.preventDefault();

    // Final validation
    const validation = this.validateStep(this.currentStep);
    if (!validation.isValid) {
      this.showAlert(validation.errors.join('. '), 'error');
      return;
    }

    // Disable submit button and show loading
    Utils.disableButton(this.submitButton, 'Creating account...');

    try {
      const signupData: SignupRequest = {
        name: this.fullNameInput.value.trim(),
        email: this.emailInput.value.trim(),
        phone: this.phoneInput.value.trim(),
        password: this.passwordInput.value,
        gender: this.genderSelect.value as 'male' | 'female' | 'other',
        date_of_birth: this.dateOfBirthInput.value,
        id_type: this.idTypeSelect.value as 'nid' | 'passport' | 'birth_certificate' | 'driving_license',
        id_number: this.idNumberInput.value.trim(),
      };

      const response = await apiService.signup(signupData);

      if (response.success) {
        this.showAlert('Account created successfully! Redirecting to login...', 'success');
        
        // Redirect to login page
        setTimeout(() => {
          Utils.navigateTo('login.html');
        }, 2000);
      } else {
        this.showAlert(response.error || 'Signup failed. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Signup error:', error);
      this.showAlert('Network error. Please check your connection and try again.', 'error');
    } finally {
      Utils.enableButton(this.submitButton);
    }
  }

  // Validation methods
  private validateFullName(): boolean {
    const name = this.fullNameInput.value.trim();
    
    if (!name) {
      this.showFieldError('fullName', 'Full name is required');
      return false;
    }
    
    if (name.length < 2) {
      this.showFieldError('fullName', 'Name must be at least 2 characters long');
      return false;
    }
    
    if (!/^[a-zA-Z\s.'-]+$/.test(name)) {
      this.showFieldError('fullName', 'Name can only contain letters, spaces, and common punctuation');
      return false;
    }
    
    this.showFieldSuccess('fullName');
    return true;
  }

  private validateEmail(): boolean {
    const email = this.emailInput.value.trim();
    
    if (!email) {
      this.showFieldError('email', 'Email address is required');
      return false;
    }
    
    if (!Utils.validateEmail(email)) {
      this.showFieldError('email', 'Please enter a valid email address');
      return false;
    }
    
    this.showFieldSuccess('email');
    return true;
  }

  private validatePhone(): boolean {
    const phone = this.phoneInput.value.trim();
    
    if (!phone) {
      this.showFieldError('phone', 'Phone number is required');
      return false;
    }
    
    if (!Utils.validatePhone(phone)) {
      this.showFieldError('phone', 'Please enter a valid Bangladesh phone number');
      return false;
    }
    
    this.showFieldSuccess('phone');
    return true;
  }

  private validateGender(): boolean {
    const gender = this.genderSelect.value;
    
    if (!gender) {
      this.showFieldError('gender', 'Please select your gender');
      return false;
    }
    
    this.showFieldSuccess('gender');
    return true;
  }

  private validateDateOfBirth(): boolean {
    const dateOfBirth = this.dateOfBirthInput.value;
    
    if (!dateOfBirth) {
      this.showFieldError('dateOfBirth', 'Date of birth is required');
      return false;
    }
    
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    if (age < 5) {
      this.showFieldError('dateOfBirth', 'You must be at least 5 years old');
      return false;
    }
    
    if (age > 120) {
      this.showFieldError('dateOfBirth', 'Please enter a valid date of birth');
      return false;
    }
    
    this.showFieldSuccess('dateOfBirth');
    return true;
  }

  private validateIdType(): boolean {
    const idType = this.idTypeSelect.value;
    
    if (!idType) {
      this.showFieldError('idType', 'Please select your ID type');
      return false;
    }
    
    this.showFieldSuccess('idType');
    return true;
  }

  private validateIdNumber(): boolean {
    const idNumber = this.idNumberInput.value.trim();
    
    if (!idNumber) {
      this.showFieldError('idNumber', 'ID number is required');
      return false;
    }
    
    if (idNumber.length < 3) {
      this.showFieldError('idNumber', 'ID number must be at least 3 characters long');
      return false;
    }
    
    this.showFieldSuccess('idNumber');
    return true;
  }

  private validatePassword(): boolean {
    const password = this.passwordInput.value;
    
    if (!password) {
      this.showFieldError('password', 'Password is required');
      return false;
    }
    
    const passwordValidation = Utils.validatePassword(password);
    if (!passwordValidation.isValid) {
      this.showFieldError('password', passwordValidation.errors[0]);
      return false;
    }
    
    this.showFieldSuccess('password');
    return true;
  }

  private validateConfirmPassword(): boolean {
    const confirmPassword = this.confirmPasswordInput.value;
    const password = this.passwordInput.value;
    
    if (!confirmPassword) {
      this.showFieldError('confirmPassword', 'Please confirm your password');
      return false;
    }
    
    if (confirmPassword !== password) {
      this.showFieldError('confirmPassword', 'Passwords do not match');
      return false;
    }
    
    this.showFieldSuccess('confirmPassword');
    return true;
  }

  private validateTerms(): boolean {
    if (!this.termsCheckbox.checked) {
      this.showAlert('Please accept the terms and conditions to continue', 'error');
      return false;
    }
    
    return true;
  }

  private updatePasswordStrength(): void {
    const password = this.passwordInput.value;
    const strengthFill = document.getElementById('strengthFill');
    const strengthLabel = document.getElementById('strengthLabel');
    
    if (!strengthFill || !strengthLabel) return;
    
    const strength = this.calculatePasswordStrength(password);
    
    strengthFill.className = `strength-fill strength-${strength.level}`;
    strengthLabel.textContent = strength.text;
  }

  private calculatePasswordStrength(password: string): { text: string; level: string } {
    if (!password) return { text: 'Enter password', level: 'weak' };
    
    let score = 0;
    
    // Length check
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    
    // Character type checks
    if (/[A-Z]/.test(password)) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    
    if (score <= 2) return { text: 'Weak', level: 'weak' };
    if (score <= 3) return { text: 'Fair', level: 'fair' };
    if (score <= 4) return { text: 'Good', level: 'good' };
    return { text: 'Strong', level: 'strong' };
  }

  private showFieldError(fieldName: string, message: string): void {
    const input = document.getElementById(fieldName) as HTMLInputElement;
    const feedback = document.getElementById(`${fieldName}-feedback`);
    
    if (input) {
      input.classList.add('error');
      input.classList.remove('success');
    }
    
    if (feedback) {
      feedback.textContent = message;
      feedback.className = 'feedback-message error';
    }
  }

  private showFieldSuccess(fieldName: string): void {
    const input = document.getElementById(fieldName) as HTMLInputElement;
    const feedback = document.getElementById(`${fieldName}-feedback`);
    
    if (input) {
      input.classList.add('success');
      input.classList.remove('error');
    }
    
    if (feedback) {
      feedback.textContent = '';
      feedback.className = 'feedback-message success';
    }
  }

  private clearFieldError(fieldName: string): void {
    const input = document.getElementById(fieldName) as HTMLInputElement;
    const feedback = document.getElementById(`${fieldName}-feedback`);
    
    if (input) {
      input.classList.remove('error', 'success');
    }
    
    if (feedback) {
      feedback.textContent = '';
      feedback.className = 'feedback-message';
    }
  }

  private togglePasswordVisibility(fieldName: string): void {
    const input = document.getElementById(fieldName) as HTMLInputElement;
    const toggle = document.getElementById(`toggle${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);
    
    if (input && toggle) {
      const type = input.type === 'password' ? 'text' : 'password';
      input.type = type;
      
      const icon = toggle.querySelector('i');
      if (icon) {
        icon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
      }
    }
  }

  private showAlert(message: string, type: 'success' | 'error' | 'warning' = 'error', duration: number = 5000): void {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;

    const alert = document.createElement('div');
    alert.className = `p-4 mb-4 rounded-lg shadow-lg backdrop-blur-sm ${
      type === 'success' ? 'bg-green-600/90 border border-green-500 text-white' :
      type === 'warning' ? 'bg-yellow-600/90 border border-yellow-500 text-white' :
      'bg-red-600/90 border border-red-500 text-white font-bold'
    }`;
    
    alert.innerHTML = `
      <div class="flex items-center">
        <i class="fas ${
          type === 'success' ? 'fa-check-circle' :
          type === 'warning' ? 'fa-exclamation-triangle' :
          'fa-exclamation-circle'
        } mr-2 text-lg"></i>
        <span class="${type === 'error' ? 'font-bold text-lg' : ''}">${message}</span>
      </div>
    `;

    alertContainer.innerHTML = '';
    alertContainer.appendChild(alert);

    if (duration > 0) {
      setTimeout(() => {
        if (alert.parentNode) {
          alert.remove();
        }
      }, duration);
    }
  }

  private async testBackendConnection(): Promise<void> {
    try {
  const response = await fetch('https://ticketkini.onrender.com/docs');
      if (!response.ok) {
        console.warn('Backend might not be running properly');
      }
    } catch (error) {
      console.error('Backend connection failed:', error);
      this.showAlert('Warning: Backend server might not be running. Please start the backend server.', 'warning', 8000);
    }
  }

  // Background Animation System Methods - CSS Only
  private initializeBackgroundAnimations(): void {
    console.log('Initializing background animations'); // Debug log
    
    // Initialize particles and set initial step
    // this.createParticles(); // DISABLED - No more moving particles
    this.animateStepTransition(this.currentStep);
    
    // Add initial visibility test
    this.dynamicBackground.style.background = 'rgba(93, 49, 54, 0.05)';
    
    console.log('Background animations initialized'); // Debug log
  }

  // DISABLED - Particle creation function removed
  /*
  private createParticles(): void {
    console.log('Creating particles'); // Debug log
    
    // Create floating particles with CSS animations
    for (let i = 0; i < 15; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      
      // Random size and starting position
      const size = Math.random() * 4 + 3; // Slightly larger for visibility
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.bottom = '-10px';
      
      // Random animation delay and duration
      particle.style.animationDelay = `${Math.random() * 5}s`; // Shorter delay
      particle.style.animationDuration = `${6 + Math.random() * 4}s`; // Faster animation
      
      // Random horizontal movement
      particle.style.setProperty('--random-x', `${(Math.random() - 0.5) * 200}px`);
      
      this.particlesContainer.appendChild(particle);
    }
    
    console.log(`Created ${this.particlesContainer.children.length} particles`); // Debug log
  }
  */

  private animateStepTransition(step: number): void {
    console.log(`Animating transition to step ${step}`); // Debug log
    
    // Add transitioning class for smooth animations
    this.dynamicBackground.classList.add('transitioning');
    
    // Remove all step classes
    this.dynamicBackground.classList.remove('step-1', 'step-2', 'step-3', 'step-4');
    
    // Add current step class
    this.dynamicBackground.classList.add(`step-${step}`);
    
    console.log(`Applied class: step-${step}`); // Debug log
    
    // Create particle burst effect - DISABLED
    // this.createParticleBurst(step);
    
    // Remove transitioning class after animation
    setTimeout(() => {
      this.dynamicBackground.classList.remove('transitioning');
    }, 3000);
  }

  // DISABLED - Particle burst function removed
  /*
  private createParticleBurst(step: number): void {
    // Create temporary burst particles
    const colors = {
      1: 'rgba(93, 49, 54, 0.7)',
      2: 'rgba(216, 191, 192, 0.7)',
      3: 'rgba(249, 236, 223, 0.7)',
      4: 'rgba(93, 49, 54, 0.8)'
    };
    
    for (let i = 0; i < 8; i++) {
      const burstParticle = document.createElement('div');
      burstParticle.className = 'particle';
      burstParticle.style.width = '4px';
      burstParticle.style.height = '4px';
      burstParticle.style.left = '50%';
      burstParticle.style.top = '50%';
      burstParticle.style.background = colors[step as keyof typeof colors] || colors[1];
      burstParticle.style.position = 'absolute';
      burstParticle.style.borderRadius = '50%';
      burstParticle.style.pointerEvents = 'none';
      
      // Create unique animation for each burst particle
      const angle = (i / 8) * 360;
      const distance = 60 + Math.random() * 40;
      
      burstParticle.style.animation = `burst-${i} 1.5s ease-out forwards`;
      
      // Create keyframes for this particle
      const keyframes = `
        @keyframes burst-${i} {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) 
                      translate(${Math.cos(angle * Math.PI / 180) * distance}px, 
                               ${Math.sin(angle * Math.PI / 180) * distance}px) 
                      scale(0);
            opacity: 0;
          }
        }
      `;
      
      // Add keyframes to document
      const style = document.createElement('style');
      style.textContent = keyframes;
      document.head.appendChild(style);
      
      this.particlesContainer.appendChild(burstParticle);
      
      // Remove particle and style after animation
      setTimeout(() => {
        burstParticle.remove();
        style.remove();
      }, 1500);
    }
  }
  */

  private triggerStepAnimation(): void {
    // DISABLED - No more tunnel animations
    // this.triggerTunnelTransition();
    
    // Just trigger the simple step animation without tunnel effects
    this.animateStepTransition(this.currentStep);
  }

  // DISABLED - Tunnel transition completely disabled to remove circle animation
  /*
  private triggerTunnelTransition(): void {
    console.log('Triggering tunnel transition effect');
    
    // Activate tunnel container
    this.tunnelContainer.classList.add('tunnel-active');
    
    // Create expanding tunnel rings
    this.createTunnelRings();
    
    // Create cosmic ray effects
    this.createCosmicRays();
    
<<<<<<< HEAD
    // Universe transition disabled - no more circle animation
    // this.triggerUniverseShift();
=======
    // Trigger universe transition overlay
    this.triggerUniverseShift();
>>>>>>> 85bcfae0a160e860fa2f26dcc5df97282234d917
    
    // Animate current form step exit
    this.animateStepExit();
    
    // Clean up after animation
    setTimeout(() => {
      this.tunnelContainer.classList.remove('tunnel-active');
      this.cleanupTunnelEffects();
      this.animateStepEnter();
    }, 2500);
  }
<<<<<<< HEAD
  */

  // DISABLED - All tunnel animation methods commented out to remove circle animation
  /*
=======

>>>>>>> 85bcfae0a160e860fa2f26dcc5df97282234d917
  private createTunnelRings(): void {
    // Create multiple expanding rings for tunnel effect
    for (let i = 0; i < 8; i++) {
      const ring = document.createElement('div');
      ring.className = 'tunnel-rings';
      
      // Different sizes and colors for each ring
      const colors = [
        'rgba(93, 49, 54, 0.8)',
        'rgba(216, 191, 192, 0.7)',
        'rgba(249, 236, 223, 0.6)',
        'rgba(93, 49, 54, 0.5)'
      ];
      
      ring.style.borderColor = colors[i % colors.length];
      ring.style.animationDelay = `${i * 0.1}s`;
      ring.style.animationDuration = `${1.5 + i * 0.2}s`;
      
      this.tunnelContainer.appendChild(ring);
    }
  }

  private createCosmicRays(): void {
    // Create cosmic ray effects radiating from center
    for (let i = 0; i < 12; i++) {
      const ray = document.createElement('div');
      ray.className = 'cosmic-rays';
      
      // Position rays in a circle
      const angle = (i / 12) * 360;
      const distance = 100 + Math.random() * 200;
      
      ray.style.left = '50%';
      ray.style.top = '50%';
      ray.style.transformOrigin = 'center bottom';
      ray.style.setProperty('--ray-rotation', `${angle}deg`);
      ray.style.setProperty('--ray-x', `${Math.cos(angle * Math.PI / 180) * distance}px`);
      ray.style.animationDelay = `${i * 0.05}s`;
      
      // Different colors for variety
      if (i % 3 === 0) {
        ray.style.background = `linear-gradient(to bottom,
          transparent 0%,
          rgba(93, 49, 54, 0.8) 20%,
          rgba(93, 49, 54, 1) 50%,
          rgba(93, 49, 54, 0.8) 80%,
          transparent 100%)`;
      } else if (i % 3 === 1) {
        ray.style.background = `linear-gradient(to bottom,
          transparent 0%,
          rgba(216, 191, 192, 0.8) 20%,
          rgba(216, 191, 192, 1) 50%,
          rgba(216, 191, 192, 0.8) 80%,
          transparent 100%)`;
      }
      
      this.tunnelContainer.appendChild(ray);
    }
  }
<<<<<<< HEAD
  */

  // Universe transition disabled - no more circle animation
  /*
=======

>>>>>>> 85bcfae0a160e860fa2f26dcc5df97282234d917
  private triggerUniverseShift(): void {
    // Trigger the universe transition overlay
    this.universeTransition.style.animation = 'universeShift 2s ease-in-out forwards';
    
    // Create particle burst during universe shift
    this.createDimensionalParticles();
  }
<<<<<<< HEAD
  */

  // Dimensional particles disabled - no more circle animation
  /*
=======

>>>>>>> 85bcfae0a160e860fa2f26dcc5df97282234d917
  private createDimensionalParticles(): void {
    // Create particles that seem to be pulled into the tunnel
    for (let i = 0; i < 20; i++) {
      const particle = document.createElement('div');
      particle.className = 'tunnel-particles';
      
      // Random starting positions around the screen
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.top = `${Math.random() * 100}%`;
      particle.style.animationDelay = `${Math.random() * 0.5}s`;
      
      // Different colors
      const colors = [
        'rgba(93, 49, 54, 0.9)',
        'rgba(216, 191, 192, 0.8)',
        'rgba(249, 236, 223, 0.7)'
      ];
      particle.style.background = colors[i % colors.length];
      
      this.tunnelContainer.appendChild(particle);
    }
  }
<<<<<<< HEAD
  */

  // DISABLED - All step animation methods commented out
  /*
=======

>>>>>>> 85bcfae0a160e860fa2f26dcc5df97282234d917
  private animateStepExit(): void {
    // Add 3D exit animation to current step
    const currentStep = this.formSteps[this.currentStep - 1];
    if (currentStep) {
      currentStep.classList.add('step-exiting', 'form-step-3d');
    }
  }

  private animateStepEnter(): void {
    // Add 3D enter animation to new step
    const newStep = this.formSteps[this.currentStep - 1];
    if (newStep) {
      newStep.classList.add('step-entering', 'form-step-3d');
      
      // Clean up animation classes after animation completes
      setTimeout(() => {
        newStep.classList.remove('step-entering', 'form-step-3d');
      }, 1000);
    }
    
    // Clean up exit animation from previous step
    this.formSteps.forEach(step => {
      step.classList.remove('step-exiting', 'form-step-3d');
    });
  }

  private cleanupTunnelEffects(): void {
    // Remove all tunnel effect elements
    const rings = this.tunnelContainer.querySelectorAll('.tunnel-rings');
    const rays = this.tunnelContainer.querySelectorAll('.cosmic-rays');
    const particles = this.tunnelContainer.querySelectorAll('.tunnel-particles');
    
    rings.forEach(ring => ring.remove());
    rays.forEach(ray => ray.remove());
    particles.forEach(particle => particle.remove());
    
<<<<<<< HEAD
    // Universe transition disabled
    // this.universeTransition.style.animation = '';
  }
  */
}

// Initialize the signup page
new SignupPage(); 