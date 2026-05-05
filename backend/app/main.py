"""FastAPI app that proxies the Polymarket Gamma API and serves the static cosmic frontend.

Endpoints:
    GET /api/events   - Active Polymarket events (cached for 60s).
    GET /api/health   - Health probe.
    GET /             - Static frontend (built React + Three.js app).
"""

from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

GAMMA_BASE = "https://gamma-api.polymarket.com"

# How many events to fetch from upstream (Polymarket caps the page size).
UPSTREAM_PAGE_LIMIT = 100
# Maximum events kept after sorting/filtering.
MAX_EVENTS = 300
# Cache duration for the upstream response.
CACHE_TTL_SECONDS = 60


_cache: dict[str, Any] = {"ts": 0.0, "data": None}
_cache_lock = asyncio.Lock()


def _slim_event(event: dict[str, Any]) -> dict[str, Any]:
    """Strip the upstream event payload down to the fields the frontend needs.

    The Polymarket gamma response is large (markets + tags + order-book metadata
    per event); only a handful of fields drive the visualization.
    """

    markets = event.get("markets") or []
    slim_markets: list[dict[str, Any]] = []
    for market in markets[:8]:
        slim_markets.append(
            {
                "id": market.get("id"),
                "question": market.get("question"),
                "slug": market.get("slug"),
                "outcomes": market.get("outcomes"),
                "outcomePrices": market.get("outcomePrices"),
                "volume": market.get("volume"),
                "groupItemTitle": market.get("groupItemTitle"),
            }
        )

    tags = [
        {"label": tag.get("label"), "slug": tag.get("slug")}
        for tag in (event.get("tags") or [])
        if tag.get("label")
    ][:6]

    return {
        "id": event.get("id"),
        "slug": event.get("slug"),
        "title": event.get("title"),
        "description": event.get("description"),
        "image": event.get("image") or event.get("icon"),
        "icon": event.get("icon"),
        "endDate": event.get("endDate"),
        "startDate": event.get("startDate"),
        "volume": event.get("volume"),
        "volume24hr": event.get("volume24hr"),
        "liquidity": event.get("liquidity"),
        "openInterest": event.get("openInterest"),
        "competitive": event.get("competitive"),
        "featured": event.get("featured"),
        "commentCount": event.get("commentCount"),
        "tags": tags,
        "markets": slim_markets,
    }


async def _fetch_events() -> list[dict[str, Any]]:
    """Fetch the most-active Polymarket events and return the slimmed payload."""

    params = {
        "limit": UPSTREAM_PAGE_LIMIT,
        "active": "true",
        "closed": "false",
        "archived": "false",
        "order": "volume24hr",
        "ascending": "false",
    }
    timeout = httpx.Timeout(15.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.get(f"{GAMMA_BASE}/events", params=params)
        response.raise_for_status()
        events = response.json()

    if not isinstance(events, list):
        raise HTTPException(status_code=502, detail="Upstream returned unexpected payload")

    slim = [_slim_event(e) for e in events if e.get("slug") and e.get("title")]
    # Keep the top events by 24h volume but always include featured ones.
    slim.sort(
        key=lambda e: (
            -1 if e.get("featured") else 0,
            -float(e.get("volume24hr") or 0.0),
        )
    )
    return slim[:MAX_EVENTS]


async def get_events() -> list[dict[str, Any]]:
    """Return cached events, refreshing them in the background when stale."""

    now = time.time()
    cached = _cache.get("data")
    if cached is not None and now - _cache["ts"] < CACHE_TTL_SECONDS:
        return cached

    async with _cache_lock:
        now = time.time()
        cached = _cache.get("data")
        if cached is not None and now - _cache["ts"] < CACHE_TTL_SECONDS:
            return cached

        try:
            data = await _fetch_events()
        except httpx.HTTPError as exc:
            if cached is not None:
                # Serve stale cache rather than failing if upstream blips.
                return cached
            raise HTTPException(status_code=502, detail=f"Upstream error: {exc}") from exc

        _cache["data"] = data
        _cache["ts"] = time.time()
        return data


app = FastAPI(title="Polymarket Cosmos", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/events")
async def events_endpoint() -> JSONResponse:
    data = await get_events()
    return JSONResponse(
        content={"events": data, "count": len(data)},
        headers={"Cache-Control": "public, max-age=30"},
    )


# Serve the built frontend (Vite copies its dist/ output here at build time).
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

if STATIC_DIR.is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=STATIC_DIR / "assets"),
        name="assets",
    )

    @app.get("/", include_in_schema=False)
    async def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa_fallback(path: str) -> FileResponse:
        # Allow direct access to known top-level files (favicon, robots, etc.).
        candidate = STATIC_DIR / path
        if candidate.is_file():
            return FileResponse(candidate)
        # Otherwise fall back to the SPA shell so client-side routing works.
        return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        reload=False,
    )
