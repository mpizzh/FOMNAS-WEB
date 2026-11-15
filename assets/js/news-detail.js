document.addEventListener('DOMContentLoaded', loadNewsDetail);

async function loadNewsDetail() {
  const identifier = new URLSearchParams(window.location.search).get('id') ||
    window.location.pathname.split('/').filter(Boolean).pop();
  const status = document.querySelector('#news-detail-status');
  const article = document.querySelector('#news-article');
  const relatedSection = document.querySelector('.news-related-section');

  if (!identifier) {
    showNewsDetailError(status, 'Berita tidak ditemukan.');
    return;
  }

  try {
    const response = await fetch(`/api/news/${encodeURIComponent(identifier)}`);
    if (!response.ok) {
      if (response.status === 404) throw new Error('Berita yang Anda cari tidak ditemukan.');
      throw new Error('Berita belum dapat dimuat. Silakan coba beberapa saat lagi.');
    }

    const news = await response.json();
    document.title = `${news.title} | Forum MPK Nasional`;
    document.querySelector('meta[name="description"]').content = news.content.slice(0, 160);
    document.querySelector('#news-title').textContent = news.title;
    document.querySelector('#news-date').textContent = formatDetailNewsDate(news.created_at);
    document.querySelector('#news-date').dateTime = news.created_at.replace(' ', 'T') + 'Z';
    const image = document.querySelector('#news-image');
    image.src = news.image_url || '/assets/images/fomnas_logo.png';
    image.alt = news.title;

    const content = document.querySelector('#news-content');
    news.content.split(/\r?\n\s*\r?\n/).forEach(paragraphText => {
      const paragraph = document.createElement('p');
      paragraph.textContent = paragraphText;
      content.append(paragraph);
    });

    status.hidden = true;
    article.hidden = false;
    relatedSection.hidden = false;
    await loadRelatedNews(news.id);
  } catch (error) {
    showNewsDetailError(status, error.message);
  }
}

async function loadRelatedNews(currentId) {
  const status = document.querySelector('#related-status');
  const grid = document.querySelector('#related-news-grid');
  try {
    const response = await fetch(`/api/news/${encodeURIComponent(currentId)}/related`);
    if (!response.ok) throw new Error('Berita terkait belum dapat dimuat.');
    const news = await response.json();
    if (news.length === 0) {
      status.textContent = 'Belum ada berita lainnya.';
      return;
    }
    news.forEach(item => grid.append(createRelatedNewsCard(item)));
  } catch (error) {
    status.textContent = error.message;
    console.error('Gagal memuat berita terkait:', error);
  }
}

function createRelatedNewsCard(news) {
  const article = document.createElement('article');
  article.className = 'ui-card';
  article.tabIndex = 0;
  article.setAttribute('role', 'link');
  article.setAttribute('aria-label', `Baca berita: ${news.title}`);
  const url = `/news-detail.html?id=${encodeURIComponent(news.id)}`;
  article.addEventListener('click', event => {
    if (event.target.closest('a, button')) return;
    window.location.assign(url);
  });
  article.addEventListener('keydown', event => {
    if (event.target !== article || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    window.location.assign(url);
  });

  const thumbnail = document.createElement('div');
  thumbnail.className = 'ui-card-thumb';
  const image = document.createElement('img');
  image.src = news.image_url || '/assets/images/fomnas_logo.png';
  image.alt = news.title;
  thumbnail.append(image);

  const body = document.createElement('div');
  body.className = 'ui-card-body';
  const date = document.createElement('div');
  date.className = 'ui-card-meta';
  date.textContent = formatDetailNewsDate(news.created_at);
  const title = document.createElement('h3');
  title.className = 'ui-card-title';
  title.textContent = news.title;
  const excerpt = document.createElement('p');
  excerpt.className = 'ui-card-excerpt';
  excerpt.textContent = news.content;
  const footer = document.createElement('div');
  footer.className = 'ui-card-footer';
  const link = document.createElement('a');
  link.className = 'btn-read-link';
  link.href = url;
  link.textContent = 'Baca Selengkapnya';
  footer.append(link);
  body.append(date, title, excerpt, footer);
  article.append(thumbnail, body);
  return article;
}

function formatDetailNewsDate(value) {
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function showNewsDetailError(status, message) {
  status.textContent = message;
  status.classList.add('news-detail-error');
}
