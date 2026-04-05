import express from 'express';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static('public'));

const SENDGRID_API = 'https://api.sendgrid.com/v3';

function sgKey(req) {
  return req.header('x-sendgrid-key') || process.env.SENDGRID_API_KEY || '';
}

async function sg(req, path, { method = 'GET', body } = {}) {
  const key = sgKey(req);
  if (!key) throw new Error('Missing SendGrid API key');
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

// --- SendGrid passthrough endpoints ---

app.get('/api/profile', async (req, res) => {
  try { res.json(await sg(req, '/user/profile')); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/stats', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7', 10);
    const end = new Date();
    const start = new Date(Date.now() - days * 86400000);
    const fmt = d => d.toISOString().slice(0, 10);
    const data = await sg(req, `/stats?start_date=${fmt(start)}&end_date=${fmt(end)}&aggregated_by=day`);
    res.json(data);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/templates', async (req, res) => {
  try { res.json(await sg(req, '/templates?generations=legacy,dynamic&page_size=50')); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/senders', async (req, res) => {
  try { res.json(await sg(req, '/verified_senders')); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/send', async (req, res) => {
  try {
    const { to, from, subject, html, text } = req.body;
    if (!to || !from || !subject || (!html && !text)) {
      return res.status(400).json({ error: 'to, from, subject and html/text required' });
    }
    await sg(req, '/mail/send', {
      method: 'POST',
      body: {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject,
        content: [{ type: html ? 'text/html' : 'text/plain', value: html || text }],
      },
    });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// --- AI draft endpoint ---

app.post('/api/ai/draft', async (req, res) => {
  try {
    const apiKey = req.header('x-anthropic-key') || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Missing Anthropic API key' });
    const { instruction, context } = req.body;
    if (!instruction) return res.status(400).json({ error: 'instruction required' });

    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      system: 'You are an email copywriter assistant for a SendGrid user. When asked to draft an email, respond ONLY with a JSON object: {"subject": "...", "html": "...", "text": "..."}. No preamble, no markdown fences.',
      messages: [{
        role: 'user',
        content: `${instruction}${context ? `\n\nContext:\n${context}` : ''}`,
      }],
    });
    const raw = msg.content.map(c => c.text || '').join('').trim();
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    let draft;
    try { draft = JSON.parse(cleaned); }
    catch { draft = { subject: '(draft)', html: cleaned, text: cleaned }; }
    res.json(draft);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// --- AI stats analysis ---

app.post('/api/ai/analyze', async (req, res) => {
  try {
    const apiKey = req.header('x-anthropic-key') || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Missing Anthropic API key' });
    const stats = await sg(req, '/stats?start_date=' +
      new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10) +
      '&aggregated_by=day');

    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Analyze these SendGrid stats for the last 30 days. Identify trends in delivery, opens, clicks, bounces, spam reports. Give 3 concrete recommendations.\n\n${JSON.stringify(stats).slice(0, 15000)}`,
      }],
    });
    res.json({ analysis: msg.content.map(c => c.text || '').join('') });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/healthz', (_, res) => res.send('ok'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SendGrid AI Assistant on :${port}`));
