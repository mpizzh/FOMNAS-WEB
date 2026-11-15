require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const multer = require('multer');
const nodemailer = require('nodemailer');

const ROOT_DIR = __dirname;
const THUMBNAIL_DIR = path.join(ROOT_DIR, 'assets', 'images', 'thumbnails');
const DATABASE_DIR = path.join(ROOT_DIR, 'data');
const DATABASE_PATH = path.join(DATABASE_DIR, 'fomnas.sqlite');
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const SESSION_MAX_AGE = 8 * 60 * 60 * 1000;

for (const name of ['ADMIN_USER', 'ADMIN_PASS', 'SESSION_SECRET']) {
  if (!process.env[name]) {
    throw new Error(`Environment variable ${name} is required. Copy .env.example to .env and configure it.`);
  }
}

fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });
fs.mkdirSync(DATABASE_DIR, { recursive: true });

const database = new Database(DATABASE_PATH);
database.pragma('journal_mode = WAL');
database.exec(`
  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    image_url TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS proker (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT,
    status TEXT NOT NULL CHECK (status IN ('Mendatang', 'Berjalan', 'Selesai')),
    is_priority INTEGER NOT NULL DEFAULT 0 CHECK (is_priority IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS aspirations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nama TEXT,
    email TEXT,
    sekolah TEXT NOT NULL,
    kategori TEXT NOT NULL,
    pesan TEXT NOT NULL,
    tanggal DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'Belum Dibaca'
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expires_at ON sessions (expires_at);
`);

const prokerColumns = database.pragma('table_info(proker)');
if (!prokerColumns.some(column => column.name === 'is_priority')) {
  database.exec('ALTER TABLE proker ADD COLUMN is_priority INTEGER NOT NULL DEFAULT 0');
}

const aspirationColumns = database.pragma('table_info(aspirations)');
if (!aspirationColumns.some(column => column.name === 'email')) {
  database.exec('ALTER TABLE aspirations ADD COLUMN email TEXT');
}

class SQLiteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = database.prepare('SELECT sess, expires_at FROM sessions WHERE sid = ?').get(sid);
      if (!row) return callback(null, null);
      if (row.expires_at <= Date.now()) {
        database.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        return callback(null, null);
      }
      return callback(null, JSON.parse(row.sess));
    } catch (error) {
      return callback(error);
    }
  }

  set(sid, sess, callback = () => {}) {
    try {
      const expiresAt = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + SESSION_MAX_AGE;
      database.prepare(`
        INSERT INTO sessions (sid, sess, expires_at) VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at
      `).run(sid, JSON.stringify(sess), expiresAt);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  touch(sid, sess, callback = () => {}) {
    try {
      const expiresAt = sess.cookie?.expires
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + SESSION_MAX_AGE;
      database.prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?').run(expiresAt, sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback = () => {}) {
    try {
      database.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback(null);
    } catch (error) {
      callback(error);
    }
  }
}

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction) app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(session({
  name: 'fomnas.sid',
  secret: process.env.SESSION_SECRET,
  store: new SQLiteSessionStore(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE
  }
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter(_req, file, callback) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      return callback(new Error('Format gambar harus JPG, PNG, WebP, atau GIF.'));
    }
    return callback(null, true);
  }
});

const newsStatements = {
  list: database.prepare('SELECT id, title, slug, content, image_url, created_at FROM news ORDER BY created_at DESC, id DESC'),
  listLimited: database.prepare('SELECT id, title, slug, content, image_url, created_at FROM news ORDER BY created_at DESC, id DESC LIMIT ?'),
  findById: database.prepare('SELECT id, title, slug, content, image_url, created_at FROM news WHERE id = ?'),
  findBySlug: database.prepare('SELECT id, title, slug, content, image_url, created_at FROM news WHERE slug = ?'),
  related: database.prepare('SELECT id, title, slug, content, image_url, created_at FROM news WHERE id != ? ORDER BY created_at DESC, id DESC LIMIT 3'),
  find: database.prepare('SELECT id, image_url FROM news WHERE id = ?'),
  insert: database.prepare('INSERT INTO news (title, slug, content, image_url) VALUES (?, ?, ?, ?)'),
  updateSlug: database.prepare('UPDATE news SET slug = ? WHERE id = ?'),
  remove: database.prepare('DELETE FROM news WHERE id = ?')
};

