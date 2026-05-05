import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { fetchEvents } from "./api";
import type { PolymarketEvent } from "./types";
import {
  CATEGORY_FILTERS,
  categoryColor,
  eventUrl,
  formatCurrency,
  formatRelativeDate,
  parseOutcomes,
  topOutcome,
} from "./utils";
import { placeEvents, type PlacedEvent } from "./layout";
import { CoreGlow, NebulaClouds, Starfield } from "./scene/Background";
import { Planet } from "./scene/Planet";
import { CameraRig } from "./scene/CameraRig";

export default function App() {
  const [events, setEvents] = useState<PolymarketEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [hovered, setHovered] = useState<{ planet: PlacedEvent; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<PlacedEvent | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const controlsRef = useRef<OrbitControlsImpl>(null!);

  useEffect(() => {
    const ac = new AbortController();
    fetchEvents(ac.signal)
      .then((data) => {
        setEvents(data);
        setTimeout(() => document.getElementById("boot")?.classList.add("hide"), 200);
      })
      .catch((err) => {
        if ((err as { name?: string }).name === "AbortError") return;
        setError(String((err as Error).message ?? err));
        document.getElementById("boot")?.classList.add("hide");
      });
    return () => ac.abort();
  }, []);

  // Compute planet placements once for the dataset.
  const placed = useMemo(() => {
    if (!events) return [];
    return placeEvents(events, (e) => categoryColor(e).hex);
  }, [events]);

  // Build filter set.
  const filteredIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = placed.filter((p) => {
      const cat = categoryColor(p.event).key;
      if (activeCategory !== "all" && cat !== activeCategory) return false;
      if (!q) return true;
      const haystack = [
        p.event.title,
        p.event.description ?? "",
        ...(p.event.tags ?? []).map((t) => t.label),
        ...(p.event.markets ?? []).map((m) => m.question ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
    return new Set(filtered.map((p) => p.event.id));
  }, [placed, query, activeCategory]);

  const total = events?.length ?? 0;
  const visible = filteredIds.size;

  const handlePointerEnter = (planet: PlacedEvent, screen: { x: number; y: number }) => {
    setHovered({ planet, x: screen.x, y: screen.y });
  };
  const handlePointerMove = (screen: { x: number; y: number }) => {
    setHovered((h) => (h ? { ...h, x: screen.x, y: screen.y } : h));
  };
  const handlePointerLeave = () => setHovered(null);

  const handleClickPlanet = (planet: PlacedEvent) => {
    setSelected(planet);
    setHovered(null);
  };

  // Press Escape to deselect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app-shell">
      <div className="canvas-host">
        <Canvas
          dpr={[1, 1.6]}
          camera={{ position: [0, 14, 28], fov: 55, near: 0.1, far: 400 }}
          gl={{ antialias: true, alpha: false }}
          onCreated={({ gl }) => {
            gl.setClearColor("#02030c", 1);
          }}
          onPointerMissed={() => setSelected(null)}
        >
          <ambientLight intensity={0.55} />
          <pointLight position={[0, 0, 0]} intensity={1.2} color="#fff7e8" distance={60} decay={1.4} />
          <directionalLight position={[15, 20, 12]} intensity={0.5} color="#a8b5ff" />

          <Starfield />
          <NebulaClouds />
          <CoreGlow />

          {placed.map((p) => (
            <Planet
              key={p.event.id}
              placed={p}
              selected={selected?.event.id === p.event.id}
              dimmed={
                (selected != null && selected.event.id !== p.event.id) ||
                !filteredIds.has(p.event.id)
              }
              onPointerEnter={handlePointerEnter}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              onClick={handleClickPlanet}
            />
          ))}

          <OrbitControls
            ref={controlsRef as React.RefObject<OrbitControlsImpl>}
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            minDistance={8}
            maxDistance={70}
            maxPolarAngle={Math.PI * 0.85}
            minPolarAngle={Math.PI * 0.18}
          />
          <CameraRig
            controlsRef={controlsRef as React.RefObject<OrbitControlsImpl>}
            focus={selected ? selected.position : null}
            enableAutoRotate={autoRotate}
          />

          <EffectComposer multisampling={0}>
            <Bloom
              intensity={1.05}
              luminanceThreshold={0.18}
              luminanceSmoothing={0.18}
              mipmapBlur
            />
            <Vignette eskil={false} offset={0.2} darkness={0.85} blendFunction={BlendFunction.NORMAL} />
          </EffectComposer>
        </Canvas>
      </div>

      <Hud
        total={total}
        visible={visible}
        query={query}
        setQuery={setQuery}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        autoRotate={autoRotate}
        setAutoRotate={setAutoRotate}
        loading={events == null && !error}
        error={error}
      />

      {hovered && !selected && <Tooltip placed={hovered.planet} x={hovered.x} y={hovered.y} />}
      {selected && <DetailPanel placed={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

interface HudProps {
  total: number;
  visible: number;
  query: string;
  setQuery: (s: string) => void;
  activeCategory: string;
  setActiveCategory: (s: string) => void;
  autoRotate: boolean;
  setAutoRotate: (b: boolean) => void;
  loading: boolean;
  error: string | null;
}

function Hud({
  total,
  visible,
  query,
  setQuery,
  activeCategory,
  setActiveCategory,
  autoRotate,
  setAutoRotate,
  loading,
  error,
}: HudProps) {
  return (
    <div className="hud">
      <div className="hud-top">
        <div className="brand">
          <div className="title">Polymarket Cosmos</div>
          <div className="subtitle">A galaxy of prediction markets</div>
        </div>
        <div className="search-wrap">
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the cosmos…"
            aria-label="Search markets"
          />
          <span className="badge">{visible}/{total}</span>
        </div>
        <div className="toolbar">
          <button
            className={`tool-btn ${autoRotate ? "active" : ""}`}
            onClick={() => setAutoRotate(!autoRotate)}
            title="Toggle auto rotation"
          >
            {autoRotate ? "Drift on" : "Drift off"}
          </button>
          <a
            className="tool-btn"
            href="https://polymarket.com"
            target="_blank"
            rel="noreferrer"
            title="Open Polymarket"
          >
            Polymarket ↗
          </a>
        </div>
      </div>

      <div className="tag-bar">
        {CATEGORY_FILTERS.map((c) => (
          <button
            key={c.key}
            className={`tag-pill ${activeCategory === c.key ? "active" : ""}`}
            onClick={() => setActiveCategory(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="legend">
        <div style={{ color: "#e8ecff", marginBottom: 6, letterSpacing: "0.18em", textTransform: "uppercase", fontSize: 10 }}>
          Color legend
        </div>
        <div className="row"><span className="swatch" style={{ background: "#ff7d9b", color: "#ff7d9b" }} /> Politics</div>
        <div className="row"><span className="swatch" style={{ background: "#f7a83e", color: "#f7a83e" }} /> Crypto</div>
        <div className="row"><span className="swatch" style={{ background: "#6cf2ff", color: "#6cf2ff" }} /> Sports</div>
        <div className="row"><span className="swatch" style={{ background: "#b388ff", color: "#b388ff" }} /> Geopolitics</div>
        <div className="row"><span className="swatch" style={{ background: "#ff7df0", color: "#ff7df0" }} /> Culture</div>
      </div>

      <div className="counter">
        <span className="num">{visible}</span>
        active markets in view
      </div>

      {loading && (
        <div className="center-msg">
          <div className="panel">Receiving signal from the Polymarket galaxy…</div>
        </div>
      )}
      {error && (
        <div className="center-msg">
          <div className="panel">Lost contact: {error}</div>
        </div>
      )}
    </div>
  );
}

function Tooltip({ placed, x, y }: { placed: PlacedEvent; x: number; y: number }) {
  const top = topOutcome(placed.event);
  const tag = placed.event.tags?.[0]?.label;
  const cat = categoryColor(placed.event);
  return (
    <div className="tooltip" style={{ left: x, top: y }}>
      {tag && <div className="ttag" style={{ color: cat.hex }}>{tag}</div>}
      <div className="ttitle">{placed.event.title}</div>
      <div className="tmeta">
        Vol 24h {formatCurrency(placed.event.volume24hr)}
        {top && (
          <>
            {" · "}
            {top.outcome} {(top.price * 100).toFixed(0)}%
          </>
        )}
      </div>
      <div className="tmeta" style={{ marginTop: 2, opacity: 0.7 }}>Click to focus</div>
    </div>
  );
}

function DetailPanel({ placed, onClose }: { placed: PlacedEvent; onClose: () => void }) {
  const e = placed.event;
  const top = topOutcome(e);
  const cat = categoryColor(e);

  // Show top markets sorted by volume.
  const markets = (e.markets ?? [])
    .map((m) => ({
      m,
      outcomes: parseOutcomes(m),
    }))
    .filter((entry) => entry.outcomes.length > 0)
    .slice(0, 5);

  return (
    <aside className="detail" role="dialog" aria-label={`Event ${e.title}`}>
      <button className="close" onClick={onClose} aria-label="Close details">×</button>
      <div className="image-wrap">
        {e.image ? <img src={e.image} alt="" loading="lazy" /> : null}
        <div className="glow" />
      </div>
      <div className="meta-row" style={{ marginTop: 12 }}>
        <span className="chip" style={{ color: cat.hex, borderColor: `${cat.hex}55` }}>{cat.label}</span>
        {(e.tags ?? []).slice(0, 3).map((t) => (
          <span key={t.slug ?? t.label} className="chip">{t.label}</span>
        ))}
      </div>
      <h2>{e.title}</h2>
      <div style={{ color: "#9aa3d6", fontSize: 12, marginBottom: 8 }}>
        {formatRelativeDate(e.endDate)}
      </div>

      {top && (
        <div
          className="stat"
          style={{
            marginBottom: 10,
            background: `linear-gradient(135deg, ${cat.hex}26, rgba(125,139,255,0.08))`,
            borderColor: `${cat.hex}55`,
          }}
        >
          <div className="label">Top outcome</div>
          <div className="value" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {top.question.length > 60 ? `${top.question.slice(0, 60)}…` : top.question}
            </span>
            <span style={{ color: cat.hex }}>{top.outcome} {(top.price * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}

      <div className="stats">
        <div className="stat">
          <div className="label">Volume (24h)</div>
          <div className="value">{formatCurrency(e.volume24hr)}</div>
        </div>
        <div className="stat">
          <div className="label">Volume (total)</div>
          <div className="value">{formatCurrency(e.volume)}</div>
        </div>
        <div className="stat">
          <div className="label">Liquidity</div>
          <div className="value">{formatCurrency(e.liquidity)}</div>
        </div>
        <div className="stat">
          <div className="label">Open interest</div>
          <div className="value">{formatCurrency(e.openInterest)}</div>
        </div>
      </div>

      {e.description && (
        <div className="desc">
          {e.description.length > 320 ? `${e.description.slice(0, 320)}…` : e.description}
        </div>
      )}

      {markets.length > 0 && (
        <div className="markets">
          {markets.map(({ m, outcomes }) => {
            const top2 = outcomes.reduce((a, b) => (b.price > a.price ? b : a));
            return (
              <div key={m.id ?? m.slug ?? m.question} className="market">
                <div className="q">{m.groupItemTitle ?? m.question}</div>
                <div className="price">
                  {top2.name} {(top2.price * 100).toFixed(0)}%
                </div>
              </div>
            );
          })}
        </div>
      )}

      <a className="cta" href={eventUrl(e)} target="_blank" rel="noreferrer">
        Open on Polymarket ↗
      </a>
    </aside>
  );
}
