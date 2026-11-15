/**
 * FORUM MPK NASIONAL (FOMNAS)
 * Core Interactive Scripts: 3D Coverflow Carousel, Smooth Scroll, Filters, Mobile Navigation
 */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initScrollTop();
  Promise.all([initPublicNews(), initPublicPrograms()]).finally(() => {
    initCoverflowCarousel();
    initContentFilters();
  });
});

/* ========================================================
   1. PUBLIC NEWS
   ======================================================== */
async function initPublicNews() {
  const newsGrid = document.querySelector('[data-news-grid]');
  const carousel = document.querySelector('[data-news-carousel]');
  if (!newsGrid && !carousel) return;

  const status = document.querySelector('[data-news-status]');
  const endpoint = carousel ? '/api/news?limit=5' : '/api/news';
  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Permintaan berita gagal (${response.status}).`);
    const news = await response.json();

    if (newsGrid) {
      newsGrid.replaceChildren();
      if (news.length === 0) {
        status.textContent = 'Belum ada berita untuk ditampilkan.';
      } else {
        news.forEach(item => newsGrid.append(createNewsCard(item)));
        status.textContent = '';
      }
    }

    if (carousel) {
      carousel.replaceChildren(...news.map(createCarouselCard));
      if (!newsGrid && news.length === 0) {
        status.textContent = 'Belum ada berita untuk ditampilkan.';
      }
    }
  } catch (error) {
    newsGrid?.replaceChildren();
    carousel?.replaceChildren();
    if (status) status.textContent = 'Berita terbaru belum dapat dimuat. Silakan coba beberapa saat lagi.';
    console.error('Gagal memuat berita:', error);
  }
}

function createNewsCard(item) {
  const article = document.createElement('article');
  article.className = 'ui-card';
  article.dataset.category = 'headline';
  article.id = item.slug;

  const thumbnail = document.createElement('div');
  thumbnail.className = 'ui-card-thumb';
  const image = document.createElement('img');
  image.src = item.image_url || '/assets/images/fomnas_logo.png';
  image.alt = item.title;
  const badge = document.createElement('span');
  badge.className = 'ui-badge';
  badge.textContent = 'Berita';
  thumbnail.append(image, badge);

  const body = document.createElement('div');
  body.className = 'ui-card-body';
  const meta = document.createElement('div');
  meta.className = 'ui-card-meta';
  const date = document.createElement('span');
  date.textContent = formatPublicNewsDate(item.created_at);
  const author = document.createElement('span');
  author.textContent = 'Redaksi FOMNAS';
  meta.append(date, author);

  const title = document.createElement('h3');
  title.className = 'ui-card-title';
  title.textContent = item.title;
  const excerpt = document.createElement('p');
  excerpt.className = 'ui-card-excerpt';
  excerpt.textContent = item.content;

  const footer = document.createElement('div');
  footer.className = 'ui-card-footer';
  const category = document.createElement('span');
  category.textContent = 'Berita FOMNAS';
  const link = document.createElement('a');
  link.className = 'btn-read-link';
  link.href = `/news-detail.html?id=${encodeURIComponent(item.id)}`;
  link.textContent = 'Baca Selengkapnya';
  footer.append(category, link);
  body.append(meta, title, excerpt, footer);
  article.append(thumbnail, body);
  setNewsCardNavigation(article, item.id, item.title);
  return article;
}

function createCarouselCard(item, index) {
  const card = document.createElement('div');
  card.className = `coverflow-card ${index === 0 ? 'card-active' : index === 1 ? 'card-next' : 'card-hidden'}`;
  card.dataset.newsUrl = `/news-detail.html?id=${encodeURIComponent(item.id)}`;
  const media = document.createElement('div');
  media.className = 'card-media';
  const image = document.createElement('img');
  image.src = item.image_url || '/assets/images/fomnas_logo.png';
  image.alt = item.title;
  media.append(image);

  const content = document.createElement('div');
  content.className = 'card-content-area';
  const title = document.createElement('h3');
  title.textContent = item.title;
  const excerpt = document.createElement('p');
  excerpt.textContent = item.content;
  const footer = document.createElement('div');
  footer.className = 'card-footer-action';
  const link = document.createElement('a');
  link.className = 'btn-read-link';
  link.href = `/news-detail.html?id=${encodeURIComponent(item.id)}`;
  link.textContent = 'Baca Selengkapnya';
  footer.append(link);
  content.append(title, excerpt, footer);
  card.append(media, content);
  return card;
}

function setNewsCardNavigation(card, id, title) {
  const url = `/news-detail.html?id=${encodeURIComponent(id)}`;
  card.tabIndex = 0;
  card.setAttribute('role', 'link');
  card.setAttribute('aria-label', `Baca berita: ${title}`);
  card.addEventListener('click', event => {
    if (event.target.closest('a, button')) return;
    window.location.assign(url);
  });
  card.addEventListener('keydown', event => {
    if (event.target !== card || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    window.location.assign(url);
  });
}

function formatPublicNewsDate(value) {
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('id-ID');
}

/* ========================================================
   2. PUBLIC PROGRAMS
   ======================================================== */
async function initPublicPrograms() {
  const homepageGrid = document.querySelector('[data-program-grid]');
  const prokerGrid = document.querySelector('[data-proker-grid]');
  const featuredCard = document.querySelector('[data-program-featured]');
  if (!homepageGrid && !prokerGrid) return;
  const statusMessage = document.querySelector('[data-program-status], [data-proker-status]');

  try {
    const response = await fetch('/api/programs');
    if (!response.ok) throw new Error(`Permintaan program gagal (${response.status}).`);
    const programs = await response.json();
    if (programs.length === 0) {
      homepageGrid?.replaceChildren();
      prokerGrid?.replaceChildren();
      if (featuredCard) featuredCard.hidden = true;
      statusMessage.textContent = 'Belum ada program untuk ditampilkan.';
      return;
    }

    if (prokerGrid) {
      prokerGrid.replaceChildren(...programs.map(createProgramCard));
      statusMessage.textContent = '';
    }

    if (homepageGrid) {
      const priorityProgram = programs.find(program => Number(program.is_priority) === 1);
      if (priorityProgram) {
        renderFeaturedProgram(featuredCard, priorityProgram);
      } else {
        featuredCard.hidden = true;
      }

      const regularPrograms = programs.filter(program => Number(program.is_priority) !== 1);
      const additionalPrograms = regularPrograms.slice(0, 3);
      if (additionalPrograms.length < 3) {
        const remaining = programs.filter(program => program.id !== priorityProgram?.id && !additionalPrograms.includes(program));
        additionalPrograms.push(...remaining.slice(0, 3 - additionalPrograms.length));
      }
      homepageGrid.replaceChildren(...additionalPrograms.map(createProgramCard));
      statusMessage.textContent = '';
    }
  } catch (error) {
    homepageGrid?.replaceChildren();
    prokerGrid?.replaceChildren();
    if (featuredCard) featuredCard.hidden = true;
    statusMessage.textContent = 'Program belum dapat dimuat. Silakan coba beberapa saat lagi.';
    console.error('Gagal memuat program:', error);
  }
}

function renderFeaturedProgram(featuredCard, program) {
  if (!featuredCard) return;
  featuredCard.querySelector('[data-program-featured-title]').textContent = program.title;
  featuredCard.querySelector('[data-program-featured-category]').textContent = program.category;
  featuredCard.querySelector('[data-program-featured-description]').textContent = program.description;
  const link = featuredCard.querySelector('[data-program-featured-link]');
  link.href = `/program/${encodeURIComponent(program.id)}`;
  const image = featuredCard.querySelector('[data-program-featured-image]');
  image.src = program.image_url || '/assets/images/fomnas_logo.png';
  image.alt = program.title;
  featuredCard.hidden = false;
}

function createProgramCard(item) {
  const statusDetails = {
    Mendatang: { filter: 'upcoming', label: 'Akan Datang', className: 'status-upcoming' },
    Berjalan: { filter: 'ongoing', label: 'Sedang Berjalan', className: 'status-ongoing' },
    Selesai: { filter: 'completed', label: 'Terlaksana', className: 'status-completed' }
  }[item.status] || { filter: '', label: item.status, className: '' };

  const article = document.createElement('article');
  article.className = 'ui-card';
  article.dataset.status = statusDetails.filter;

  const thumbnail = document.createElement('div');
  thumbnail.className = 'ui-card-thumb';
  const image = document.createElement('img');
  image.src = item.image_url || '/assets/images/fomnas_logo.png';
  image.alt = item.title;
  const badge = document.createElement('span');
  badge.className = `ui-badge ${statusDetails.className}`.trim();
  badge.textContent = statusDetails.label;
  thumbnail.append(image, badge);

  const body = document.createElement('div');
  body.className = 'ui-card-body';
  const meta = document.createElement('div');
  meta.className = 'ui-card-meta';
  const date = document.createElement('span');
  date.textContent = `Ditambahkan ${formatPublicNewsDate(item.created_at)}`;
  meta.append(date);

  const title = document.createElement('h3');
  title.className = 'ui-card-title';
  title.textContent = item.title;
  const description = document.createElement('p');
  description.className = 'ui-card-excerpt';
  description.textContent = item.description;

  const footer = document.createElement('div');
  footer.className = 'ui-card-footer';
  const categoryLabel = document.createElement('span');
  categoryLabel.className = 'program-category';
  categoryLabel.textContent = item.category;
  const link = document.createElement('a');
  link.className = 'btn-read-link';
  link.href = `/program/${encodeURIComponent(item.id)}`;
  link.textContent = 'Detail Program';
  footer.append(categoryLabel, link);
  body.append(meta, title, description, footer);
  article.append(thumbnail, body);
  return article;
}

/* ========================================================
   3. NAVBAR & MOBILE DRAWER
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
   4. 3D COVERFLOW CAROUSEL ("MPK Minggu ini.")
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
      if (card.dataset.newsUrl) {
        window.location.assign(card.dataset.newsUrl);
        return;
      }

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
   5. CONTENT FILTERS (News & Program Cards Filter)
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
   6. SCROLL TO TOP BUTTON
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
