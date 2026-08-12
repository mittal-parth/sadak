"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

/**
 * The shop radio.
 *
 * YouTube is the audio source but never the interface: its iframe sits inside
 * the pill at full size with opacity 0 and no pointer events, and our own
 * controls are painted over it. That is the only supported way to get this
 * look — the embed's own chrome cannot be restyled, and stripping audio out of
 * YouTube to play through an <audio> tag is against their terms.
 *
 * The iframe is deliberately NOT display:none or zero-sized; browsers throttle
 * or refuse playback in hidden frames.
 */

type YtPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  nextVideo(): void;
  previousVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoData(): { title?: string; author?: string; video_id?: string };
  destroy(): void;
};

type YtNamespace = {
  Player: new (
    el: HTMLElement,
    opts: Record<string, unknown>,
  ) => YtPlayer;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
};

declare global {
  interface Window {
    YT?: YtNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_SRC = "https://www.youtube.com/iframe_api";

/** Loads the IFrame API once per page and resolves when YT.Player exists. */
let apiPromise: Promise<YtNamespace> | null = null;
function loadYouTubeApi(): Promise<YtNamespace> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YtNamespace>((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prior?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube IFrame API loaded without YT.Player"));
    };
    if (!document.querySelector(`script[src="${API_SRC}"]`)) {
      const tag = document.createElement("script");
      tag.src = API_SRC;
      tag.async = true;
      tag.onerror = () => reject(new Error("Could not load the YouTube IFrame API"));
      document.head.appendChild(tag);
    }
  });
  return apiPromise;
}

function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  tracks: readonly string[];
  /** Fires whenever the queue moves on, so the page can link the right track. */
  onTrackChange?: (videoId: string) => void;
};

export default function BarberMusicPlayer({ tracks, onTrackChange }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YtPlayer | null>(null);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [track, setTrack] = useState({ title: "", author: "", videoId: tracks[0] ?? "" });
  const notifyRef = useRef(onTrackChange);
  notifyRef.current = onTrackChange;
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host || tracks.length === 0) return;

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !hostRef.current) return;
        const [first, ...rest] = tracks;
        const player = new YT.Player(hostRef.current, {
          videoId: first,
          playerVars: {
            // An explicit id queue, because the source playlist will not embed.
            playlist: rest.join(","),
            loop: 1,
            controls: 0,
            disablekb: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              setReady(true);
            },
            onStateChange: (e: { data: number }) => {
              if (cancelled) return;
              setPlaying(e.data === YT.PlayerState.PLAYING);
            },
            onError: () => {
              // A dead video should skip, not strand the player on a blank pill.
              if (!cancelled) playerRef.current?.nextVideo();
            },
          },
        });
        playerRef.current = player;
      })
      .catch((err) => {
        console.error("[barber] music player failed to start:", err);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [tracks]);

  /* Poll for position and track metadata. The API has no timeupdate event. */
  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      const p = playerRef.current;
      if (!p) return;
      setPosition(p.getCurrentTime());
      setDuration(p.getDuration());
      const data = p.getVideoData();
      setTrack((prev) => {
        if (data.video_id && data.video_id !== prev.videoId) {
          notifyRef.current?.(data.video_id);
          return { title: data.title ?? "", author: data.author ?? "", videoId: data.video_id };
        }
        if (prev.title) return prev;
        return { title: data.title ?? "", author: data.author ?? "", videoId: prev.videoId };
      });
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [ready]);

  const toggle = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo();
    else p.playVideo();
  }, [playing]);

  const seek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const p = playerRef.current;
      if (!p || !duration) return;
      const box = e.currentTarget.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
      p.seekTo(ratio * duration, true);
      setPosition(ratio * duration);
    },
    [duration],
  );

  if (failed) {
    return (
      <div className="rounded-full border border-white/15 bg-black/50 px-5 py-3 text-sm text-white/60 backdrop-blur-xl">
        Music unavailable right now.
      </div>
    );
  }

  const progress = duration > 0 ? (position / duration) * 100 : 0;
  const thumb = track.videoId
    ? `https://img.youtube.com/vi/${track.videoId}/mqdefault.jpg`
    : null;

  return (
    <div
      className="relative w-full max-w-2xl overflow-hidden rounded-full border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl"
      style={{ background: "rgba(38, 24, 21, 0.62)" }}
    >
      {/* Audio source. Present and full-size so playback is never throttled,
          invisible and inert so our controls are the only interface. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0"
        style={{ zIndex: 0 }}
      >
        <div ref={hostRef} className="h-full w-full" />
      </div>

      <div className="relative z-10 flex items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
        <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-white/10 sm:size-12">
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element -- YouTube
            // thumbnail host, not a local asset next/image can optimise.
            <img src={thumb} alt="" aria-hidden className="h-full w-full object-cover" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-white/95">
            {track.title || (ready ? " " : "Loading…")}
          </p>
          <p className="truncate text-xs text-white/55">{track.author}</p>

          <div
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(position)}
            onClick={seek}
            className="group mt-1.5 cursor-pointer py-1.5"
          >
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white/80 transition-[width] duration-500 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <p className="text-[0.6875rem] text-white/45 tabular-nums">
            {clock(position)} / {clock(duration)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => playerRef.current?.previousVideo()}
            disabled={!ready}
            aria-label="Previous track"
            className="grid size-9 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <SkipBack className="size-4" aria-hidden />
          </button>

          <button
            type="button"
            onClick={toggle}
            disabled={!ready}
            aria-label={playing ? "Pause" : "Play"}
            className="grid size-11 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105 disabled:opacity-40"
          >
            {playing ? (
              <Pause className="size-5" aria-hidden />
            ) : (
              <Play className="size-5 translate-x-px" aria-hidden />
            )}
          </button>

          <button
            type="button"
            onClick={() => playerRef.current?.nextVideo()}
            disabled={!ready}
            aria-label="Next track"
            className="grid size-9 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <SkipForward className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
