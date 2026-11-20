// Route 66 Coffee Diner — сервер сайту (Node.js, без залежностей)
// Запуск:  node server.js        (порт можна змінити: PORT=8080 node server.js)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8066;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const DEFAULT_PASSWORD = 'route66admin';
const TOKEN_TTL = 12 * 3600; // секунд

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

// ---------- файли даних ----------
function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); }
  catch (e) { return fallback; }
}
function writeJSON(name, value) {
  const file = path.join(DATA, name);
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

// ---------- авторизація (PBKDF2 — сумісно з api.php) ----------
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
}
function getAuth() {
  let auth = readJSON('auth.json', null);
  if (!auth) {
    const salt = crypto.randomBytes(16).toString('hex');
    auth = { salt, hash: hashPassword(DEFAULT_PASSWORD, salt), secret: crypto.randomBytes(32).toString('hex'), isDefault: true };
    writeJSON('auth.json', auth);
  }
  return auth;
}
function makeToken(auth) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL;
  const sig = crypto.createHmac('sha256', auth.secret).update(String(exp)).digest('hex');
  return exp + '.' + sig;
}
function checkToken(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const [exp, sig] = token.split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const auth = getAuth();
  const good = crypto.createHmac('sha256', auth.secret).update(String(exp)).digest('hex');
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}

// ---------- допоміжне ----------
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 2e6) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const lastPost = new Map(); // антиспам відгуків по IP

// ---------- API ----------
async function api(req, res, route) {
  const method = req.method;
  const authed = checkToken(req);
  const need = () => { if (!authed) { send(res, 401, { error: 'Потрібен вхід адміністратора' }); return false; } return true; };

  if (route === 'login' && method === 'POST') {
    const body = await readBody(req);
    const auth = getAuth();
    const ok = hashPassword(String(body.password || ''), auth.salt) === auth.hash;
    if (!ok) { await new Promise(r => setTimeout(r, 600)); return send(res, 401, { error: 'Невірний пароль' }); }
    return send(res, 200, { token: makeToken(auth), isDefault: !!auth.isDefault });
  }
  if (route === 'password' && method === 'POST') {
    if (!need()) return;
    const body = await readBody(req);
    const auth = getAuth();
    if (hashPassword(String(body.old || ''), auth.salt) !== auth.hash) return send(res, 400, { error: 'Старий пароль невірний' });
    const pw = String(body.new || '');
    if (pw.length < 6) return send(res, 400, { error: 'Пароль має містити щонайменше 6 символів' });
    const salt = crypto.randomBytes(16).toString('hex');
    const next = { salt, hash: hashPassword(pw, salt), secret: crypto.randomBytes(32).toString('hex'), isDefault: false };
    writeJSON('auth.json', next);
    return send(res, 200, { ok: true, token: makeToken(next) });
  }

  if (route === 'menu') {
    if (method === 'GET') return send(res, 200, readJSON('menu.json', { categories: [] }));
    if (method === 'PUT') {
      if (!need()) return;
      const body = await readBody(req);
      if (!body || !Array.isArray(body.categories)) return send(res, 400, { error: 'Невірний формат меню' });
      writeJSON('menu.json', body);
      return send(res, 200, { ok: true });
    }
  }

  if (route === 'settings') {
    if (method === 'GET') return send(res, 200, readJSON('settings.json', {}));
    if (method === 'PUT') {
      if (!need()) return;
      const body = await readBody(req);
      if (!body || typeof body !== 'object') return send(res, 400, { error: 'Невірні дані' });
      writeJSON('settings.json', body);
      return send(res, 200, { ok: true });
    }
  }

  if (route === 'reviews') {
    const list = readJSON('reviews.json', []);
    if (method === 'GET') {
      const all = authed && /[?&]all=1/.test(req.url);
      return send(res, 200, all ? list : list.filter(r => !r.hidden));
    }
    if (method === 'POST') {
      const body = await readBody(req);
      const ip = req.socket.remoteAddress || '';
      const now = Date.now();
      if (lastPost.has(ip) && now - lastPost.get(ip) < 30000) return send(res, 429, { error: 'Зачекайте трохи перед наступним відгуком' });
      if (body.website) return send(res, 200, { ok: true }); // пастка для ботів
      const name = clean(body.name, 40), text = clean(body.text, 600);
      const rating = Math.max(1, Math.min(5, parseInt(body.rating, 10) || 0));
      if (name.length < 2 || text.length < 5 || !parseInt(body.rating, 10)) return send(res, 400, { error: 'Заповніть імʼя, оцінку та текст відгуку' });
      const settings = readJSON('settings.json', {});
      const review = { id: crypto.randomBytes(6).toString('hex'), name, rating, text, date: new Date().toISOString(), hidden: !!settings.reviewsModeration };
      list.unshift(review);
      writeJSON('reviews.json', list);
      lastPost.set(ip, now);
      return send(res, 200, { ok: true, pending: review.hidden });
    }
  }
  const m = route.match(/^reviews\/([a-f0-9]+)$/);
  if (m) {
    if (!need()) return;
    let list = readJSON('reviews.json', []);
    const r = list.find(x => x.id === m[1]);
    if (!r) return send(res, 404, { error: 'Відгук не знайдено' });
    if (method === 'DELETE') { list = list.filter(x => x.id !== m[1]); writeJSON('reviews.json', list); return send(res, 200, { ok: true }); }
    if (method === 'PATCH') { const body = await readBody(req); if ('hidden' in body) r.hidden = !!body.hidden; writeJSON('reviews.json', list); return send(res, 200, { ok: true }); }
  }
  send(res, 404, { error: 'Не знайдено' });
}

// ---------- статика ----------
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC) || /[\\/]\./.test(rel) || file.endsWith('.php')) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // /admin -> admin.html
      if (!path.extname(rel) && fs.existsSync(file + '.html')) return serveStatic(req, res, pathname + '.html');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<h1>404</h1><a href="/">На головну</a>');
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && type.startsWith('video/')) { // потрібно для відео в Safari
      const [s, e] = range.replace('bytes=', '').split('-');
      const start = parseInt(s, 10) || 0, end = e ? parseInt(e, 10) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': type.startsWith('text/') ? 'no-cache' : 'public, max-age=86400' });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url.pathname.slice(5).replace(/\/$/, ''));
    serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Помилка сервера' }); else res.end();
  }
}).listen(PORT, () => {
  fs.mkdirSync(DATA, { recursive: true });
  getAuth();
  console.log(`Route 66 Coffee Diner: http://localhost:${PORT}  (адмінка: /admin)`);
});
