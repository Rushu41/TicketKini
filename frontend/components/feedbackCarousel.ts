// Professional continuous sliding carousel for feedback/testimonials
// Usage: initFeedbackCarousel('container-id', items, { slidingSpeed: 30000, pauseOnHover: true })

export type FeedbackItem = {
  id: number | string;
  rating: number;
  comment: string;
  created_at?: string;
  user_name?: string;
};

type Options = {
  slidingSpeed?: number; // Duration for one complete slide cycle in ms
  pauseOnHover?: boolean;
  showIndicators?: boolean;
  showArrows?: boolean;
  cardsVisible?: number; // How many cards to show at once
  continuousSliding?: boolean; // Whether to use continuous sliding or discrete steps
};

export function initFeedbackCarousel(
  containerId: string,
  items: FeedbackItem[],
  opts: Options = {}
) {
  const options: Required<Options> = {
    slidingSpeed: opts.slidingSpeed ?? 30000, // 30 seconds for full cycle
    pauseOnHover: opts.pauseOnHover ?? true,
    showIndicators: opts.showIndicators ?? false, // Hide indicators for continuous sliding
    showArrows: opts.showArrows ?? false, // Hide arrows for continuous sliding
    cardsVisible: opts.cardsVisible ?? 3, // Show 3 cards at once
    continuousSliding: opts.continuousSliding ?? true,
  } as Required<Options>;

  const container = document.getElementById(containerId);
  if (!container) return;

  // Reset container content and classes for full-width carousel layout
  container.className = 'relative w-full overflow-hidden';
  container.innerHTML = '';

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="text-center text-neutral-500 py-12">No testimonials yet</div>';
    return;
  }

  // If continuous sliding is enabled and we have enough items, create infinite loop effect
  if (options.continuousSliding && items.length >= 2) {
    return initContinuousSlider(container, items, options);
  }

  // Fallback to discrete sliding if not enough items or continuous disabled
  return initDiscreteSlider(container, items, options);
}

function initContinuousSlider(
  container: HTMLElement, 
  items: FeedbackItem[], 
  options: Required<Options>
) {
  // Create infinite loop by duplicating items for seamless scrolling
  const duplicatedItems = [...items, ...items]; // Double for smooth infinite loop
  
  // Build full-width structure
  const region = document.createElement('div');
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', 'Testimonials Carousel');
  region.className = 'relative w-full h-48 overflow-hidden bg-transparent'; // Removed harsh background

  const track = document.createElement('div');
  track.className = 'flex absolute top-0 left-0 h-full will-change-transform gap-6'; // Added gap between cards
  
  // Calculate fixed card width in pixels for consistent sizing
  const cardWidthPx = 300; // Slightly smaller cards
  const totalWidthPx = duplicatedItems.length * (cardWidthPx + 24); // Include gap
  track.style.width = `${totalWidthPx}px`;

  // Create compact slides for all duplicated items
  duplicatedItems.forEach((item) => {
    const slide = document.createElement('div');
    slide.className = 'flex-shrink-0 h-full';
    slide.style.width = `${cardWidthPx}px`;

    // Softer card design with transparent background
    const card = document.createElement('div');
    card.className = [
      'relative h-full rounded-xl p-4',
      'bg-white/70 backdrop-blur-sm', // Much softer background
      'border border-gray-200/50 shadow-sm', // Gentler shadow
      'transition-all duration-300 ease-out hover:bg-white/80 hover:shadow-md',
      'flex flex-col justify-between'
    ].join(' ');

    // Compact rating with softer colors
    const starsWrap = document.createElement('div');
    starsWrap.className = 'flex items-center gap-0.5 mb-3';
    const full = Math.max(0, Math.min(5, Math.round(item.rating || 0)));
    for (let i = 0; i < 5; i++) {
      const star = document.createElement('span');
      star.className = i < full ? 'text-amber-400 text-sm' : 'text-gray-300 text-sm'; // Softer amber color
      star.innerHTML = '★';
      starsWrap.appendChild(star);
    }

    // Shorter comment with proper truncation
    const comment = document.createElement('p');
    comment.className = 'text-gray-600 leading-relaxed text-sm flex-1 mb-3'; // Softer text color
    const maxLength = 100; // Shorter comments for better readability
    let commentText = (item.comment || '').trim();
    if (commentText.length > maxLength) {
      commentText = commentText.substring(0, maxLength) + '...';
    }
    comment.textContent = `"${commentText}"`;

    // Compact footer with softer styling
    const footer = document.createElement('div');
    footer.className = 'flex items-center gap-2';
    
    // Smaller avatar with softer gradient
    const avatar = document.createElement('div');
    const initial = (item.user_name || 'A').trim().charAt(0).toUpperCase();
    avatar.className = 'h-7 w-7 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 text-white flex items-center justify-center font-medium text-xs'; // Softer gradient
    avatar.textContent = initial;
    
    // Compact user info
    const nameEl = document.createElement('div');
    nameEl.className = 'text-xs font-medium text-gray-700 truncate'; // Smaller, softer text
    nameEl.textContent = item.user_name || 'Anonymous';

    footer.appendChild(avatar);
    footer.appendChild(nameEl);

    card.appendChild(starsWrap);
    card.appendChild(comment);
    card.appendChild(footer);
    slide.appendChild(card);
    track.appendChild(slide);
  });

  region.appendChild(track);
  container.appendChild(region);

  // Smooth continuous sliding animation with pixel-based movement
  let animationFrame: number;
  let isPaused = false;
  let currentTranslateX = 0;
  const speed = (cardWidthPx + 24) / (options.slidingSpeed / 1000); // pixels per second with new card width

  function animate() {
    if (isPaused) {
      animationFrame = requestAnimationFrame(animate);
      return;
    }

    // Move left continuously
    currentTranslateX -= speed / 60; // 60fps
    
    // Reset when we've moved past one set of items
    const resetPoint = -(items.length * (cardWidthPx + 24));
    if (currentTranslateX <= resetPoint) {
      currentTranslateX = 0;
    }
    
    track.style.transform = `translateX(${currentTranslateX}px)`;
    animationFrame = requestAnimationFrame(animate);
  }

  // Start animation
  animationFrame = requestAnimationFrame(animate);

  // Pause on hover functionality
  if (options.pauseOnHover) {
    region.addEventListener('mouseenter', () => {
      isPaused = true;
    });
    
    region.addEventListener('mouseleave', () => {
      isPaused = false;
    });
  }

  // Cleanup function
  return () => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
  };
}

