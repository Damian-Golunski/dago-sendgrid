# SendGrid AI Assistant

AI-powered web UI for SendGrid. Connect your SendGrid API key and optional Anthropic API key to:

- View profile, stats, templates and verified senders
- Let Claude draft email copy (subject + HTML + text)
- Send emails through SendGrid directly from the UI
- Get an AI analysis of your last 30 days of sending stats

Keys are stored in your browser's localStorage and sent to the backend only as request headers — they are not persisted server-side.

## Run locally

```bash
npm install
npm start
# open http://localhost:3000
```

## Deploy

Deploys to Railway out of the box (`npm start`, port from `$PORT`).

Optional env vars on the server:
- `SENDGRID_API_KEY` — default key if you don't want users to paste one
- `ANTHROPIC_API_KEY` — default Claude key