const prokerStatements = {
  list: database.prepare('SELECT id, title, category, description, image_url, status, is_priority, created_at FROM proker ORDER BY is_priority DESC, created_at DESC, id DESC'),
  find: database.prepare('SELECT id, title, category, description, image_url, status, is_priority, created_at FROM proker WHERE id = ?'),
  findImage: database.prepare('SELECT image_url FROM proker WHERE id = ?'),
  insert: database.prepare('INSERT INTO proker (title, category, description, image_url, status, is_priority) VALUES (?, ?, ?, ?, ?, ?)'),
  update: database.prepare('UPDATE proker SET title = ?, category = ?, description = ?, image_url = ?, status = ?, is_priority = ? WHERE id = ?'),
  updatePriority: database.prepare('UPDATE proker SET is_priority = ? WHERE id = ?'),
  remove: database.prepare('DELETE FROM proker WHERE id = ?')
};

const aspirationCategories = new Set([
  'Akademik',
  'Sarana Prasarana',
  'Kesiswaan',
  'Kebijakan Sekolah',
  'Lainnya'
]);
const aspirationStatements = {
  insert: database.prepare(
    'INSERT INTO aspirations (nama, email, sekolah, kategori, pesan) VALUES (?, ?, ?, ?, ?)'
  ),
  list: database.prepare(`
    SELECT id, nama, email, sekolah, kategori, pesan, tanggal, status
    FROM aspirations
    ORDER BY id DESC
  `),
  find: database.prepare('SELECT id, nama, email, kategori, pesan FROM aspirations WHERE id = ?'),
  updateStatus: database.prepare('UPDATE aspirations SET status = ? WHERE id = ?'),
  remove: database.prepare('DELETE FROM aspirations WHERE id = ?')
};

function createEmailTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;

  const options = {
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  };
  if (process.env.EMAIL_HOST) {
    const port = Number(process.env.EMAIL_PORT) || 587;
    options.host = process.env.EMAIL_HOST;
    options.port = port;
    options.secure = process.env.EMAIL_SECURE === 'true' || port === 465;
  } else {
    options.service = 'gmail';
  }
  return nodemailer.createTransport(options);
}

function requireAdmin(req, res, next) {
  if (req.session?.admin === true) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Login admin diperlukan.' });
  return res.redirect('/pageadmin/login');
}

function requireCsrf(req, res, next) {
  const expected = req.session?.csrfToken;
  const supplied = req.get('x-csrf-token');
  if (!expected || !supplied) return res.status(403).json({ error: 'Token keamanan tidak valid.' });
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return res.status(403).json({ error: 'Token keamanan tidak valid.' });
  }
  return next();
}

function createSlug(title) {
  const normalized = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'berita';
}

function getImageExtension(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.toString('ascii', 0, 6).match(/^GIF8[79]a$/)) return 'gif';
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'webp';
  return null;
}

function isLocalThumbnail(imageUrl) {
  return typeof imageUrl === 'string' && imageUrl.startsWith('/assets/images/thumbnails/');
}

function safeExternalImageUrl(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
  return url.toString();
}

app.get('/api/news', (req, res) => {
  const limit = req.query.limit === undefined ? null : Number(req.query.limit);
  if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
    return res.status(400).json({ error: 'Parameter limit harus berupa angka antara 1 dan 100.' });
  }
  const news = limit === null ? newsStatements.list.all() : newsStatements.listLimited.all(limit);
  return res.json(news);
});

