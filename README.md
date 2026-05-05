# Polymarket Cosmos

A 3D, space-themed visualization of every active event on
[Polymarket](https://polymarket.com). Each prediction-market event becomes a
glowing planet floating in a tilted galactic disk; the brightest planets are
the markets with the most 24h volume. Click a planet to focus on it and read
the top outcomes, then jump to the real Polymarket page in one click.

The site is intentionally more about visual impact than productivity — but the
buttons work, the links are clickable, and everything is driven by the live
Polymarket Gamma API.

![Polymarket Cosmos preview](docs/preview.png)

## Architecture

```
┌──────────────────────────────────────┐
│ frontend/  React + Vite + TypeScript │
│            three.js / @react-three/* │
│            postprocessing (bloom)    │
└─────────────────┬────────────────────┘
                  │ /api/events
┌─────────────────▼────────────────────┐
│ backend/   FastAPI + httpx            │
│            • /api/events  (cached)   │
│            • /api/health             │
│            • serves built frontend    │
└─────────────────┬────────────────────┘
                  │
                  ▼
       https://gamma-api.polymarket.com
```

The frontend is a pure SPA. The backend exists for two reasons:

1. The Polymarket Gamma API does **not** send CORS headers, so the browser
   cannot call it directly.
2. Caching the response (60s) keeps things fast and avoids hammering upstream.

A single FastAPI service serves both the JSON API and the built frontend, so
the whole site deploys as one process.

## Running locally

You need Python 3.11+, Node 20+, and either `uv` or `pip`.

```bash
# 1. Backend
cd backend
uv venv .venv && source .venv/bin/activate
uv pip install -e .
uvicorn app.main:app --reload --port 8000

# 2. Frontend (in another shell)
cd frontend
npm install
npm run dev          # Vite dev server on http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:8000`, so the
frontend talks to the local FastAPI backend.

## Production build

```bash
# Build the frontend.
cd frontend && npm install && npm run build

# Copy the static bundle into the backend so it can serve it.
rm -rf ../backend/static && mkdir -p ../backend/static
cp -r dist/. ../backend/static/

# Run the combined service.
cd ../backend
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000` and the cosmos appears.

## Deployment notes

- The repository ignores `frontend/dist/` and `backend/static/` because they
  are build artifacts. The deploy script always rebuilds the frontend and
  copies it into the backend before pushing.
- The auto-generated `Dockerfile` / `fly.toml` from Devin's `deploy backend`
  command are also gitignored.

## Tech stack

- [React 18](https://react.dev/) + [Vite](https://vitejs.dev/) +
  [TypeScript](https://www.typescriptlang.org/)
- [three.js](https://threejs.org/) via
  [`@react-three/fiber`](https://github.com/pmndrs/react-three-fiber),
  [`@react-three/drei`](https://github.com/pmndrs/drei),
  and [`@react-three/postprocessing`](https://github.com/pmndrs/react-postprocessing)
  (bloom + vignette)
- [FastAPI](https://fastapi.tiangolo.com/) +
  [httpx](https://www.python-httpx.org/) on the backend

## Credits

Live data courtesy of the [Polymarket Gamma API](https://docs.polymarket.com/).
