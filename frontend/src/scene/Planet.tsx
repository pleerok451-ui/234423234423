import { useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { PlacedEvent } from "../layout";

interface PlanetProps {
  placed: PlacedEvent;
  selected: boolean;
  dimmed: boolean;
  onPointerEnter: (planet: PlacedEvent, screen: { x: number; y: number }) => void;
  onPointerLeave: () => void;
  onPointerMove: (screen: { x: number; y: number }) => void;
  onClick: (planet: PlacedEvent) => void;
}

/** Planet-like prediction-event marker with image texture, halo, and orbit ring. */
export function Planet({
  placed,
  selected,
  dimmed,
  onPointerEnter,
  onPointerLeave,
  onPointerMove,
  onClick,
}: PlanetProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const haloRef = useRef<THREE.Mesh>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  const texture = useEventTexture(placed.event.image, placed.color);

  const haloMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(placed.color),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, [placed.color]);

  const ringMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(placed.color),
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
  }, [placed.color]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const planet = meshRef.current;
    const halo = haloRef.current;
    const ring = ringRef.current;
    if (!planet) return;

    // Self spin and gentle bob.
    planet.rotation.y += 0.004 * placed.spin;
    planet.position.y = placed.position[1] + Math.sin(t * 0.6 + placed.phase) * 0.04;

    // Halo pulse.
    const pulse = 0.92 + Math.sin(t * 1.2 + placed.phase) * 0.08 * placed.pulse;
    if (halo) {
      const haloScale = (selected ? 2.6 : hovered ? 2.1 : 1.7) * pulse;
      halo.scale.setScalar(haloScale);
      const opacityBase = selected ? 0.85 : hovered ? 0.7 : 0.45;
      (halo.material as THREE.MeshBasicMaterial).opacity = (dimmed ? opacityBase * 0.25 : opacityBase) * (0.7 + Math.sin(t * 1.5 + placed.phase) * 0.3);
    }

    // Ring slow rotation.
    if (ring) {
      ring.rotation.z += 0.002;
      (ring.material as THREE.MeshBasicMaterial).opacity = dimmed ? 0.08 : selected || hovered ? 0.55 : 0.3;
    }

    // Dim non-selected planets when something is selected.
    if (planet.material instanceof THREE.MeshStandardMaterial) {
      const mat = planet.material;
      const targetEmissive = dimmed ? 0.05 : selected ? 0.9 : hovered ? 0.55 : 0.25;
      mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * 0.1;
      const targetOpacity = dimmed ? 0.45 : 1;
      mat.opacity += (targetOpacity - mat.opacity) * 0.1;
    }
  });

  return (
    <group position={placed.position}>
      {/* Halo */}
      <mesh ref={haloRef} material={haloMaterial}>
        <sphereGeometry args={[placed.radius, 24, 24]} />
      </mesh>
      {/* Optional orbital ring for high-volume / featured planets */}
      {placed.ring && (
        <mesh ref={ringRef} rotation={[Math.PI / 2.4, 0, placed.phase]} material={ringMaterial}>
          <ringGeometry args={[placed.radius * 1.7, placed.radius * 2.0, 64]} />
        </mesh>
      )}
      {/* Planet itself */}
      <mesh
        ref={meshRef}
        onPointerEnter={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
          onPointerEnter(placed, { x: e.clientX, y: e.clientY });
        }}
        onPointerMove={(e) => onPointerMove({ x: e.clientX, y: e.clientY })}
        onPointerLeave={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = "auto";
          onPointerLeave();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick(placed);
        }}
      >
        <sphereGeometry args={[placed.radius, 32, 32]} />
        <meshStandardMaterial
          color={"#ffffff"}
          map={texture ?? null}
          emissive={new THREE.Color(placed.color)}
          emissiveMap={texture ?? null}
          emissiveIntensity={0.25}
          roughness={0.55}
          metalness={0.05}
          transparent
        />
      </mesh>
    </group>
  );
}

/** Cache of CanvasTextures keyed by image URL so we don't fetch each time. */
const textureCache = new Map<string, THREE.CanvasTexture>();
const inFlight = new Map<string, Promise<THREE.CanvasTexture>>();

function useEventTexture(imageUrl: string | null, fallbackColor: string): THREE.CanvasTexture | null {
  const [tex, setTex] = useState<THREE.CanvasTexture | null>(() => {
    if (!imageUrl) return makeFallbackTexture(fallbackColor);
    return textureCache.get(imageUrl) ?? null;
  });
  const requested = useRef(false);

  if (imageUrl && !tex && !requested.current) {
    requested.current = true;
    loadEventTexture(imageUrl, fallbackColor)
      .then((t) => setTex(t))
      .catch(() => setTex(makeFallbackTexture(fallbackColor)));
  }

  return tex;
}

async function loadEventTexture(url: string, fallback: string): Promise<THREE.CanvasTexture> {
  const cached = textureCache.get(url);
  if (cached) return cached;
  const existing = inFlight.get(url);
  if (existing) return existing;

  const promise = new Promise<THREE.CanvasTexture>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    img.onload = () => {
      const tex = makeTextureFromImage(img, fallback);
      textureCache.set(url, tex);
      inFlight.delete(url);
      resolve(tex);
    };
    img.onerror = () => {
      const tex = makeFallbackTexture(fallback);
      textureCache.set(url, tex);
      inFlight.delete(url);
      resolve(tex);
    };
    img.src = url;
  });
  inFlight.set(url, promise);
  return promise;
}

function makeTextureFromImage(img: HTMLImageElement, accent: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  // Fill with accent gradient as a backdrop.
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, accent);
  grad.addColorStop(1, "#0b1230");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Draw the image centered, cropped to a circle for a nicer "planet" look.
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  // Cover-fit the source image.
  const ar = img.width / img.height;
  let dw = size;
  let dh = size;
  if (ar > 1) {
    dw = size * ar;
  } else {
    dh = size / ar;
  }
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  ctx.restore();

  // Soft inner shadow / vignette for depth.
  const vignette = ctx.createRadialGradient(size / 2, size / 2, size / 2 - 30, size / 2, size / 2, size / 2);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeFallbackTexture(accent: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, accent);
  grad.addColorStop(1, "#0a0f2a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