app.post('/api/aspirasi', (req, res) => {
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'Permintaan harus menggunakan format JSON.' });
  }

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  if (body.nama !== undefined && body.nama !== null && typeof body.nama !== 'string') {
    return res.status(400).json({ error: 'Nama tidak valid.' });
  }
  const nama = typeof body.nama === 'string' ? body.nama.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const sekolah = typeof body.sekolah === 'string' ? body.sekolah.trim() : '';
  const kategori = typeof body.kategori === 'string' ? body.kategori.trim() : '';
  const pesan = typeof body.pesan === 'string' ? body.pesan.trim() : '';

  if (nama.length > 100) return res.status(400).json({ error: 'Nama maksimal 100 karakter.' });
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email aktif wajib diisi dengan alamat yang valid.' });
  }
  if (!sekolah || sekolah.length > 150) {
    return res.status(400).json({ error: 'Asal sekolah/daerah wajib diisi (maksimal 150 karakter).' });
  }
  if (!aspirationCategories.has(kategori)) {
    return res.status(400).json({ error: 'Silakan pilih kategori aspirasi yang tersedia.' });
  }
  if (!pesan || pesan.length > 5000) {
    return res.status(400).json({ error: 'Pesan wajib diisi (maksimal 5.000 karakter).' });
  }

  const result = aspirationStatements.insert.run(nama || null, email, sekolah, kategori, pesan);
  return res.status(201).json({
    id: result.lastInsertRowid,
    message: 'Aspirasi berhasil dikirim.'
  });
});

app.get('/api/aspirasi', requireAdmin, (_req, res) => {
  return res.json(aspirationStatements.list.all());
});

app.patch('/api/aspirasi/:id/status', requireAdmin, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'ID aspirasi tidak valid.' });
  }
  if (!['Dibaca', 'Dibalas', 'Selesai'].includes(req.body?.status)) {
    return res.status(400).json({ error: 'Status aspirasi harus Dibaca, Dibalas, atau Selesai.' });
  }
  if (!aspirationStatements.find.get(id)) {
    return res.status(404).json({ error: 'Aspirasi tidak ditemukan.' });
  }
  aspirationStatements.updateStatus.run(req.body.status, id);
  return res.json({ id, status: req.body.status });
});

app.post('/api/aspirasi/balas', requireAdmin, requireCsrf, async (req, res) => {
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'Permintaan harus menggunakan format JSON.' });
  }

  const id = Number(req.body?.id);
  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'ID aspirasi tidak valid.' });
  }
  if (!subject || subject.length > 200) {
    return res.status(400).json({ error: 'Subjek wajib diisi (maksimal 200 karakter).' });
  }
  if (!message || message.length > 10000) {
    return res.status(400).json({ error: 'Pesan balasan wajib diisi (maksimal 10.000 karakter).' });
  }

  const aspiration = aspirationStatements.find.get(id);
  if (!aspiration) return res.status(404).json({ error: 'Aspirasi tidak ditemukan.' });
  if (!aspiration.email) {
    return res.status(409).json({ error: 'Aspirasi ini belum memiliki alamat email untuk dibalas.' });
  }

  const transporter = createEmailTransporter();
  if (!transporter) {
    return res.status(503).json({ error: 'Pengiriman email belum dikonfigurasi pada server.' });
  }

  try {
    await transporter.sendMail({
      from: { name: 'Forum MPK Nasional', address: process.env.EMAIL_USER },
      to: aspiration.email,
      replyTo: process.env.EMAIL_USER,
      subject,
      text: `Halo ${aspiration.nama || 'rekan pelajar'},\n\n${message}\n\nSalam,\nForum MPK Nasional (FOMNAS)`
    });
  } catch (error) {
    console.error('Gagal mengirim balasan email aspirasi:', error);
    return res.status(502).json({ error: 'Email balasan gagal dikirim. Periksa konfigurasi SMTP dan coba lagi.' });
  }

  aspirationStatements.updateStatus.run('Dibalas', id);
  return res.json({ id, status: 'Dibalas', message: 'Balasan email berhasil dikirim.' });
});

app.delete('/api/aspirasi/:id', requireAdmin, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({ error: 'ID aspirasi tidak valid.' });
  }
  if (!aspirationStatements.find.get(id)) {
    return res.status(404).json({ error: 'Aspirasi tidak ditemukan.' });
  }
  aspirationStatements.remove.run(id);
  return res.status(204).end();
});

app.get('/api/news/:id/related', (req, res) => {
  const identifier = req.params.id;
  const news = /^\d+$/.test(identifier)
    ? newsStatements.findById.get(Number(identifier))
    : newsStatements.findBySlug.get(identifier);
  if (!news) return res.status(404).json({ error: 'Berita tidak ditemukan.' });
  return res.json(newsStatements.related.all(news.id));
});

