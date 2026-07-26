"use client";

import { useCallback, useRef } from "react";
import { cn } from "@/lib/utils";

const RADIUS = 40;
const KNOB = 18;
const DEAD = 0.12;

type Props = {
  className?: string;
  onMove: (fwd: number, strafe: number) => void;
  disabled?: boolean;
};

export default function VirtualJoystick({ className, onMove, disabled }: Props) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const touchId = useRef<number | null>(null);
  const knobRef = useRef({ x: 0, y: 0 });

  const emit = useCallback(
    (x: number, y: number) => {
      let nx = x / RADIUS;
      let ny = y / RADIUS;
      const len = Math.hypot(nx, ny);
      if (len > 1) {
        nx /= len;
        ny /= len;
      }
      if (len < DEAD) {
        onMove(0, 0);
        return;
      }
      // Screen Y is down; game forward is +Z in world space via engine mapping.
      onMove(-ny, nx);
    },
    [onMove]
  );

  const reset = useCallback(() => {
    touchId.current = null;
    knobRef.current = { x: 0, y: 0 };
    const knob = baseRef.current?.querySelector("[data-joystick-knob]") as HTMLElement | null;
    if (knob) {
      knob.style.transform = "translate(-50%, -50%)";
    }
    onMove(0, 0);
  }, [onMove]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    touchId.current = e.pointerId;
    baseRef.current?.setPointerCapture(e.pointerId);
    moveKnob(e.clientX, e.clientY);
  };

  const moveKnob = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let x = clientX - cx;
    let y = clientY - cy;
    const len = Math.hypot(x, y);
    if (len > RADIUS) {
      x = (x / len) * RADIUS;
      y = (y / len) * RADIUS;
    }
    knobRef.current = { x, y };
    const knob = el.querySelector("[data-joystick-knob]") as HTMLElement | null;
    if (knob) {
      knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    }
    emit(x, y);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (disabled || touchId.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    moveKnob(e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (touchId.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    baseRef.current?.releasePointerCapture(e.pointerId);
    reset();
  };

  return (
    <div
      className={cn(
        "pointer-events-auto touch-none select-none",
        disabled && "opacity-40",
        className
      )}
      aria-hidden={disabled}
    >
      <div
        ref={baseRef}
        className="relative rounded-full border-2 border-border/80 bg-background/55 shadow-shadow backdrop-blur-sm"
        style={{ width: RADIUS * 2, height: RADIUS * 2 }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={reset}
      >
        <div
          data-joystick-knob
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-border bg-main shadow-shadow"
          style={{ width: KNOB * 2, height: KNOB * 2 }}
        />
      </div>
    </div>
  );
}
