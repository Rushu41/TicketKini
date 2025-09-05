import { apiService } from './api.ts';
import { Utils } from './utils.ts';

export interface FeedbackPromptService {
    checkForFeedbackPrompt(): Promise<void>;
    showFeedbackModal(): void;
    submitFeedback(rating: number, comment: string, feedbackType: string): Promise<void>;
    skipFeedback(): void;
}

class FeedbackPromptServiceImpl implements FeedbackPromptService {
    private static instance: FeedbackPromptServiceImpl;
    private feedbackCheckInterval: number = 5; // Show feedback prompt every 5 bookings

    public static getInstance(): FeedbackPromptServiceImpl {
        if (!FeedbackPromptServiceImpl.instance) {
            FeedbackPromptServiceImpl.instance = new FeedbackPromptServiceImpl();
        }
        return FeedbackPromptServiceImpl.instance;
    }

    async checkForFeedbackPrompt(): Promise<void> {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            if (!user.id) return;

            // Get user's booking count
            const response = await apiService.getUserBookingCount();
            if (!response.success) return;

            const currentBookingCount = response.data.booking_count;
            
            // Get the last feedback booking count from localStorage
            const lastCount = parseInt(localStorage.getItem('lastFeedbackBookingCount') || '0');
            
            // Check if user has reached the feedback threshold
            if (currentBookingCount > 0 && 
                currentBookingCount >= lastCount + this.feedbackCheckInterval &&
                currentBookingCount % this.feedbackCheckInterval === 0) {
                
                // Show feedback modal after a short delay
                setTimeout(() => {
                    this.showFeedbackModal();
                }, 1000);
            }
        } catch (error) {
            console.error('Error checking for feedback prompt:', error);
        }
    }

    showFeedbackModal(): void {
        // Check if modal already exists
        if (document.querySelector('#feedbackPromptModal')) return;

        const modal = document.createElement('div');
        modal.id = 'feedbackPromptModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content max-w-md">
                <div class="modal-header">
                    <h3 class="text-xl font-semibold text-white">Share Your Experience</h3>
                </div>
                <div class="p-6 space-y-4">
                    <p class="text-gray-300">We'd love to hear about your recent booking experience!</p>
                    
                    <div class="space-y-3">
                        <label class="block text-sm font-medium text-gray-300">Rate your experience:</label>
                        <div class="flex gap-2 justify-center">
                            ${[1, 2, 3, 4, 5].map(star => `
                                <button type="button" class="star-rating text-2xl text-gray-400 hover:text-yellow-400 transition-colors" data-rating="${star}">
                                    ★
                                </button>
                            `).join('')}
                        </div>
                        <input type="hidden" id="feedbackRating" value="0">
                    </div>

                    <div class="space-y-2">
                        <label for="feedbackComment" class="block text-sm font-medium text-gray-300">Comments (optional):</label>
                        <textarea 
                            id="feedbackComment" 
                            rows="3" 
                            class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Tell us about your experience..."
                        ></textarea>
                    </div>

                    <div class="space-y-2">
                        <label for="feedbackType" class="block text-sm font-medium text-gray-300">Feedback Type:</label>
                        <select 
                            id="feedbackType" 
                            class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="general">General</option>
                            <option value="service">Service Quality</option>
                            <option value="booking">Booking Process</option>
                            <option value="vehicle">Vehicle Condition</option>
                            <option value="driver">Driver Behavior</option>
                            <option value="app">App Experience</option>
                        </select>
                    </div>
                </div>

                <div class="p-6 border-t border-gray-700 flex gap-3 justify-between">
                    <button onclick="feedbackPromptService.skipFeedback()" class="btn-secondary">
                        Skip for now
                    </button>
                    <button onclick="feedbackPromptService.submitFeedbackFromModal()" class="btn-primary" id="submitFeedbackBtn" disabled>
                        Submit Feedback
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add star rating functionality
        const stars = modal.querySelectorAll('.star-rating');
        const ratingInput = modal.querySelector('#feedbackRating') as HTMLInputElement;
        const submitBtn = modal.querySelector('#submitFeedbackBtn') as HTMLButtonElement;

        stars.forEach((star, index) => {
            star.addEventListener('click', () => {
                const rating = index + 1;
                ratingInput.value = rating.toString();
                
                // Update star display
                stars.forEach((s, i) => {
                    if (i < rating) {
                        s.classList.remove('text-gray-400');
                        s.classList.add('text-yellow-400');
                    } else {
                        s.classList.remove('text-yellow-400');
                        s.classList.add('text-gray-400');
                    }
                });

                // Enable submit button
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            });

            star.addEventListener('mouseenter', () => {
                const rating = index + 1;
                stars.forEach((s, i) => {
                    if (i < rating) {
                        s.classList.add('text-yellow-300');
                    } else {
                        s.classList.remove('text-yellow-300');
                    }
                });
            });

            star.addEventListener('mouseleave', () => {
                stars.forEach(s => s.classList.remove('text-yellow-300'));
            });
        });

        // Make modal functions globally accessible
        (window as any).feedbackPromptService = this;
    }

    async submitFeedbackFromModal(): Promise<void> {
        const modal = document.querySelector('#feedbackPromptModal');
        if (!modal) return;

        const rating = parseInt((modal.querySelector('#feedbackRating') as HTMLInputElement).value);
        const comment = (modal.querySelector('#feedbackComment') as HTMLTextAreaElement).value;
        const feedbackType = (modal.querySelector('#feedbackType') as HTMLSelectElement).value;

        if (rating === 0) {
            Utils.showNotification('Please select a rating', 'error');
            return;
        }

        await this.submitFeedback(rating, comment, feedbackType);
        this.closeFeedbackModal();
    }

    async submitFeedback(rating: number, comment: string, feedbackType: string): Promise<void> {
        try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            if (!user.id) {
                Utils.showNotification('Please log in to submit feedback', 'error');
                return;
            }

            const response = await apiService.submitFeedback({
                user_id: user.id,
                rating: rating,
                comment: comment,
                feedback_type: feedbackType
            });

            if (response.success) {
                Utils.showNotification('Thank you for your feedback!', 'success');
                
                // Update the last feedback booking count
                const bookingCountResponse = await apiService.getUserBookingCount();
                if (bookingCountResponse.success) {
                    localStorage.setItem('lastFeedbackBookingCount', bookingCountResponse.data.booking_count.toString());
                }
            } else {
                throw new Error(response.error || 'Failed to submit feedback');
            }
        } catch (error) {
            console.error('Error submitting feedback:', error);
            Utils.showNotification('Failed to submit feedback. Please try again.', 'error');
        }
    }

    skipFeedback(): void {
        // Update the last feedback booking count to skip this prompt
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (user.id) {
            apiService.getUserBookingCount().then(response => {
                if (response.success) {
                    localStorage.setItem('lastFeedbackBookingCount', response.data.booking_count.toString());
                }
            });
        }
        
        this.closeFeedbackModal();
        Utils.showNotification('Feedback skipped. We\'ll ask again later.', 'info');
    }

    private closeFeedbackModal(): void {
        const modal = document.querySelector('#feedbackPromptModal');
        if (modal) {
            modal.remove();
        }
    }
}

export const feedbackPromptService = FeedbackPromptServiceImpl.getInstance();
