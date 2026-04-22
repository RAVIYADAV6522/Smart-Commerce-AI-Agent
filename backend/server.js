'use strict';

const crypto = require('crypto');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { agent } = require('./agent.js');

const PORT = Number(process.env.PORT) || 3000;
const MAX_QUERY_LENGTH = Number(process.env.MAX_QUERY_LENGTH) || 4000;
const isTest = process.env.NODE_ENV === 'test';

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  const id = req.get('X-Request-Id') || crypto.randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
});

const CORS_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://[::1]:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://[::1]:4173',
]);

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
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

app.use(
  session({
    name: 'sc.sid',
    secret: process.env.SESSION_SECRET || 'dev-insecure-change-me',
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      secure: String(process.env.SESSION_COOKIE_SECURE || '').trim() === '1',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

const askLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Math.max(1, Number(process.env.ASK_RATE_LIMIT_MAX) || 60),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.sessionID || req.ip || 'unknown',
  skip: () => isTest,
});

/**
 * @see {import('./types/askResponse').AskSuccess} and AskErrorBody in `../types/askResponse.d.ts`
 */
const askHandler = async (req, res) => {
  const requestId = req.requestId;
  try {
    const { query } = req.body ?? {};

    if (typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        error: 'Invalid body: expected { "query": "non-empty string" }',
        code: 'invalid_body',
        requestId,
      });
    }

    if (query.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({
        error: `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`,
        code: 'query_too_long',
        requestId,
      });
    }

    const safeLen = {
      type: 'ask_in',
      requestId,
      sessionId: req.sessionID,
      queryLength: query.length,
    };
    console.log(JSON.stringify(safeLen));

    const payload = await agent(query, {
      session: req.session,
      sessionId: req.sessionID,
      requestId,
    });

    const out = { ...payload, requestId };
    return res.status(200).json(out);
  } catch (err) {
    console.error(
      JSON.stringify({
        type: 'ask_error',
        requestId,
        err: err instanceof Error ? err.message : String(err),
      })
    );
    return res
      .status(500)
      .json({ error: 'Something went wrong', requestId, code: 'server_error' });
  }
};

const askRouter = express.Router();
askRouter.post('/ask', askLimiter, askHandler);
app.use(askRouter);
app.use('/backend', askRouter);

app.use((req, res) => {
  res
    .status(404)
    .json({ error: 'Not found', requestId: req.requestId, code: 'not_found' });
});

app.use((err, req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.requestId,
    code: 'server_error',
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      JSON.stringify({ type: 'server_listen', port: PORT, at: new Date().toISOString() })
    );
  });
}

module.exports = app;
