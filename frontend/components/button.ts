// components/button.ts
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  onClick?: (event: MouseEvent) => void;
}

export class Button {
  private element: HTMLButtonElement;
  private options: Required<ButtonOptions>;
  private originalContent: string = '';

  constructor(text: string, options: ButtonOptions = {}) {
    this.options = {
      variant: options.variant || 'primary',
      size: options.size || 'md',
      disabled: options.disabled || false,
      loading: options.loading || false,
      icon: options.icon || '',
      iconPosition: options.iconPosition || 'left',
      fullWidth: options.fullWidth || false,
      onClick: options.onClick || (() => {})
    };

    this.element = this.createElement(text);
    this.attachEventListeners();
  }

  private createElement(text: string): HTMLButtonElement {
    const button = document.createElement('button');
    this.originalContent = text;
    
    // Base classes
    button.className = this.getButtonClasses();
    
    // Set content
    this.updateContent(text);
    
    // Set attributes
    if (this.options.disabled) {
      button.disabled = true;
    }

    return button;
  }

  private getButtonClasses(): string {
    const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';
    
    // Size classes
    const sizeClasses = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base'
    };

    // Variant classes
    const variantClasses = {
      primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm focus:ring-blue-500 disabled:bg-blue-300',
      secondary: 'bg-gray-600 hover:bg-gray-700 text-white shadow-sm focus:ring-gray-500 disabled:bg-gray-300',
      outline: 'border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white focus:ring-blue-500 disabled:border-gray-300 disabled:text-gray-300',
      danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm focus:ring-red-500 disabled:bg-red-300'
    };

    // Full width class
    const widthClass = this.options.fullWidth ? 'w-full' : '';

    // Loading state class
    const loadingClass = this.options.loading ? 'cursor-not-allowed opacity-70' : '';

    return `${baseClasses} ${sizeClasses[this.options.size]} ${variantClasses[this.options.variant]} ${widthClass} ${loadingClass}`.trim();
  }

  private updateContent(text: string): void {
    let content = '';

    if (this.options.loading) {
      content = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Loading...
      `;
    } else {
      // Add icon if specified
      if (this.options.icon) {
        const iconSvg = this.getIconSvg(this.options.icon);
        if (this.options.iconPosition === 'left') {
          content = `${iconSvg}<span class="ml-2">${text}</span>`;
        } else {
          content = `<span class="mr-2">${text}</span>${iconSvg}`;
        }
      } else {
        content = text;
      }
    }

    this.element.innerHTML = content;
  }

  private getIconSvg(iconName: string): string {
    const icons: Record<string, string> = {
      search: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>`,
      plus: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
      </svg>`,
      download: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
      </svg>`,
      check: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>`,
      arrow_right: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"/>
      </svg>`,
      arrow_left: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16l-4-4m0 0l4-4m-4 4h18"/>
      </svg>`,
      close: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
      </svg>`,
      edit: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
      </svg>`,
      delete: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
      </svg>`
    };

    return icons[iconName] || '';
  }

  private attachEventListeners(): void {
    this.element.addEventListener('click', (e) => {
      if (!this.options.disabled && !this.options.loading) {
        this.options.onClick(e);
      }
    });
  }

  // Public methods
  setLoading(loading: boolean): void {
    this.options.loading = loading;
    this.element.className = this.getButtonClasses();
    this.element.disabled = this.options.disabled || loading;
    this.updateContent(this.originalContent);
  }

  setDisabled(disabled: boolean): void {
    this.options.disabled = disabled;
    this.element.disabled = disabled || this.options.loading;
    this.element.className = this.getButtonClasses();
  }

  setText(text: string): void {
    this.originalContent = text;
    this.updateContent(text);
  }

  setVariant(variant: ButtonVariant): void {
    this.options.variant = variant;
    this.element.className = this.getButtonClasses();
  }

  onClick(callback: (event: MouseEvent) => void): void {
    this.options.onClick = callback;
  }

  render(): HTMLButtonElement {
    return this.element;
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.element);
  }

  destroy(): void {
    this.element.remove();
  }
}

// Helper function to create buttons quickly
export function createButton(text: string, options: ButtonOptions = {}): Button {
  return new Button(text, options);
}