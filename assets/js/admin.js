document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.querySelector('#admin-login-form');
  if (loginForm) initAdminLogin(loginForm);
  if (document.querySelector('#news-management')) initAdminDashboard();
});

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  if (response.status === 401) {
    window.location.assign('/pageadmin/login');
    throw new Error('Sesi admin berakhir. Silakan masuk kembali.');
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || `Permintaan gagal (HTTP ${response.status}). Silakan coba lagi.`);
  }
  return response.status === 204 ? null : response.json();
}

function initAdminLogin(form) {
  const message = document.querySelector('#form-message');
  const button = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    button.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(form));
      const result = await requestJson('/pageadmin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      window.location.assign(result.redirect);
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}

async function initAdminDashboard() {
  const logoutButton = document.querySelector('#logout-button');
  let csrfToken = '';
  let csrfTokenPromise;
  const getCsrfToken = async () => {
    if (!csrfTokenPromise) csrfTokenPromise = requestJson('/api/admin/csrf');
    ({ csrfToken } = await csrfTokenPromise);
    return csrfToken;
  };
  initDashboardTabs(tab => {
    if (tab.id !== 'aspiration-tab') return;
    loadAspirations(getCsrfToken).catch(error => {
      document.querySelector('#aspiration-list-message').textContent = error.message;
    });
  });
  initAspirationReply(getCsrfToken);
  try {
    await getCsrfToken();
    await Promise.all([loadNews(csrfToken), loadProker(csrfToken)]);
  } catch (error) {
    document.querySelector('#list-message').textContent = error.message;
    document.querySelector('#proker-list-message').textContent = error.message;
  }

  initNewsForm(csrfToken);
  initProkerForm(csrfToken);

  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    try {
      const result = await requestJson('/pageadmin/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken }
      });
      window.location.assign(result.redirect);
    } catch (error) {
      document.querySelector('#list-message').textContent = error.message;
      logoutButton.disabled = false;
    }
  });
}

function initDashboardTabs(onTabSelected = () => {}) {
  const tabs = Array.from(document.querySelectorAll('.dashboard-tab'));
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(candidate => {
        const selected = candidate === tab;
        candidate.setAttribute('aria-selected', String(selected));
        document.querySelector(`#${candidate.getAttribute('aria-controls')}`).hidden = !selected;
      });
      onTabSelected(tab);
    });
  });
}

async function loadNews(csrfToken) {
  const listMessage = document.querySelector('#list-message');
  const tableBody = document.querySelector('#news-table-body');
  listMessage.textContent = 'Memuat berita...';
  const news = await requestJson('/api/news');
  tableBody.replaceChildren();
  if (news.length === 0) {
    listMessage.textContent = 'Belum ada berita.';
    return;
  }
  listMessage.textContent = '';
  news.forEach(item => {
    const row = document.createElement('tr');
    const imageCell = document.createElement('td');
    const image = document.createElement('img');
    image.src = item.image_url || '/assets/images/fomnas_logo.png';
    image.alt = '';
    imageCell.append(image);

    const titleCell = document.createElement('td');
    titleCell.textContent = item.title;
    const dateCell = document.createElement('td');
    dateCell.textContent = formatNewsDate(item.created_at);
    const actionCell = document.createElement('td');
    const deleteButton = createDeleteButton(`Hapus berita "${item.title}"?`, async () => {
      await requestJson(`/api/news/${item.id}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrfToken }
      });
      await loadNews(csrfToken);
    }, listMessage);
    actionCell.append(deleteButton);
    row.append(imageCell, titleCell, dateCell, actionCell);
    tableBody.append(row);
  });
}

async function loadProker(csrfToken) {
  const listMessage = document.querySelector('#proker-list-message');
  const tableBody = document.querySelector('#proker-table-body');
  listMessage.textContent = 'Memuat program...';
  const prokerList = await requestJson('/api/programs');
  tableBody.replaceChildren();
  if (prokerList.length === 0) {
    listMessage.textContent = 'Belum ada program.';
    return;
  }
  listMessage.textContent = '';
  prokerList.forEach(item => {
    const row = document.createElement('tr');
    const imageCell = document.createElement('td');
    const image = document.createElement('img');
    image.src = item.image_url || '/assets/images/fomnas_logo.png';
    image.alt = '';
    imageCell.append(image);
    const titleCell = document.createElement('td');
    titleCell.textContent = item.title;
    const categoryCell = document.createElement('td');
    categoryCell.textContent = item.category;
    const statusCell = document.createElement('td');
    statusCell.textContent = item.status;
    const priorityCell = document.createElement('td');
    const priorityBadge = document.createElement('span');
    priorityBadge.className = `priority-badge${item.is_priority ? '' : ' regular'}`;
    priorityBadge.textContent = item.is_priority ? 'Prioritas' : 'Biasa';
    priorityCell.append(priorityBadge);
    const dateCell = document.createElement('td');
    dateCell.textContent = formatNewsDate(item.created_at);
    const actionCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'row-action';

    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'edit-button';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => editProgram(item));

    const priorityButton = document.createElement('button');
    priorityButton.type = 'button';
    priorityButton.className = 'priority-toggle';
    priorityButton.textContent = item.is_priority ? 'Jadikan Biasa' : 'Jadikan Prioritas';
    priorityButton.addEventListener('click', async () => {
      priorityButton.disabled = true;
      try {
        await requestJson(`/api/programs/${item.id}/priority`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
          body: JSON.stringify({ is_priority: !Boolean(item.is_priority) })
        });
        await loadProker(csrfToken);
      } catch (error) {
        listMessage.textContent = error.message;
        priorityButton.disabled = false;
      }
    });

    const deleteButton = createDeleteButton(`Hapus program "${item.title}"?`, async () => {
      await requestJson(`/api/programs/${item.id}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrfToken }
      });
      await loadProker(csrfToken);
    }, listMessage);
    actions.append(editButton, priorityButton, deleteButton);
    actionCell.append(actions);
    row.append(imageCell, titleCell, categoryCell, statusCell, priorityCell, dateCell, actionCell);
    tableBody.append(row);
  });
}

