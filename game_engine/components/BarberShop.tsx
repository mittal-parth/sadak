"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { LangCode } from "@/lib/sarvam";
import { barberEmbedUrl, barberPlaylistFor } from "@/lib/game/barber";
import {
  addBarberInteriorLights,
  makeBarberInterior,
} from "@/lib/game/assets/barber";
import { Button } from "@/components/ui/button";

type Props = {
  language: LangCode;
  onClose: () => void;
};

export default function BarberShop({ language, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playlistId = barberPlaylistFor(language);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x1a1410);

    const scene = new THREE.Scene();
    scene.add(makeBarberInterior());
    const lights = addBarberInteriorLights(scene);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 30);
    camera.position.set(2.8, 2.2, 3.2);
    camera.lookAt(0, 1.0, 0);

    let raf = 0;
    const clock = new THREE.Clock();

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      camera.position.x = 2.8 + Math.sin(t * 0.12) * 0.15;
      camera.position.z = 3.2 + Math.cos(t * 0.1) * 0.12;
      camera.lookAt(0, 1.0 + Math.sin(t * 0.08) * 0.03, 0);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      lights.forEach((l) => l.dispose());
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-black/90">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-end gap-4 p-4 pb-8 sm:p-8">
        <div className="pointer-events-auto w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-black/80 shadow-shadow backdrop-blur-sm">
          <iframe
            title="Barber shop music"
            src={barberEmbedUrl(playlistId)}
            className="aspect-video w-full"
            allow="autoplay; encrypted-media"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>

        <Button variant="neutral" className="pointer-events-auto" onClick={onClose}>
          Leave shop
        </Button>
      </div>
    </div>
  );
}
