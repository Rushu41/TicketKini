// components/footer.ts
export class Footer {
  private element: HTMLElement;

  constructor() {
    this.element = this.createElement();
    this.attachEventListeners();
  }

  private createElement(): HTMLElement {
    const footer = document.createElement('footer');
    footer.className = 'bg-gray-900 text-white';

    footer.innerHTML = `
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <!-- Desktop Layout -->
        <div class="hidden md:grid grid-cols-4 gap-8">
          <!-- About Column -->
          <div class="space-y-4">
            <h3 class="text-lg font-semibold text-white">About</h3>
            <ul class="space-y-2">
              <li><a href="/about" class="text-gray-300 hover:text-white transition-colors">About Us</a></li>
              <li><a href="/careers" class="text-gray-300 hover:text-white transition-colors">Careers</a></li>
              <li><a href="/press" class="text-gray-300 hover:text-white transition-colors">Press</a></li>
              <li><a href="/blog" class="text-gray-300 hover:text-white transition-colors">Blog</a></li>
            </ul>
          </div>

          <!-- Help Column -->
          <div class="space-y-4">
            <h3 class="text-lg font-semibold text-white">Help</h3>
            <ul class="space-y-2">
              <li><a href="/faq" class="text-gray-300 hover:text-white transition-colors">FAQ</a></li>
              <li><a href="/support" class="text-gray-300 hover:text-white transition-colors">Support</a></li>
              <li><a href="/cancellation" class="text-gray-300 hover:text-white transition-colors">Cancellation</a></li>
              <li><a href="/refund" class="text-gray-300 hover:text-white transition-colors">Refund Policy</a></li>
            </ul>
          </div>

          <!-- Contact Column -->
          <div class="space-y-4">
            <h3 class="text-lg font-semibold text-white">Contact</h3>
            <ul class="space-y-2">
              <li class="text-gray-300">
                <svg class="w-4 h-4 inline mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
                </svg>
                support@busticket.com
              </li>
              <li class="text-gray-300">
                <svg class="w-4 h-4 inline mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
                </svg>
                +880 1234-567890
              </li>
              <li class="text-gray-300">
                <svg class="w-4 h-4 inline mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"/>
                </svg>
                Dhaka, Bangladesh
              </li>
            </ul>
          </div>

          <!-- Social Column -->
          <div class="space-y-4">
            <h3 class="text-lg font-semibold text-white">Follow Us</h3>
            <div class="flex space-x-4">
              <a href="#" class="text-gray-300 hover:text-white transition-colors">
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
                </svg>
              </a>
              <a href="#" class="text-gray-300 hover:text-white transition-colors">
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>
              <a href="#" class="text-gray-300 hover:text-white transition-colors">
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </a>
            </div>
            
            <!-- Newsletter Signup -->
            <div class="mt-6">
              <h4 class="text-sm font-semibold text-white mb-2">Newsletter</h4>
              <div class="flex">
                <input type="email" placeholder="Your email" 
                       class="flex-1 px-3 py-2 bg-gray-800 text-white rounded-l-lg border border-gray-700 focus:outline-none focus:border-blue-500">
                <button class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-r-lg transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Mobile Accordion Layout -->
        <div class="md:hidden space-y-4">
          <div class="accordion-item border-b border-gray-700 pb-4">
            <button class="accordion-button flex justify-between items-center w-full text-left" data-section="about">
              <h3 class="text-lg font-semibold text-white">About</h3>
              <svg class="w-5 h-5 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            <div class="accordion-content hidden mt-4">
              <ul class="space-y-2">
                <li><a href="/about" class="text-gray-300 hover:text-white transition-colors">About Us</a></li>
                <li><a href="/careers" class="text-gray-300 hover:text-white transition-colors">Careers</a></li>
                <li><a href="/press" class="text-gray-300 hover:text-white transition-colors">Press</a></li>
                <li><a href="/blog" class="text-gray-300 hover:text-white transition-colors">Blog</a></li>
              </ul>
            </div>
          </div>

          <div class="accordion-item border-b border-gray-700 pb-4">
            <button class="accordion-button flex justify-between items-center w-full text-left" data-section="help">
              <h3 class="text-lg font-semibold text-white">Help</h3>
              <svg class="w-5 h-5 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            <div class="accordion-content hidden mt-4">
              <ul class="space-y-2">
                <li><a href="/faq" class="text-gray-300 hover:text-white transition-colors">FAQ</a></li>
                <li><a href="/support" class="text-gray-300 hover:text-white transition-colors">Support</a></li>
                <li><a href="/cancellation" class="text-gray-300 hover:text-white transition-colors">Cancellation</a></li>
                <li><a href="/refund" class="text-gray-300 hover:text-white transition-colors">Refund Policy</a></li>
              </ul>
            </div>
          </div>

          <div class="accordion-item border-b border-gray-700 pb-4">
            <button class="accordion-button flex justify-between items-center w-full text-left" data-section="contact">
              <h3 class="text-lg font-semibold text-white">Contact</h3>
              <svg class="w-5 h-5 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>
            <div class="accordion-content hidden mt-4">
              <ul class="space-y-2">
                <li class="text-gray-300">support@busticket.com</li>
                <li class="text-gray-300">+880 1234-567890</li>
                <li class="text-gray-300">Dhaka, Bangladesh</li>
              </ul>
            </div>
          </div>

          <!-- Social & Newsletter for Mobile -->
          <div class="pt-4">
            <h3 class="text-lg font-semibold text-white mb-4">Follow Us</h3>
            <div class="flex space-x-4 mb-6">
              <a href="#" class="text-gray-300 hover:text-white transition-colors">
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/></svg>
              </a>
              <a href="#" class="text-gray-300 hover:text-white transition-colors">
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <a href="#" class="text-gray-300 hover:text-white transition-colors">
                <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              </a>
            </div>
            
            <div>
              <h4 class="text-sm font-semibold text-white mb-2">Newsletter</h4>
              <div class="flex">
                <input type="email" placeholder="Your email" 
                       class="flex-1 px-3 py-2 bg-gray-800 text-white rounded-l-lg border border-gray-700 focus:outline-none focus:border-blue-500">
                <button class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-r-lg transition-colors">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Copyright -->
        <div class="border-t border-gray-700 mt-8 pt-8 text-center">
          <p class="text-gray-400 text-sm">
            © 2025 BusTicket. All rights reserved. | 
            <a href="/privacy" class="hover:text-white transition-colors">Privacy Policy</a> | 
            <a href="/terms" class="hover:text-white transition-colors">Terms of Service</a>
          </p>
        </div>
      </div>
    `;

    return footer;
  }

  private attachEventListeners(): void {
    // Handle mobile accordion toggle
    this.element.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest('.accordion-button') as HTMLButtonElement;
      if (button) {
        const content = button.nextElementSibling as HTMLElement;
        const icon = button.querySelector('svg');
        
        // Toggle content visibility
        content.classList.toggle('hidden');
        
        // Rotate icon
        if (icon) {
          icon.classList.toggle('rotate-180');
        }
      }
    });

    // Handle newsletter signup
    this.element.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const email = (form.querySelector('input[type="email"]') as HTMLInputElement).value;
      
      if (email) {
        // Handle newsletter signup logic here
        // Newsletter signup
        alert('Thank you for subscribing to our newsletter!');
      }
    });
  }

  render(): HTMLElement {
    return this.element;
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.element);
  }
}
