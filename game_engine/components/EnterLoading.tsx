"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useMobilePlay } from "@/lib/useMobilePlay";

type Control = { keys: React.ReactNode; label: string };

/**
 * The pause between picking a city and standing in it. It is held open for a
 * minimum dwell (see ENTER_DWELL_MS in Game.tsx) rather than flashing past,
 * because this is the one moment the player is not doing anything else and can
 * actually read how to move.
 */
export default function EnterLoading({ city }: { city?: string }) {
  const { mobilePlay } = useMobilePlay();

  const controls: Control[] = mobilePlay
    ? [
        { keys: <Glyph>◑</Glyph>, label: "Left stick to walk" },
        { keys: <Glyph>↔</Glyph>, label: "Drag the street to look around" },
        { keys: <Glyph>☝</Glyph>, label: "Tap a vendor to start talking" },
        { keys: <Glyph>🎙</Glyph>, label: "Hold the mic button to speak" },
      ]
    : [
        {
          keys: (
            <>
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd>
            </>
          ),
          label: "Walk the street",
        },
        {
          keys: (
            <>
              <kbd>←</kbd>
              <kbd>→</kbd>
            </>
          ),
          label: "Look around",
        },
        { keys: <kbd>E</kbd>, label: "Talk to whoever you are facing" },
        { keys: <kbd>Space</kbd>, label: "Hold to speak out loud" },
        { keys: <kbd>P</kbd>, label: "Open the phrasebook" },
      ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-3 sm:p-4">
      {/* Landscape phones are the play orientation and are only ~390px tall,
          so the card stays compact and scrolls rather than overflowing. */}
      <Card className="max-h-full w-full max-w-lg gap-4 overflow-y-auto py-5">
        <CardContent className="grid gap-4">
          <div className="grid gap-0.5">
            <p className="text-xs font-heading uppercase tracking-widest text-foreground/60">
              Entering
            </p>
            <h2 className="text-2xl font-heading leading-tight tracking-tight sm:text-3xl">
              {city ?? "the street"}
            </h2>
          </div>

          <div className="grid gap-2.5 rounded-base border-2 border-border bg-secondary-background p-3 sm:p-4">
            <h3 className="text-xs font-heading uppercase tracking-widest text-foreground/60">
              How to move
            </h3>
            <ul className="grid gap-2">
              {controls.map((c) => (
                <li key={c.label} className="flex items-center gap-3">
                  <span className="flex shrink-0 items-center gap-1">{c.keys}</span>
                  <span className="text-sm text-foreground/80">{c.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Indeterminate bar — the theme's hard border with a moving fill. */}
          <div className="grid gap-2">
            <div className="h-3 overflow-hidden rounded-base border-2 border-border bg-secondary-background">
              <div className="h-full w-1/3 animate-[enter-sweep_1.4s_ease-in-out_infinite] bg-main" />
            </div>
            <p className="text-xs text-foreground/60">Loading the street…</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className="inline-flex size-7 items-center justify-center rounded-base border-2 border-border bg-main text-sm text-main-foreground shadow-shadow"
    >
      {children}
    </span>
  );
}
