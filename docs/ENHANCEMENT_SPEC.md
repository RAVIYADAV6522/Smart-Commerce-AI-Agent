# Enhancement spec — Smart Commerce AI Agent

This document tracks **10** prioritized improvements: scope, deliverables, and acceptance criteria. Status: **implemented** in this repo (see git history for details).

| # | Task | Status | Acceptance criteria |
|---|------|--------|---------------------|
| 1 | **Session-based carts** | Done | Each browser session has an isolated `cart` via `express-session`; no shared process-global array. `fetch` from the UI uses `credentials: "include"`. CORS allows credentials for configured origins. |
| 2 | **Real `placeOrder` flow** | Done | `placeOrder` validates non-empty cart, builds line items + total, generates a **stable order id**, clears the cart, appends to an in-memory order log (per-session metadata). Response includes `order: { id, lineItems, total, currency? }`. |
| 3 | **Product catalog loading** | Done | `products.json` is loaded and cached in memory; `reloadProductCatalog()` for tests/ops. Searches use the cache (no per-request full file read). |
| 4 | **Harden `POST /ask`** | Done | Max body size remains bounded; `query` has a configurable max length; **rate limiting** on `/ask` and `/backend/ask`; 400 responses include structured `{ error, code? }` where useful. |
| 5 | **Surface cart in API + UI** | Done | Successful agent responses include **`cart`** (current line items) when applicable. Chat UI shows a **cart summary** (names, line count, subtotal) for assistant messages that include `cart`. |
| 6 | **Automated tests** | Done | `npm test` in `backend/` runs `node --test` — covers `searchProducts` filters/cache and cart/order helpers (session-shaped fixtures). |
| 7 | **Structured logging** | Done | Each request has a **request id** (`X-Request-Id` in/out or generated); logs include `requestId` + `session` summary for `/ask` (no PII; truncated query optional). |
| 8 | **Response shape documentation** | Done | `backend/types/askResponse.d.ts` (JSDoc-style types for the JSON contract) + short comment in `server.js` pointing to it. |
| 9 | **Richer product search** | Done | `searchProducts` supports **optional** `minPrice`, `maxPrice`, `category` (string match), `inStockOnly` (true/false) in the agent tool JSON + normalization layer. |
| 10 | **Ollama / deployment story** | Done | README (and this doc’s appendix) documents: local Ollama vs remote, `OLLAMA_GENERATE_URL`, that **Vercel serverless** cannot reach `localhost:11434` on your laptop, and session cookie + `CORS` + `VITE_API_URL` for the split deployment. |

## Notes

- **Session secret:** set `SESSION_SECRET` in production; never commit the real value.
- **Order persistence:** in-memory list is enough for the demo; swap for Postgres later without changing the HTTP contract.
- **Conversation + cart:** both are stored in `express-session` so each tab/session gets coherent follow-ups and cart state.

## Appendix — env vars (reference)

See `backend/.env.example` and `frontend/.env.example` for the full list, including: `SESSION_SECRET`, `CORS_ORIGINS`, `ASK_RATE_LIMIT_MAX`, `MAX_QUERY_LENGTH`, Ollama variables, and `VITE_API_URL` for the frontend.
