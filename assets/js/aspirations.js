document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#fomnasContactForm');
  const feedback = document.querySelector('[data-aspiration-feedback]');
  const submitButton = document.querySelector('[data-aspiration-submit]');
  if (!form || !feedback || !submitButton) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.textContent = 'Mengirim aspirasi...';
    feedback.classList.remove('is-error', 'is-success');
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'true');

    const formData = new FormData(form);
    const payload = {
      nama: formData.get('nama'),
      email: formData.get('email'),
      sekolah: formData.get('sekolah'),
      kategori: formData.get('kategori'),
      pesan: formData.get('pesan')
    };

    try {
      const response = await fetch('/api/aspirasi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Aspirasi gagal dikirim.');

      form.reset();
      feedback.textContent = 'Terima kasih. Suara aspirasimu berhasil dikirim.';
      feedback.classList.add('is-success');
    } catch (error) {
      feedback.textContent = error instanceof TypeError
        ? 'Koneksi bermasalah. Silakan coba kembali.'
        : error.message || 'Aspirasi gagal dikirim. Silakan coba kembali.';
      feedback.classList.add('is-error');
    } finally {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
    }
  });
});