app.get('/api/news/:id', (req, res) => {
  const identifier = req.params.id;
  const news = /^\d+$/.test(identifier)
    ? newsStatements.findById.get(Number(identifier))
    : newsStatements.findBySlug.get(identifier);
  if (!news) return res.status(404).json({ error: 'Berita tidak ditemukan.' });
  return res.json(news);
});

function listPrograms(_req, res) {
  return res.json(prokerStatements.list.all());
}

app.get(['/api/proker', '/api/programs'], listPrograms);

function getProgram(req, res) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'ID program tidak valid.' });
  const program = prokerStatements.find.get(id);
  if (!program) return res.status(404).json({ error: 'Program tidak ditemukan.' });
  return res.json(program);
}

app.get(['/api/proker/:id', '/api/programs/:id'], getProgram);

function getPriorityValue(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function validateProgramInput(req, res) {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const category = typeof req.body.category === 'string' ? req.body.category.trim() : '';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  const status = typeof req.body.status === 'string' ? req.body.status : '';

  if (!title || title.length > 200) return res.status(400).json({ error: 'Judul program wajib diisi (maksimal 200 karakter).' });
  if (!category || category.length > 120) return res.status(400).json({ error: 'Kategori wajib diisi (maksimal 120 karakter).' });
  if (!description || description.length > 20000) return res.status(400).json({ error: 'Deskripsi wajib diisi (maksimal 20.000 karakter).' });
  if (!['Mendatang', 'Berjalan', 'Selesai'].includes(status)) {
    return res.status(400).json({ error: 'Status harus Mendatang, Berjalan, atau Selesai.' });
  }
  const priorityInput = req.body.is_priority;
  if (priorityInput !== undefined && ![true, false, 0, 1, '0', '1', 'true', 'false'].includes(priorityInput)) {
    return res.status(400).json({ error: 'Nilai prioritas tidak valid.' });
  }
  if (req.body.image_url !== undefined && typeof req.body.image_url !== 'string') {
    return res.status(400).json({ error: 'URL gambar tidak valid.' });
  }
  return {
    title,
    category,
    description,
    status,
    isPriority: getPriorityValue(priorityInput)
  };
}

async function saveProgramImage(req, previousImageUrl) {
  if (req.file) {
    const extension = getImageExtension(req.file.buffer);
    if (!extension) return { error: 'Isi file bukan gambar JPG, PNG, WebP, atau GIF yang valid.' };
    const filename = `${crypto.randomUUID()}.${extension}`;
    const imagePath = path.join(THUMBNAIL_DIR, filename);
    await fs.promises.writeFile(imagePath, req.file.buffer, { flag: 'wx' });
    return { imageUrl: `/assets/images/thumbnails/${filename}`, savedImagePath: imagePath };
  }
  if (typeof req.body.image_url === 'string' && req.body.image_url.trim()) {
    const imageUrl = safeExternalImageUrl(req.body.image_url.trim());
    if (imageUrl === undefined) return { error: 'URL gambar harus menggunakan HTTP atau HTTPS.' };
    return { imageUrl };
  }
  return { imageUrl: previousImageUrl || null };
}

function removeLocalProgramImage(imageUrl) {
  if (!isLocalThumbnail(imageUrl)) return;
  const imagePath = path.join(THUMBNAIL_DIR, path.basename(imageUrl));
  try {
    fs.unlinkSync(imagePath);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Gagal menghapus thumbnail program:', error);
  }
}

app.post(['/api/proker', '/api/programs'], requireAdmin, requireCsrf, upload.single('image'), async (req, res) => {
  const input = validateProgramInput(req, res);
  if (!input) return;
  const image = await saveProgramImage(req, null);
  if (image.error) return res.status(400).json({ error: image.error });
  let savedImagePath;
  savedImagePath = image.savedImagePath;
  try {
    const result = database.transaction(() => {
      const insert = prokerStatements.insert.run(
        input.title, input.category, input.description, image.imageUrl, input.status, Number(input.isPriority)
      );
      return prokerStatements.find.get(insert.lastInsertRowid);
    })();
    return res.status(201).json(result);
  } catch (error) {
    if (savedImagePath) await fs.promises.unlink(savedImagePath).catch((cleanupError) => console.error('Gagal menghapus file upload program sementara:', cleanupError));
    throw error;
  }
});

app.put(['/api/proker/:id', '/api/programs/:id'], requireAdmin, requireCsrf, upload.single('image'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'ID program tidak valid.' });
  const existing = prokerStatements.find.get(id);
  if (!existing) return res.status(404).json({ error: 'Program tidak ditemukan.' });
  const input = validateProgramInput(req, res);
  if (!input) return;
  const image = await saveProgramImage(req, existing.image_url);
  if (image.error) return res.status(400).json({ error: image.error });

  try {
    const result = database.transaction(() => {
      prokerStatements.update.run(
        input.title, input.category, input.description, image.imageUrl, input.status,
        Number(input.isPriority), id
      );
      return prokerStatements.find.get(id);
    })();
    if (existing.image_url !== result.image_url) removeLocalProgramImage(existing.image_url);
    return res.json(result);
  } catch (error) {
    if (image.savedImagePath) await fs.promises.unlink(image.savedImagePath).catch((cleanupError) => console.error('Gagal menghapus file gambar program sementara:', cleanupError));
    throw error;
  }
});

