/**
 * FORUM MPK NASIONAL (FOMNAS)
 * Core Interactive Scripts: 3D Coverflow Carousel, Smooth Scroll, Filters, Mobile Navigation
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initCoverflowCarousel();
  initContentFilters();
  initScrollTop();
});

/* ========================================================
   1. NAVBAR & MOBILE DRAWER
   ======================================================== */
function initNavbar() {
  const header = document.querySelector('.header');
  const toggleBtn = document.querySelector('.mobile-nav-toggle');
  const mobileMenu = document.querySelector('.mobile-menu');
  const overlay = document.querySelector('.mobile-menu-overlay');
  const closeBtn = document.querySelector('.mobile-menu-close');

  // Header blur effect on scroll
  window.addEventListener('scroll', () => {
    if (window.scrollY > 30) {
      header?.classList.add('scrolled');
    } else {
      header?.classList.remove('scrolled');
    }
  }, { passive: true });

  // Open mobile drawer
  function openMenu() {
    mobileMenu?.classList.add('open');
    overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  // Close mobile drawer
  function closeMenu() {
    mobileMenu?.classList.remove('open');
    overlay?.classList.remove('open');
    document.body.style.overflow = '';
  }

  toggleBtn?.addEventListener('click', openMenu);
  closeBtn?.addEventListener('click', closeMenu);
  overlay?.addEventListener('click', closeMenu);

  // Mark active link based on current URL path
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;
    const linkPath = href.split('/').pop();
    if (linkPath === currentPath || (currentPath === '' && linkPath === 'index.html')) {
      link.classList.add('active');
    }
  });
}

/* ========================================================
   2. 3D COVERFLOW CAROUSEL ("MPK Minggu ini.")
   ======================================================== */
function initCoverflowCarousel() {
  const carousel = document.querySelector('.carousel-stage');
  if (!carousel) return;

  const cards = Array.from(carousel.querySelectorAll('.coverflow-card'));
  if (cards.length === 0) return;

  const prevBtn = document.querySelector('.btn-carousel-prev');
  const nextBtn = document.querySelector('.btn-carousel-next');
  const dotsContainer = document.querySelector('.carousel-dots');

  let activeIndex = 0;
  const total = cards.length;
  let autoPlayTimer = null;

  // Build dots
  if (dotsContainer) {
    dotsContainer.innerHTML = '';
    cards.forEach((_, idx) => {
      const dot = document.createElement('button');
      dot.className = `carousel-dot ${idx === 0 ? 'active' : ''}`;
      dot.setAttribute('aria-label', `Slide ${idx + 1}`);
      dot.addEventListener('click', () => {
        goToSlide(idx);
        restartAutoplay();
      });
      dotsContainer.appendChild(dot);
    });
  }

  function updateCards() {
    cards.forEach((card, idx) => {
      card.classList.remove('card-active', 'card-prev', 'card-next', 'card-hidden');

      const prevIndex = (activeIndex - 1 + total) % total;
      const nextIndex = (activeIndex + 1) % total;

      if (idx === activeIndex) {
        card.classList.add('card-active');
      } else if (idx === prevIndex) {
        card.classList.add('card-prev');
      } else if (idx === nextIndex) {
        card.classList.add('card-next');
      } else {
        card.classList.add('card-hidden');
      }
    });

    // Update dots
    if (dotsContainer) {
      const dots = dotsContainer.querySelectorAll('.carousel-dot');
      dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx === activeIndex);
      });
    }
  }

  function goToSlide(newIndex) {
    activeIndex = (newIndex + total) % total;
    updateCards();
  }

  function nextSlide() {
    goToSlide(activeIndex + 1);
  }

  function prevSlide() {
    goToSlide(activeIndex - 1);
  }

  // Card click navigation (clicking side card activates it)
  cards.forEach((card, idx) => {
    card.addEventListener('click', (e) => {
      // Don't trigger slide change if clicking directly on "Baca Selengkapnya" link
      if (e.target.closest('.btn-read-link')) return;

      if (card.classList.contains('card-prev')) {
        prevSlide();
        restartAutoplay();
      } else if (card.classList.contains('card-next')) {
        nextSlide();
        restartAutoplay();
      }
    });
  });

  // Buttons
  prevBtn?.addEventListener('click', () => {
    prevSlide();
    restartAutoplay();
  });

  nextBtn?.addEventListener('click', () => {
    nextSlide();
    restartAutoplay();
  });

  // Keyboard navigation
  carousel.setAttribute('tabindex', '0');
  carousel.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      prevSlide();
      restartAutoplay();
    } else if (e.key === 'ArrowRight') {
      nextSlide();
      restartAutoplay();
    }
  });

  // Touch Swipe Support
  let touchStartX = 0;
  let touchEndX = 0;

  carousel.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  carousel.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
  }, { passive: true });

  function handleSwipe() {
    const diff = touchEndX - touchStartX;
    if (Math.abs(diff) > 40) {
      if (diff < 0) {
        nextSlide();
      } else {
        prevSlide();
      }
      restartAutoplay();
    }
  }

  // Autoplay
  function startAutoplay() {
    autoPlayTimer = setInterval(nextSlide, 4500);
  }

  function stopAutoplay() {
    if (autoPlayTimer) clearInterval(autoPlayTimer);
  }

  function restartAutoplay() {
    stopAutoplay();
    startAutoplay();
  }

  carousel.addEventListener('mouseenter', stopAutoplay);
  carousel.addEventListener('mouseleave', startAutoplay);

  // Initial State
  updateCards();
  startAutoplay();
}

/* ========================================================
   3. CONTENT FILTERS (News & Proker Cards Filter)
   ======================================================== */
function initContentFilters() {
  const filterPills = document.querySelectorAll('.filter-pill');
  const cards = document.querySelectorAll('.cards-grid .ui-card');

  if (filterPills.length === 0 || cards.length === 0) return;

  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const filterValue = pill.getAttribute('data-filter') || 'all';

      cards.forEach(card => {
        const category = card.getAttribute('data-category') || '';
        const status = card.getAttribute('data-status') || '';

        if (filterValue === 'all' || category === filterValue || status === filterValue) {
          card.style.display = 'flex';
          card.style.opacity = '0';
          card.style.transform = 'translateY(15px)';
          setTimeout(() => {
            card.style.transition = 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          }, 30);
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

/* ========================================================
   4. SCROLL TO TOP BUTTON
   ======================================================== */
function initScrollTop() {
  const scrollBtn = document.querySelector('.scroll-top-btn');
  if (!scrollBtn) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
      scrollBtn.classList.add('visible');
    } else {
      scrollBtn.classList.remove('visible');
    }
  }, { passive: true });

  scrollBtn.addEventListener('click', () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  });
}
