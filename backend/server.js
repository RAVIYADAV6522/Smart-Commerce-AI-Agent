'use strict';

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const { agent } = require('./agent.js');

const PORT = Number(process.env.PORT) || 3000;

const app = express();

app.disable('x-powered-by');
const CORS_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://[::1]:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://[::1]:4173',
]);

// Production: set CORS_ORIGINS=https://your-app.vercel.app,https://www.example.com
for (const o of String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)) {
  CORS_ORIGINS.add(o);
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (CORS_ORIGINS.has(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
  })
);
app.use(express.json({ limit: '1mb' }));

app.post('/ask', async (req, res) => {
  try {
    const { query } = req.body ?? {};

    if (typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Invalid body: expected { "query": "non-empty string" }',
      });
    }

    console.log('Incoming request:', query);

    const payload = await agent(query);

    console.log('Agent response:', payload);

    return res.status(200).json(payload);
  } catch (err) {
    console.error('POST /ask error:', err);
    return res.status(500).json({ error: 'Something went wrong' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
