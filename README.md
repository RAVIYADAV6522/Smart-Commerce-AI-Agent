# Smart Commerce AI Agent

E‑commerce assistant (**Express** + **Ollama**) with a **React (Vite)** chat UI. The agent can search products, add to cart, and place orders via tools (plus optional fast paths for common phrases).

## Layout (common full-stack split)

| Path | Purpose |
|------|---------|
| **`backend/`** | API (`server.js`), agent (`agent.js`), `tools/`, `data/` |
| **`frontend/`** | Vite + React + Tailwind chat UI |

This mirrors how many teams separate **API** and **web** packages in one repo.

## Prerequisites

- **Node.js 18+**
- **Ollama** locally (e.g. `ollama pull llama3.2`)

## Setup

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm start
```

Runs **http://localhost:3000** by default (`PORT` in `backend/.env`).

If you still have a **`.env` in the repo root** from an older layout, move it to **`backend/.env`** (the server loads only that path).

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open **http://localhost:5173**. Set `VITE_API_URL` in `frontend/.env` if the API port differs.

### From repo root (optional)

```bash
npm run install:all   # install backend + frontend deps
npm start             # start API (runs `npm start` in backend)
npm run dev           # API with --watch
npm run dev:frontend  # Vite dev server
```

## Security

- Never commit **`backend/.env`** or **`frontend/.env`** (see `.gitignore`).
- Use **`backend/.env.example`** / **`frontend/.env.example`** as templates only.
- Tighten CORS in `backend/server.js` for production domains.

## Scripts (summary)

| Command | Description |
|---------|-------------|
| `cd backend && npm start` | API |
| `cd backend && npm run dev` | API + watch |
| `cd frontend && npm run dev` | UI dev |
| `cd frontend && npm run build` | UI build → `frontend/dist/` |

## License

Add a `LICENSE` file if you want a standard open-source license.
