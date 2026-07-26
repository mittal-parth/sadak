"use client";

import { useState } from "react";
import { DISTRICTS, type District } from "@/lib/game/districts";
import { tasksForDistrict } from "@/lib/game/tasks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function skyWash(d: District) {
  return `linear-gradient(160deg, ${d.theme.sky.join(", ")})`;
}

export default function Title({ onEnter }: { onEnter: (d: District) => void }) {
  const [picked, setPicked] = useState<District>(DISTRICTS[0]);

  return (
    <main className="relative min-h-full max-h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center px-6 py-10 lg:px-8">
        <div className="mb-10 flex flex-wrap items-baseline justify-between gap-3">
          <span className="flex items-baseline gap-2">
            <span className="font-indic text-lg font-heading" lang="hi">
              सड़क
            </span>
            <span className="text-lg font-heading tracking-tight">sadak</span>
          </span>
          <span className="text-xs text-foreground/70">Real errands in four Indian languages</span>
        </div>

        <header className="text-center">
          <p className="text-xs font-base uppercase tracking-widest text-main">
            Sarvam Epoch Buildathon
          </p>

          <h1 className="mx-auto mt-6 max-w-[16ch] text-4xl font-heading leading-tight tracking-tight sm:text-5xl">
            Sadak Errands
          </h1>

          <p className="mx-auto mt-4 max-w-[44ch] text-lg leading-relaxed text-foreground/80">
            Walk the city. Stop an auto, buy at a stall, visit a temple, catch a bus.
            <br />
            Each errand is a real transaction — in Hindi, Tamil, Kannada, or Bengali.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button size="lg" onClick={() => onEnter(picked)}>
              Enter {picked.name}
            </Button>
            <span className="text-sm text-foreground/70">
              {tasksForDistrict(picked.id).length} errands in {picked.languageLabel}
            </span>
          </div>
        </header>

        <section className="mt-16 text-center" aria-label="Choose a district">
          <h2 className="text-xs font-base uppercase tracking-widest text-foreground/70">
            Choose your district
          </h2>

          <div
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            role="radiogroup"
            aria-label="District"
          >
            {DISTRICTS.map((d) => {
              const on = d.id === picked.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className="cursor-pointer border-0 bg-transparent p-0 text-left"
                  onClick={() => setPicked(d)}
                >
                  <Card
                    className={cn(
                      "relative min-h-40 gap-2 overflow-hidden py-4 transition-all hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none",
                      on && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                    )}
                  >
                    <span
                      className="absolute inset-0 opacity-90"
                      style={{ background: skyWash(d) }}
                      aria-hidden
                    />
                    <span
                      className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent"
                      aria-hidden
                    />
                    <CardContent className="relative z-10 flex flex-col gap-1 px-4">
                      <span className="font-indic text-xl font-heading text-white" lang={d.language.slice(0, 2)}>
                        {d.native}
                      </span>
                      <span className="grid gap-0.5">
                        <strong className="font-heading text-base text-white">{d.name}</strong>
                        <em className="text-xs not-italic uppercase tracking-widest text-white/85">
                          {d.city}
                        </em>
                      </span>
                    </CardContent>
                  </Card>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-10" aria-live="polite">
          <Card className="gap-4 py-6">
            <CardContent className="grid gap-6 px-6 md:grid-cols-[1.55fr_1fr]">
              <div className="grid gap-3 md:col-span-2">
                <h3 className="text-xs font-base uppercase tracking-widest text-foreground/70">
                  What you will do in {picked.name}
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-foreground/80">
                Hail an auto, order local food, buy something at a temple stall, and get a bus or
                tram ticket — all in {picked.languageLabel}.
              </p>
              <ul className="grid gap-2">
                {picked.phrases.slice(0, 3).map((p) => (
                  <li key={p.native}>
                    <Badge variant="neutral" className="h-auto w-full justify-start gap-2 py-2 text-left">
                      <span className="font-indic text-sm" lang={picked.language.slice(0, 2)}>
                        {p.native}
                      </span>
                      <em className="text-xs not-italic text-foreground/70">{p.en}</em>
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        <footer className="sticky bottom-0 z-10 mt-auto flex flex-wrap items-center justify-between gap-4 border-t-2 border-border bg-background py-4">
          <ul className="flex flex-wrap gap-4 text-xs text-foreground/70">
            <li className="flex items-center gap-1">
              <kbd>W</kbd>
              <kbd>A</kbd>
              <kbd>S</kbd>
              <kbd>D</kbd> move
            </li>
            <li className="flex items-center gap-1">
              <kbd>←</kbd>
              <kbd>→</kbd> look
            </li>
            <li className="flex items-center gap-1">
              <kbd>E</kbd> talk
            </li>
            <li className="flex items-center gap-1">
              <kbd>Space</kbd> hold to speak
            </li>
            <li className="flex items-center gap-1">
              <kbd>P</kbd> phrasebook
            </li>
          </ul>
          <p className="text-xs text-foreground/70">
            Speech, voice and dialogue by <strong className="font-base text-foreground">Sarvam AI</strong>
          </p>
        </footer>
      </div>
    </main>
  );
}
