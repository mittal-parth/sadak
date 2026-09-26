"use client";

import { useEffect, useState } from "react";
import type { LangCode } from "@/lib/sarvam";
import {
  barberCutsceneCandidates,
  barberSignFor,
  barberTrackUrl,
  barberTracks,
} from "@/lib/game/barber";
import BarberMusicPlayer from "./BarberMusicPlayer";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, X } from "lucide-react";

type Props = {
  districtId: string;
  language: LangCode;
  /** Stand-in backdrop until district cutscene art is dropped in. */
  coverImage: string;
  onClose: () => void;
};

/** Wall-clock in the corner, in the player's own locale — "12:38 am". */
function useClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Tick on the minute boundary rather than every second, so the label never
    // sits a minute stale but nothing re-renders 60 times a minute either.
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const ms = 60_000 - (Date.now() % 60_000);
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, ms + 50);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return now
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .toLowerCase();
}

/**
 * Post-haircut cutscene: a full-bleed still with the shop's music playing over
 * it. Deliberately not a 3D scene — the haircut itself happens in dialogue at
 * the door, and this is the beat afterwards.
 */
type Backdrop = { status: "loading" } | { status: "ready"; src: string } | { status: "failed" };

export default function BarberShop({ districtId, language, coverImage, onClose }: Props) {
  const sign = barberSignFor(language);
  const tracks = barberTracks(language);
  const [nowPlaying, setNowPlaying] = useState(tracks[0] ?? "");
  const clock = useClock();
  const [backdrop, setBackdrop] = useState<Backdrop>({ status: "loading" });

  /**
   * Resolve the backdrop before painting it: the district's own cutscene art if
   * it has been dropped in, otherwise its cover. Decoding each candidate up
   * front is what stops a missing file showing as a black screen — an <img>
   * pointed at a 404 under /public gets Next's HTML error page, which does not
   * always trip onError.
   */
  useEffect(() => {
    let cancelled = false;
    const candidates = barberCutsceneCandidates(districtId, coverImage);

    (async () => {
      for (const url of candidates) {
        const ok = await new Promise<boolean>((resolve) => {
          const probe = new Image();
          probe.onload = () => resolve(probe.naturalWidth > 0);
          probe.onerror = () => resolve(false);
          probe.src = url;
        });
        if (cancelled) return;
        if (ok) {
          setBackdrop({ status: "ready", src: url });
          return;
        }
      }
      if (!cancelled) {
        console.error(
          `[barber] no cutscene backdrop loaded for "${districtId}". Tried: ${
            candidates.join(", ") || "(no candidates — coverImage was empty)"
          }`,
        );
        setBackdrop({ status: "failed" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [districtId, coverImage]);

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
    <div className="absolute inset-0 z-50 bg-[#0d0a09]">
      {/* The image is already decoded by the time it mounts, so it renders at
          full opacity. Nothing here may gate visibility on an animation or a
          load callback — that is exactly what turned this into a black screen
          twice. The fade is a plain keyframe layered on top of a visible
          element, so if the animation never runs the still is still there. */}
      {backdrop.status === "ready" && (
        // eslint-disable-next-line @next/next/no-img-element -- the source is
        // resolved by hand above, so next/image's loader buys nothing here.
        <img
          src={backdrop.src}
          alt=""
          aria-hidden
          className="barber-cut-fade absolute inset-0 h-full w-full object-cover"
        />
      )}

      {backdrop.status === "loading" && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
        </div>
      )}

      {/* No art resolved. Say so on screen rather than showing an empty void the
          player cannot tell apart from a crash. */}
      {backdrop.status === "failed" && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-[#2b1b16] to-[#0d0a09] px-6 text-center">
          <p className="max-w-sm text-sm text-white/60">
            Cutscene art is missing for this district. Drop a still into
            <code className="mx-1 rounded bg-white/10 px-1.5 py-0.5 text-white/80">
              public/cutscenes/barber/{districtId}.png
            </code>
          </p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />

      {/* Shop name, painted over the art the way it is lettered on the wall.
          Scale carries the hierarchy here — this is the only thing at this size
          on screen, so it does not need to shout in weight as well. */}
      <div className="pointer-events-none absolute inset-x-0 top-[14%] z-10 flex justify-center px-8">
        <h2
          lang={language}
          className="font-indic max-w-[14ch] text-center text-4xl leading-[1.15] tracking-tight text-white/95 [text-shadow:0_2px_24px_rgba(0,0,0,0.55)] sm:text-5xl md:text-6xl"
        >
          {sign.native}
        </h2>
      </div>

      <span className="pointer-events-none absolute top-4 left-5 z-20 text-sm text-white/70 tabular-nums [text-shadow:0_1px_8px_rgba(0,0,0,0.7)]">
        {clock}
      </span>

      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <a
          href={barberTrackUrl(nowPlaying)}
          target="_blank"
          rel="noreferrer noopener"
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-3 py-2 text-sm text-white/80 backdrop-blur-md transition-colors hover:bg-black/60 hover:text-white"
        >
          YouTube
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>

        <Button
          variant="neutral"
          size="icon"
          className="pointer-events-auto size-10 rounded-full border-white/20 bg-black/40 text-white backdrop-blur-md"
          onClick={onClose}
          aria-label="Leave barber shop"
        >
          <X className="size-5" aria-hidden />
        </Button>
      </div>

      {/* Glass pill: our own transport controls over a hidden YouTube frame. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4 pb-6 sm:p-6 sm:pb-8">
        <div className="pointer-events-auto flex w-full max-w-2xl justify-center">
          <BarberMusicPlayer tracks={tracks} onTrackChange={setNowPlaying} />
        </div>
      </div>

    </div>
  );
}
