"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { DISTRICTS } from "@/lib/game/districts";
import { DISTRICT_COVER_IMAGES } from "@/lib/game/district-covers";
import { cn } from "@/lib/utils";

const INTERVAL_MS = 4000;

/**
 * Slow crossfade carousel over the same four district covers used on the
 * Title screen (`lib/game/district-covers.ts`) — no new marketing stills to
 * source or license, and it doubles as a preview of what's actually in the
 * game rather than a generic hero image.
 */
export function LoginShowcase({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (DISTRICTS.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % DISTRICTS.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={cn("relative overflow-hidden bg-black", className)} aria-hidden>
      {DISTRICTS.map((d, i) => (
        <div
          key={d.id}
          className={cn(
            "absolute inset-0 transition-opacity duration-1000 ease-in-out",
            i === index ? "opacity-100" : "opacity-0"
          )}
        >
          <Image
            src={DISTRICT_COVER_IMAGES[d.id]}
            alt=""
            fill
            priority={i === 0}
            sizes="(max-width: 1024px) 100vw, 55vw"
            className="object-cover object-center"
          />
          <span
            className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-black/10"
            aria-hidden
          />
          <div className="absolute bottom-6 left-6 flex flex-col gap-0.5">
            <span className="font-indic text-2xl font-heading text-white" lang={d.language.slice(0, 2)}>
              {d.native}
            </span>
            <strong className="font-heading text-lg text-white">{d.name}</strong>
            <em className="text-xs not-italic uppercase tracking-widest text-white/85">
              {d.city}
            </em>
          </div>
        </div>
      ))}

      {/* Warm edge fade into the form column, matching the app's neobrutalist border. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-linear-to-r from-background/60 to-transparent lg:w-24" />
    </div>
  );
}