app.patch(['/api/proker/:id/priority', '/api/programs/:id/priority'], requireAdmin, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'ID program tidak valid.' });
  if (typeof req.body.is_priority !== 'boolean' && ![0, 1, '0', '1'].includes(req.body.is_priority)) {
    return res.status(400).json({ error: 'Nilai prioritas tidak valid.' });
  }
  const existing = prokerStatements.find.get(id);
  if (!existing) return res.status(404).json({ error: 'Program tidak ditemukan.' });
  prokerStatements.updatePriority.run(Number(getPriorityValue(req.body.is_priority)), id);
  return res.json(prokerStatements.find.get(id));
});

app.delete(['/api/proker/:id', '/api/programs/:id'], requireAdmin, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'ID program tidak valid.' });
  const program = prokerStatements.findImage.get(id);
  if (!program) return res.status(404).json({ error: 'Program tidak ditemukan.' });

  prokerStatements.remove.run(id);
  removeLocalProgramImage(program.image_url);
  return res.status(204).end();
});

app.get('/api/admin/csrf', requireAdmin, (req, res) => {
  return res.json({ csrfToken: req.session.csrfToken });
});

app.post('/api/news', requireAdmin, requireCsrf, upload.single('image'), async (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  if (!title || title.length > 200) return res.status(400).json({ error: 'Judul wajib diisi (maksimal 200 karakter).' });
  if (!content || content.length > 20000) return res.status(400).json({ error: 'Konten wajib diisi (maksimal 20.000 karakter).' });
  if (req.body.image_url !== undefined && typeof req.body.image_url !== 'string') {
    return res.status(400).json({ error: 'URL gambar tidak valid.' });
  }

  let imageUrl = safeExternalImageUrl(req.body.image_url?.trim());
  if (imageUrl === undefined) return res.status(400).json({ error: 'URL gambar harus menggunakan HTTP atau HTTPS.' });

  let savedImagePath;
  if (req.file) {
    const extension = getImageExtension(req.file.buffer);
    if (!extension) return res.status(400).json({ error: 'Isi file bukan gambar JPG, PNG, WebP, atau GIF yang valid.' });
    const filename = `${crypto.randomUUID()}.${extension}`;
    savedImagePath = path.join(THUMBNAIL_DIR, filename);
    await fs.promises.writeFile(savedImagePath, req.file.buffer, { flag: 'wx' });
    imageUrl = `/assets/images/thumbnails/${filename}`;
  }
  if (!imageUrl) return res.status(400).json({ error: 'Upload gambar atau isi URL gambar untuk thumbnail.' });

  try {
    const result = database.transaction(() => {
      const insert = newsStatements.insert.run(title, 'pending', content, imageUrl);
      const slug = `${createSlug(title)}-${insert.lastInsertRowid}`;
      newsStatements.updateSlug.run(slug, insert.lastInsertRowid);
      return database.prepare('SELECT id, title, slug, content, image_url, created_at FROM news WHERE id = ?')
        .get(insert.lastInsertRowid);
    })();
    return res.status(201).json(result);
  } catch (error) {
    if (savedImagePath) await fs.promises.unlink(savedImagePath).catch((cleanupError) => console.error('Gagal menghapus file upload sementara:', cleanupError));
    throw error;
  }
});

