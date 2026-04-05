import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json({ limit: '2mb' }));

// --- Session-based auth ---
const AUTH_USER = process.env.AUTH_USER || '';
const AUTH_PASS = process.env.AUTH_PASS || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE_NAME = 'dago_sg_session';
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

function sign(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verify(token) {
  if (!token) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(rest.join('='));
  }
  return out;
}

function isAuthenticated(req) {
  if (!AUTH_USER || !AUTH_PASS) return true; // auth disabled when env missing
  const token = parseCookies(req)[COOKIE_NAME];
  return !!verify(token);
}

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!AUTH_USER || !AUTH_PASS) return res.json({ ok: true });
  if (username === AUTH_USER && password === AUTH_PASS) {
    const token = sign({ u: username, exp: Date.now() + SESSION_TTL_MS });
    res.setHeader('Set-Cookie',
      `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${SESSION_TTL_MS/1000}; SameSite=Lax; Secure`);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure`);
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

// Auth gate — protects everything except login page, login endpoint, static assets needed before login
app.use((req, res, next) => {
  const open = [
    '/healthz', '/login', '/login.html', '/api/login', '/api/me',
    '/favicon.svg', '/favicon.ico',
  ];
  if (open.includes(req.path)) return next();
  if (isAuthenticated(req)) return next();
  // HTML requests → redirect to login page; API → 401
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'not authenticated' });
  res.redirect('/login');
});

// Explicit /login route serves login.html
app.get('/login', (_req, res) => res.sendFile('login.html', { root: 'public' }));

app.use(express.static('public'));

const SENDGRID_API = 'https://api.sendgrid.com/v3';

async function sg(path, { method = 'GET', body } = {}) {
  const key = process.env.SENDGRID_API_KEY || '';
  if (!key) throw new Error('Missing SENDGRID_API_KEY env var on the server');
  const res = await fetch(`${SENDGRID_API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = typeof data === 'object' ? JSON.stringify(data) : data;
    throw new Error(`SendGrid ${res.status}: ${msg}`);
  }
  return data;
}

// --- SendGrid endpoints ---

app.get('/api/profile', async (_req, res) => {
  try { res.json(await sg('/user/profile')); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7', 10);
    const end = new Date();
    const start = new Date(Date.now() - days * 86400000);
    const fmt = d => d.toISOString().slice(0, 10);
    res.json(await sg(`/stats?start_date=${fmt(start)}&end_date=${fmt(end)}&aggregated_by=day`));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/templates', async (_req, res) => {
  try { res.json(await sg('/templates?generations=legacy,dynamic&page_size=50')); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/messages', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const limit = Math.min(parseInt(req.query.limit || '1000', 10), 1000);
    const end = new Date();
    const start = new Date(Date.now() - days * 86400000);
    const iso = d => d.toISOString().replace(/\.\d+Z$/, 'Z');
    const q = `last_event_time BETWEEN TIMESTAMP "${iso(start)}" AND TIMESTAMP "${iso(end)}"`;
    res.json(await sg(`/messages?limit=${limit}&query=${encodeURIComponent(q)}`));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/message/:id', async (req, res) => {
  try { res.json(await sg(`/messages/${encodeURIComponent(req.params.id)}`)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/singlesends', async (_req, res) => {
  try {
    const data = await sg('/marketing/singlesends?page_size=100');
    res.json(data);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/singlesend/:id', async (req, res) => {
  try {
    const id = encodeURIComponent(req.params.id);
    const [detail, stats] = await Promise.all([
      sg(`/marketing/singlesends/${id}`),
      sg(`/marketing/stats/singlesends/${id}`).catch(() => null),
    ]);
    res.json({ detail, stats });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/scheduled', async (_req, res) => {
  try { res.json(await sg('/user/scheduled_sends')); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/healthz', (_, res) => res.send('ok'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SendGrid AI Assistant on :${port}`));
