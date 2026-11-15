document.addEventListener('DOMContentLoaded', loadProgramDetail);

async function loadProgramDetail() {
  const id = window.location.pathname.split('/').filter(Boolean).pop();
  const status = document.querySelector('#program-detail-status');
  try {
    const response = await fetch(`/api/programs/${encodeURIComponent(id)}`);
    if (!response.ok) {
      if (response.status === 404) throw new Error('Program yang Anda cari tidak ditemukan.');
      throw new Error('Program belum dapat dimuat. Silakan coba beberapa saat lagi.');
    }

    const program = await response.json();
    document.title = `${program.title} | Program FOMNAS`;
    document.querySelector('meta[name="description"]').content = program.description.slice(0, 160);
    document.querySelector('#program-title').textContent = program.title;
    document.querySelector('#program-meta').textContent = `${program.category} · ${program.status}`;
    document.querySelector('#program-priority').hidden = !program.is_priority;
    const image = document.querySelector('#program-image');
    image.src = program.image_url || '/assets/images/fomnas_logo.png';
    image.alt = program.title;
    const description = document.createElement('p');
    description.textContent = program.description;
    document.querySelector('#program-description').append(description);
    status.hidden = true;
    document.querySelector('#program-article').hidden = false;
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('news-detail-error');
  }
}