async function loadAspirations(getCsrfToken) {
  const listMessage = document.querySelector('#aspiration-list-message');
  const tableBody = document.querySelector('#aspiration-table-body');
  listMessage.textContent = 'Memuat aspirasi...';
  const aspirations = await requestJson('/api/aspirasi');
  tableBody.replaceChildren();
  if (aspirations.length === 0) {
    listMessage.textContent = 'Belum ada aspirasi yang masuk.';
    return;
  }
  listMessage.textContent = '';

  aspirations.forEach(item => {
    const row = document.createElement('tr');
    const dateCell = document.createElement('td');
    dateCell.textContent = formatNewsDate(item.tanggal);

    const personCell = document.createElement('td');
    const person = document.createElement('div');
    person.className = 'aspiration-person';
    const name = document.createElement('strong');
    name.textContent = item.nama || 'Anonim';
    const origin = document.createElement('span');
    origin.textContent = item.sekolah;
    const email = document.createElement('span');
    email.textContent = item.email || 'Email tidak tersedia';
    person.append(name, origin, email);
    personCell.append(person);

    const categoryCell = document.createElement('td');
    categoryCell.textContent = item.kategori;
    const messageCell = document.createElement('td');
    messageCell.className = 'aspiration-message-cell';
    messageCell.textContent = item.pesan;

    const statusCell = document.createElement('td');
    const statusBadge = document.createElement('span');
    const statusClass = item.status === 'Selesai'
      ? ' complete'
      : item.status === 'Dibaca'
        ? ' read'
        : item.status === 'Dibalas' ? ' replied' : '';
    statusBadge.className = `aspiration-status${statusClass}`;
    statusBadge.textContent = item.status;
    statusCell.append(statusBadge);

    const actionCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'row-action';

    const replyButton = document.createElement('button');
    replyButton.type = 'button';
    replyButton.className = 'edit-button';
    replyButton.textContent = 'Balas Email';
    replyButton.disabled = !item.email;
    replyButton.title = item.email ? 'Kirim tanggapan melalui email' : 'Aspirasi ini tidak memiliki alamat email.';
    replyButton.addEventListener('click', () => {
      if (!item.email) return;
      document.querySelector('#reply-aspiration-id').value = item.id;
      document.querySelector('#reply-recipient').value = item.email;
      document.querySelector('#reply-subject').value = 'Tanggapan FOMNAS atas aspirasi Anda';
      document.querySelector('#reply-message').value = '';
      document.querySelector('#aspiration-reply-feedback').textContent = '';
      document.querySelector('#aspiration-reply-dialog').showModal();
    });
    actions.append(replyButton);

    if (item.status !== 'Selesai') {
      const completeButton = document.createElement('button');
      completeButton.type = 'button';
      completeButton.className = 'complete-button';
      completeButton.textContent = 'Tandai Selesai';
      completeButton.addEventListener('click', async () => {
        completeButton.disabled = true;
        try {
          const csrfToken = await getCsrfToken();
          await requestJson(`/api/aspirasi/${item.id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify({ status: 'Selesai' })
          });
          await loadAspirations(getCsrfToken);
        } catch (error) {
          listMessage.textContent = error.message;
          completeButton.disabled = false;
        }
      });
      actions.append(completeButton);
    }

    const deleteButton = createDeleteButton(`Hapus aspirasi dari "${item.nama || 'Anonim'}"?`, async () => {
      const csrfToken = await getCsrfToken();
      await requestJson(`/api/aspirasi/${item.id}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': csrfToken }
      });
      await loadAspirations(getCsrfToken);
    }, listMessage);
    actions.append(deleteButton);
    actionCell.append(actions);
    row.append(dateCell, personCell, categoryCell, messageCell, statusCell, actionCell);
    tableBody.append(row);
  });
}

function initAspirationReply(getCsrfToken) {
  const dialog = document.querySelector('#aspiration-reply-dialog');
  const form = document.querySelector('#aspiration-reply-form');
  const feedback = document.querySelector('#aspiration-reply-feedback');
  const submitButton = form.querySelector('button[type="submit"]');

  document.querySelector('#aspiration-reply-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    form.reset();
    feedback.textContent = '';
    submitButton.disabled = false;
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    feedback.textContent = 'Mengirim balasan email...';
    feedback.classList.remove('is-error');
    submitButton.disabled = true;
    let messageSent = false;
    try {
      const csrfToken = await getCsrfToken();
      const result = await requestJson('/api/aspirasi/balas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({
          id: Number(form.elements.id.value),
          subject: form.elements.subject.value,
          message: form.elements.message.value
        })
      });
      messageSent = true;
      feedback.textContent = result.message;
      try {
        await loadAspirations(getCsrfToken);
      } catch (error) {
        document.querySelector('#aspiration-list-message').textContent =
          `Email terkirim, tetapi daftar gagal diperbarui: ${error.message}`;
      }
    } catch (error) {
      feedback.textContent = error.message;
      feedback.classList.add('is-error');
    } finally {
      submitButton.disabled = messageSent;
    }
  });
}