function initDiscreteSlider(
  container: HTMLElement, 
  items: FeedbackItem[], 
  options: Required<Options>
) {
  // Build structure for discrete sliding (original implementation)
  const region = document.createElement('div');
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', 'Testimonials Carousel');
  region.className = 'relative overflow-hidden h-80';

  const track = document.createElement('div');
  track.className = 'flex transition-transform duration-700 ease-out will-change-transform h-full';
  track.style.transform = 'translateX(0)';

  // Create slides
  items.forEach((item, idx) => {
    const slide = document.createElement('div');
    slide.className = 'w-full shrink-0 px-4 h-full';
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('aria-label', `${idx + 1} of ${items.length}`);

    // Same card design as continuous slider
    const card = document.createElement('div');
    card.className = [
      'relative h-full rounded-3xl p-6',
      'bg-white/90 backdrop-blur-xl',
      'border border-white/50 shadow-[0_20px_40px_rgba(0,0,0,0.1)]',
      'before:absolute before:inset-0 before:rounded-3xl before:p-[1px] before:content-[""]',
      'before:bg-gradient-to-br before:from-blue-400/30 before:via-purple-400/30 before:to-pink-400/30 before:-z-10',
      'flex flex-col justify-between'
    ].join(' ');

    // Build card content (similar to continuous slider)
    const topSection = document.createElement('div');
    const starsWrap = document.createElement('div');
    starsWrap.className = 'flex items-center gap-1 mb-4';
    const full = Math.max(0, Math.min(5, Math.round(item.rating || 0)));
    starsWrap.innerHTML = '★'.repeat(full).split('').map(s => `<span class="text-yellow-400 text-lg">${s}</span>`).join('') + 
                         '☆'.repeat(5 - full).split('').map(s => `<span class="text-gray-300 text-lg">${s}</span>`).join('');

    const comment = document.createElement('p');
    comment.className = 'text-gray-700 leading-relaxed text-sm';
    comment.textContent = `"${(item.comment || '').trim()}"`;

    topSection.appendChild(starsWrap);
    topSection.appendChild(comment);

    const footer = document.createElement('div');
    footer.className = 'flex items-center gap-3 mt-4 pt-4 border-t border-gray-200/50';
    
    const avatar = document.createElement('div');
    const initial = (item.user_name || 'A').trim().charAt(0).toUpperCase();
    avatar.className = 'h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white flex items-center justify-center font-bold shadow-lg';
    avatar.textContent = initial;
    
    const nameEl = document.createElement('div');
    nameEl.className = 'text-sm font-semibold text-gray-800';
    nameEl.textContent = item.user_name || 'Anonymous';
    
    footer.appendChild(avatar);
    footer.appendChild(nameEl);

    card.appendChild(topSection);
    card.appendChild(footer);
    slide.appendChild(card);
    track.appendChild(slide);
  });

  region.appendChild(track);

  // Add controls if enabled
  let current = 0;
  const last = items.length - 1;

  function update() {
    const offset = current * -100;
    track.style.transform = `translateX(${offset}%)`;
  }

  // Navigation buttons and autoplay logic (similar to original)
  if (options.showArrows) {
    // Add arrow buttons...
  }

  if (options.showIndicators) {
    // Add dot indicators...
  }

  // Autoplay
  let timer: number | null = null;
  const play = () => {
    timer = window.setInterval(() => {
      current = current === last ? 0 : current + 1;
      update();
    }, 4000);
  };
  
  const stop = () => {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  };

  if (options.pauseOnHover) {
    region.addEventListener('mouseenter', stop);
    region.addEventListener('mouseleave', play);
  }

  container.appendChild(region);
  update();
  play();
}
