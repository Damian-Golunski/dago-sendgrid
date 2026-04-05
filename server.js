import express from 'express';

const app = express();
app.use(express.json({ limit: '2mb' }));
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

app.get('/api/scheduled', async (_req, res) => {
  try { res.json(await sg('/user/scheduled_sends')); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/healthz', (_, res) => res.send('ok'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SendGrid AI Assistant on :${port}`));
