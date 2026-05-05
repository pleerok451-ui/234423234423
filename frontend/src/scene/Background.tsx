import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Animated cosmic backdrop:
 *   - thousands of small starfield points
 *   - colorful nebula fog billboards drifting slowly
 *   - a giant central glow blob
 */
export function Starfield({ count = 4000, radius = 90 }: { count?: number; radius?: number }) {
  const points = useRef<THREE.Points>(null!);

  const geom = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const palette = [
      new THREE.Color("#ffffff"),
      new THREE.Color("#9aa6ff"),
      new THREE.Color("#ffd779"),
      new THREE.Color("#ff7df0"),
      new THREE.Color("#6cf2ff"),
    ];
    for (let i = 0; i < count; i++) {
      // Random points on a sphere shell with thickness.
      const r = radius * (0.65 + Math.random() * 0.55);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi) * 0.7;
      const z = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 0] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const c = palette[Math.floor(Math.random() * palette.length)];
      const intensity = 0.45 + Math.random() * 0.55;
      colors[i * 3 + 0] = c.r * intensity;
      colors[i * 3 + 1] = c.g * intensity;
      colors[i * 3 + 2] = c.b * intensity;
      sizes[i] = 0.6 + Math.random() * 1.6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    g.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
    return g;
  }, [count, radius]);

  const material = useMemo(() => {
    return new THREE.PointsMaterial({
      vertexColors: true,
      size: 0.45,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  useFrame((_, dt) => {
    if (points.current) {
      points.current.rotation.y += dt * 0.012;
      points.current.rotation.x += dt * 0.004;
    }
  });

  return <points ref={points} geometry={geom} material={material} />;
}

/** Soft colorful nebula clouds rendered as additive billboards. */
export function NebulaClouds() {
  const group = useRef<THREE.Group>(null!);

  const cloudData = useMemo(() => {
    const colors = ["#5b6cff", "#ff7df0", "#6cf2ff", "#ffd779", "#b388ff", "#ff7d9b"];
    return Array.from({ length: 7 }, (_, i) => ({
      color: colors[i % colors.length],
      position: [
        (Math.random() - 0.5) * 60,
        (Math.random() - 0.5) * 30,
        -20 - Math.random() * 50,
      ] as [number, number, number],
      scale: 25 + Math.random() * 35,
      opacity: 0.18 + Math.random() * 0.18,
      speed: 0.005 + Math.random() * 0.01,
    }));
  }, []);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.getElapsedTime();
    group.current.children.forEach((child, i) => {
      const data = cloudData[i];
      child.position.x += Math.cos(t * data.speed + i) * 0.005;
      child.position.y += Math.sin(t * data.speed * 1.3 + i) * 0.004;
    });
  });

  return (
    <group ref={group}>
      {cloudData.map((c, i) => (
        <mesh key={i} position={c.position}>
          <planeGeometry args={[c.scale, c.scale]} />
          <meshBasicMaterial
            color={c.color}
            transparent
            opacity={c.opacity}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            map={useNebulaTexture()}
          />
        </mesh>
      ))}
    </group>
  );
}

let cachedNebulaTexture: THREE.CanvasTexture | null = null;

function useNebulaTexture(): THREE.CanvasTexture {
  if (cachedNebulaTexture) return cachedNebulaTexture;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.85)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.45)");
  grad.addColorStop(0.55, "rgba(255,255,255,0.18)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cachedNebulaTexture = tex;
  return tex;
}

/** A central galactic core glow that sits beneath the events. */
export function CoreGlow() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    const s = 1 + Math.sin(t * 0.6) * 0.08;
    ref.current.scale.set(s, s, s);
  });
  return (
    <mesh ref={ref} position={[0, 0, 0]}>
      <sphereGeometry args={[1.6, 32, 32]} />
      <meshBasicMaterial color="#fff7e8" transparent opacity={0.85} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}