function createDeleteButton(confirmMessage, onDelete, messageElement) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'delete-button';
  button.textContent = 'Hapus';
  button.addEventListener('click', async () => {
    if (!window.confirm(confirmMessage)) return;
    button.disabled = true;
    try {
      await onDelete();
    } catch (error) {
      messageElement.textContent = error.message;
      button.disabled = false;
    }
  });
  return button;
}

function initNewsForm(csrfToken) {
  const form = document.querySelector('#news-form');
  const message = document.querySelector('#form-message');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '';
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await requestJson('/api/news', {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body: new FormData(form)
      });
      form.reset();
      message.textContent = 'Berita berhasil disimpan.';
      await loadNews(csrfToken);
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}

function initProkerForm(csrfToken) {
  const form = document.querySelector('#proker-form');
  const message = document.querySelector('#proker-form-message');
  const cancelButton = document.querySelector('#proker-cancel-edit');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = '';
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const id = form.elements.id.value;
      const body = new FormData(form);
      body.set('is_priority', form.elements.is_priority.checked ? '1' : '0');
      body.delete('id');
      await requestJson(id ? `/api/programs/${id}` : '/api/programs', {
        method: id ? 'PUT' : 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
        body
      });
      resetProgramForm(form);
      message.textContent = id ? 'Program berhasil diperbarui.' : 'Program berhasil disimpan.';
      await loadProker(csrfToken);
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  cancelButton.addEventListener('click', () => {
    resetProgramForm(form);
    message.textContent = '';
  });
}

function editProgram(program) {
  const form = document.querySelector('#proker-form');
  form.elements.id.value = program.id;
  form.elements.title.value = program.title;
  form.elements.category.value = program.category;
  form.elements.status.value = program.status;
  form.elements.description.value = program.description;
  form.elements.is_priority.checked = Boolean(program.is_priority);
  form.elements.image_url.value = program.image_url?.startsWith('/assets/') ? '' : (program.image_url || '');
  document.querySelector('#proker-submit-button').textContent = 'Simpan Perubahan';
  document.querySelector('#proker-cancel-edit').hidden = false;
  document.querySelector('#proker-form-message').textContent = `Mengedit program: ${program.title}`;
  document.querySelector('#proker-management').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetProgramForm(form) {
  form.reset();
  form.elements.id.value = '';
  document.querySelector('#proker-submit-button').textContent = 'Simpan Program';
  document.querySelector('#proker-cancel-edit').hidden = true;
}

function formatNewsDate(value) {
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('id-ID');
}
