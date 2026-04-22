# Smart Commerce AI Agent

E‑commerce assistant (**Express** + **Ollama**) with a **React (Vite)** chat UI. The agent can search products, add to cart, and place orders via tools (plus optional fast paths for common phrases). Carts and chat history are **per browser session** (`express-session`); orders get a real **line-item total and order id** (in-memory log for the demo).

## Layout (common full-stack split)

| Path | Purpose |
|------|---------|
| **`backend/`** | API (`server.js`), agent (`agent.js`), `tools/`, `data/` |
| **`frontend/`** | Vite + React + Tailwind chat UI |
| **`docs/ENHANCEMENT_SPEC.md`** | Spec for the 10 shipped enhancements (sessions, orders, rate limits, types, etc.) |
| **`backend/types/askResponse.d.ts`** | JSON response contract for `POST /ask` |

## Prerequisites

- **Node.js 18+**
- **Ollama** when running the LLM locally (e.g. `ollama pull llama3.2`)

## Product search: brands and tokens (less “one-off” tuning)

- **OEM / brand** — The product API supports a **`brand` filter** (name/highlights) plus optional **category**. The agent **infers the brand** from the user’s English (`inferBrandFromText`: Samsung, Apple, Google, Redmi/Xiaomi, etc.) and passes it into `searchProducts`, so “Samsung phones” does not degrade into a generic `query: "phone"` that returns every handset.
- **Token AND (default)** — Multi-word `query` is split into “hard” tokens; **every** hard token must appear in name, category, or `highlights`. **Soft** words (*phone, mobile, best, …*) do not force a literal match, so you are not re-prompting the LLM for every synonym.
- **Heuristic: brand + device** — Phrases like “I’m looking for Samsung phones” hit a **fast path** with brand + category before the LLM, so behavior is stable in tests and production.

## How the agent picks actions (intent → tools)

1. **Fast paths (no LLM)** — Greeting/small talk, add‑to‑cart with an id, checkout phrases, product search heuristics, **phone + battery** keyword search, and **remove / clear cart** are handled with rules so the UI matches server state.
2. **Ground-truth cart in the LLM prompt** — Every Ollama step includes the current cart JSON. The model is instructed not to claim “empty cart”, “order cancelled”, or “clean slate” unless that matches the cart *after* a tool (`clearCart`, `removeFromCart`, or successful `placeOrder` which empties the cart). There is **no** cancel-order API; don’t tell users an order was cancelled from chat alone.
3. **Otherwise** — The model returns JSON with one `action` per step (`searchProducts`, `addToCart`, `removeFromCart`, `clearCart`, `placeOrder`, or `finish`).

For a heavier **intent-then-router** (classify to `REMOVE_CART` then only run cart tools), you can add a small classifier model or a dedicated `/api/intent` step in front of the same tools.

## Ollama: local vs deployed

| Scenario | What to do |
|----------|------------|
| **Local dev** | Run Ollama on the same machine; keep `OLLAMA_GENERATE_URL=http://127.0.0.1:11434/api/generate` in `backend/.env`. |
| **Vercel (or any cloud API)** | The API **cannot** reach `localhost:11434` on your laptop. Use a model reachable from the server (Ollama on another host you expose, or another HTTP inference endpoint) and set `OLLAMA_GENERATE_URL` to that public URL, or run the API on a machine where Ollama is local. |
| **Frontend** | The UI only talks to the API. Set `VITE_API_URL` to your API base (e.g. `https://your-app.vercel.app/backend` for the multi-service layout in `vercel.json`). The browser must use **`credentials: 'include'`** (already in the app) so the **session cookie** is sent. |

## Setup

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm start
```

Runs **http://localhost:3000** by default (`PORT` in `backend/.env`).

**Production:** set a strong `SESSION_SECRET` and add your real frontend origin to `CORS_ORIGINS`. If the site is served over **HTTPS**, set `SESSION_COOKIE_SECURE=1` so the session cookie is only sent on secure connections.

If you still have a **`.env` in the repo root** from an older layout, move it to **`backend/.env`** (the server loads only that path).

### Frontend

```bash
cd frontend
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**. Set `VITE_API_URL` in `frontend/.env` if the API port or host differs.

### From repo root (optional)

```bash
npm run install:all   # install backend + frontend deps
npm start             # start API (runs `npm start` in backend)
npm run dev           # API with --watch
npm run dev:frontend  # Vite dev server
npm test              # run backend unit tests
```

## Security

- Never commit **`backend/.env`** or **`frontend/.env`** (see `.gitignore`).
- Use **`backend/.env.example`** / **`frontend/.env.example`** as templates only.
- Set **`SESSION_SECRET`** in production; keep **`CORS_ORIGINS`** limited to your real UI origins. The API uses **`credentials: true`** for CORS so session cookies work.

## Scripts (summary)

| Command | Description |
|---------|-------------|
| `cd backend && npm start` | API |
| `cd backend && npm run dev` | API + watch |
| `cd backend && npm test` | Backend tests (`node --test`) |
| `cd frontend && npm run dev` | UI dev |
| `cd frontend && npm run build` | UI build → `frontend/dist/` |

## License

Add a `LICENSE` file if you want a standard open-source license.