app.delete('/api/news/:id', requireAdmin, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID berita tidak valid.' });
  const news = newsStatements.find.get(id);
  if (!news) return res.status(404).json({ error: 'Berita tidak ditemukan.' });

  newsStatements.remove.run(id);
  if (isLocalThumbnail(news.image_url)) {
    const filename = path.basename(news.image_url);
    const filePath = path.join(THUMBNAIL_DIR, filename);
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Gagal menghapus thumbnail berita:', error);
    }
  }
  return res.status(204).end();
});

app.get('/pageadmin/login', (req, res) => {
  if (req.session.admin === true) return res.redirect('/pageadmin');
  return res.sendFile(path.join(ROOT_DIR, 'views', 'admin-login.html'));
});

app.post('/pageadmin/login', (req, res, next) => {
  const username = typeof req.body.username === 'string' ? req.body.username : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const configuredUser = Buffer.from(process.env.ADMIN_USER);
  const suppliedUser = Buffer.from(username);
  const configuredPassword = Buffer.from(process.env.ADMIN_PASS);
  const suppliedPassword = Buffer.from(password);
  const usernameMatches = configuredUser.length === suppliedUser.length &&
    crypto.timingSafeEqual(configuredUser, suppliedUser);
  const passwordMatches = configuredPassword.length === suppliedPassword.length &&
    crypto.timingSafeEqual(configuredPassword, suppliedPassword);

  if (!usernameMatches || !passwordMatches) {
    return res.status(401).json({ error: 'Username atau password salah.' });
  }

  return req.session.regenerate((error) => {
    if (error) return next(error);
    req.session.admin = true;
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    return req.session.save((saveError) => {
      if (saveError) return next(saveError);
      return res.json({ redirect: '/pageadmin' });
    });
  });
});

app.post('/pageadmin/logout', requireAdmin, requireCsrf, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie('fomnas.sid', { httpOnly: true, sameSite: 'lax', secure: isProduction });
    return res.json({ redirect: '/pageadmin/login' });
  });
});

app.use('/assets', express.static(path.join(ROOT_DIR, 'assets'), { fallthrough: false }));
app.use('/pages', express.static(path.join(ROOT_DIR, 'pages'), { fallthrough: false }));

app.get('/', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'index.html')));
app.get('/index.html', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'index.html')));
app.get(['/index.html/pageadmin', '/index.html/pageadmin/login'], (_req, res) => res.redirect('/pageadmin'));
app.get('/news', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'pages', 'news.html')));
app.get('/news/:id', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'pages', 'news-detail.html')));
app.get('/news-detail.html', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'pages', 'news-detail.html')));
app.get('/program/:id', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'pages', 'program-detail.html')));
app.get('/pageadmin', requireAdmin, (_req, res) => res.sendFile(path.join(ROOT_DIR, 'views', 'admin-dashboard.html')));
app.use('/pageadmin', requireAdmin, (_req, res) => res.status(404).send('Halaman admin tidak ditemukan.'));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Format JSON tidak valid.' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Ukuran permintaan terlalu besar.' });
  }
  if (error.status === 404 || error.statusCode === 404) {
    return res.status(404).json({ error: 'Halaman tidak ditemukan.' });
  }
  if (error instanceof multer.MulterError) {
    return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      error: error.code === 'LIMIT_FILE_SIZE' ? 'Ukuran gambar maksimal 5 MB.' : 'Upload gambar tidak valid.'
    });
  }
  if (error.message === 'Format gambar harus JPG, PNG, WebP, atau GIF.') {
    return res.status(400).json({ error: error.message });
  }
  return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`FOMNAS-WEB berjalan di http://localhost:${port}`);
});

/* ================================================== *
 * Developed by Hafiz a.k.a @mpizzh
 * Forum Permusyawaratan Kelas Nasional (FOMNAS)  *
 * ================================================== */