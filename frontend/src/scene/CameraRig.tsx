import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

interface CameraRigProps {
  controlsRef: React.RefObject<OrbitControlsImpl>;
  focus: [number, number, number] | null;
  enableAutoRotate: boolean;
}

/**
 * Smoothly animates the OrbitControls target (and the camera distance) toward
 * the currently focused planet. Falls back to a slow auto-rotate of the scene.
 */
export function CameraRig({ controlsRef, focus, enableAutoRotate }: CameraRigProps) {
  const { camera } = useThree();
  const targetVec = useRef(new THREE.Vector3(0, 0, 0));
  const desiredDistance = useRef<number | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.autoRotate = enableAutoRotate && !focus;
    controls.autoRotateSpeed = 0.4;
  }, [enableAutoRotate, focus, controlsRef]);

  useEffect(() => {
    if (focus) {
      targetVec.current.set(focus[0], focus[1], focus[2]);
      desiredDistance.current = 6;
    } else {
      targetVec.current.set(0, 0, 0);
      desiredDistance.current = null;
    }
  }, [focus]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    // Lerp target.
    controls.target.lerp(targetVec.current, 0.08);

    // Lerp camera distance toward desired (when focused).
    if (desiredDistance.current != null) {
      const offset = camera.position.clone().sub(controls.target);
      const currentDist = offset.length();
      const desired = desiredDistance.current;
      const newDist = THREE.MathUtils.lerp(currentDist, desired, 0.06);
      offset.setLength(newDist);
      camera.position.copy(controls.target).add(offset);
    }

    controls.update();
  });

  return null;
}
