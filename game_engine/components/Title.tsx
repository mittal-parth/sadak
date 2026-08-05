"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BarChart2 } from "lucide-react";
import type { District } from "@/lib/game/districts";
import { DISTRICT_COVER_IMAGES } from "@/lib/game/district-covers";
import type { ComfortLevel } from "@/lib/game/levels";
import {
  BASE_LANG_OPTIONS,
  readStoredBaseLang,
  writeStoredBaseLang,
  type BaseLangCode,
} from "@/lib/i18n/base-lang";
import { gloss } from "@/lib/i18n/gloss";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getAudioContext } from "@/lib/audio/engine";
import { playSfx } from "@/lib/audio/sfx";
import SignOutButton from "@/components/auth/SignOutButton";

type DistrictSummary = {
  id: string;
  name: string;
  city: string;
  blurb: string;
  language: string;
  languageLabel: string;
  native: string;
  coverImage: string;
  taskCount: number;
};

const COMFORT_OPTIONS: {
  value: ComfortLevel;
  title: string;
  description: string;
}[] = [
  { value: "easy", title: "Easy", description: "I'm new to this language" },
  { value: "medium", title: "Medium", description: "I know some phrases" },
  { value: "hard", title: "Hard", description: "I can hold a basic conversation" },
];

/** Numbered stamp + title. The number is what makes the two choices read as a
 *  sequence instead of two sibling sections of equal weight. */
function Step({
  n,
  title,
  hint,
}: {
  n: number;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-base border-2 border-border bg-main text-sm font-heading text-main-foreground shadow-shadow">
        {n}
      </span>
      <h2 className="text-xl font-heading tracking-tight">{title}</h2>
      {hint && <p className="text-sm text-foreground/70">{hint}</p>}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full max-h-full items-center justify-center overflow-y-auto bg-background px-4 text-foreground">
      <Card className="max-w-md py-6 text-center">
        <CardContent className="grid gap-2 px-6">{children}</CardContent>
      </Card>
    </main>
  );
}

export default function Title({
  onEnter,
  defaultDistrictId,
}: {
  onEnter: (
    districtId: string,
    comfort: ComfortLevel,
    cityLabel: string | undefined,
    baseLang: BaseLangCode,
  ) => void;
  defaultDistrictId?: string;
}) {
  const [summaries, setSummaries] = useState<DistrictSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [pickedId, setPickedId] = useState<string | undefined>(defaultDistrictId);
  const [picked, setPicked] = useState<District | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [comfort, setComfort] = useState<ComfortLevel>("medium");
  const [baseLang, setBaseLang] = useState<BaseLangCode>("en-IN");

  useEffect(() => {
    setBaseLang(readStoredBaseLang());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setListLoading(true);
      setListError(null);
      try {
        const res = await fetch("/api/districts");
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Could not load districts.");
        }
        const data = (await res.json()) as { districts: DistrictSummary[] };
        if (cancelled) return;
        setSummaries(data.districts);
        setPickedId((prev) => {
          if (prev && data.districts.some((d) => d.id === prev)) return prev;
          return data.districts[0]?.id;
        });
      } catch (err) {
        if (!cancelled) {
          setListError(err instanceof Error ? err.message : "Could not load districts.");
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pickedId) {
      setPicked(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailError(null);
      try {
        const res = await fetch(`/api/districts/${encodeURIComponent(pickedId)}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Could not load district.");
        }
        const data = (await res.json()) as { district: District };
        if (!cancelled) setPicked(data.district);
      } catch (err) {
        if (!cancelled) {
          setPicked(null);
          setDetailError(err instanceof Error ? err.message : "Could not load district.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pickedId]);

  const pickedSummary = summaries.find((d) => d.id === pickedId);
  const pickedComfort = COMFORT_OPTIONS.find((o) => o.value === comfort)!;
  const ready = Boolean(pickedId && picked && !detailError);

  const enter = useCallback(() => {
    if (!pickedId) return;
    getAudioContext();
    writeStoredBaseLang(baseLang);
    onEnter(pickedId, comfort, pickedSummary?.city, baseLang);
  }, [baseLang, comfort, onEnter, pickedId, pickedSummary?.city]);

  if (listLoading) {
    return (
      <Shell>
        <p className="font-heading">Loading cities…</p>
      </Shell>
    );
  }

  if (listError || summaries.length === 0) {
    return (
      <Shell>
        <p className="font-heading">{listError ?? "No cities are available yet."}</p>
        <p className="text-sm text-foreground/70">
          If you are setting up locally, run the Supabase migrations{" "}
          <code className="font-heading text-foreground">001</code>,{" "}
          <code className="font-heading text-foreground">002</code>, and{" "}
          <code className="font-heading text-foreground">007</code> in the SQL editor.
        </p>
      </Shell>
    );
  }

  const enterLabel = `Enter ${pickedSummary?.city ?? "city"}`;

  return (
    <main className="relative min-h-full max-h-full overflow-y-auto bg-background text-foreground">
      {/* Chrome — brand and account only. Nothing here competes with the hero. */}
      <div className="sticky top-0 z-30 border-b-2 border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
          {/* Wordmark only — the logo itself anchors the hero below. */}
          <span className="flex items-baseline gap-2">
            <span className="font-indic text-lg font-heading" lang="hi">
              सड़क
            </span>
            <span className="text-lg font-heading tracking-tight">sadak</span>
          </span>
          <div className="flex items-center gap-3">
            <Link
              href="/leaderboard"
              className="inline-flex items-center gap-1 rounded-base px-1.5 py-0.5 text-xs font-heading text-foreground/75 transition-colors hover:bg-secondary-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <BarChart2 className="size-3 shrink-0" strokeWidth={2} aria-hidden />
              Leaderboard
            </Link>
            <SignOutButton tone="subtle" />
          </div>
        </div>
      </div>

      {/* Level 1 — one loud yellow band. The only element at this weight. */}
      <header className="border-b-2 border-border bg-main text-main-foreground">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-8 sm:px-6 sm:py-10 sm:flex-row sm:items-start sm:gap-7 lg:px-8">
          <Image
            src="/icon.png"
            alt="Sadak"
            width={112}
            height={112}
            className="size-20 shrink-0 rounded-base border-2 border-border bg-secondary-background shadow-shadow sm:size-28"
            priority
          />
          <div className="min-w-0">
            <h1 className="max-w-[14ch] text-4xl font-heading leading-[0.95] tracking-tight sm:text-5xl lg:text-6xl">
              Sadak Errands
            </h1>
            <p className="mt-4 max-w-[52ch] text-base leading-relaxed sm:text-lg">
              Walk the city and finish a real errand out loud — stop an auto, buy at a
              stall, catch a bus.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              <li>
                <Badge variant="neutral">{summaries.length} cities</Badge>
              </li>
              <li>
                <Badge variant="neutral">10 Indian languages</Badge>
              </li>
              <li>
                <Badge variant="neutral">Voice by Sarvam AI</Badge>
              </li>
            </ul>
          </div>
        </div>
      </header>

      {/* Bottom padding leaves room for the fixed phone action bar. */}
      <div className="mx-auto max-w-6xl px-4 pb-28 pt-8 sm:px-6 sm:pt-10 lg:px-8 lg:pb-10">
        {/* Level 2 — the choices carry the page; the brief rides alongside. */}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8">
          <div>
            <section aria-label="Choose a city">
              <Step n={1} title="Choose your city" hint="Each one speaks its own language." />
              <div
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
                role="radiogroup"
                aria-label="City"
              >
                {summaries.map((d) => {
                  const on = d.id === pickedId;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className="cursor-pointer rounded-base border-0 bg-transparent p-0 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      onClick={() => {
                        playSfx("tap");
                        setPickedId(d.id);
                      }}
                    >
                      <Card
                        className={cn(
                          "relative aspect-[4/3] justify-end gap-2 overflow-hidden py-4 transition-all",
                          // Unselected: sits flat, colour pulled back so the
                          // picked card is the only one at full strength.
                          "saturate-[0.85] hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:saturate-100 hover:shadow-none",
                          // Selected: lifted off the page with a deeper hard
                          // shadow and an inset accent frame — the brutalist
                          // way to say "this one", instead of a soft ring.
                          on &&
                            "-translate-x-boxShadowX -translate-y-boxShadowY saturate-100 shadow-[8px_8px_0px_0px_var(--border)] outline-4 -outline-offset-4 outline-main hover:-translate-x-boxShadowX hover:-translate-y-boxShadowY hover:shadow-[8px_8px_0px_0px_var(--border)]",
                        )}
                      >
                        <Image
                          src={DISTRICT_COVER_IMAGES[d.id]}
                          alt=""
                          fill
                          className="object-cover object-center"
                          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 22vw"
                          priority
                        />
                        <span
                          className="absolute inset-0 bg-linear-to-t from-black/80 via-black/35 to-black/5"
                          aria-hidden
                        />
                        {on && (
                          <Badge className="absolute right-3 top-3 z-20 rotate-3 shadow-shadow">
                            Picked
                          </Badge>
                        )}
                        <CardContent className="relative z-10 flex flex-col gap-1 px-4">
                          <span
                            className="font-indic text-xl font-heading text-white"
                            lang={d.language.slice(0, 2)}
                          >
                            {d.native}
                          </span>
                          <strong className="font-heading text-base text-white">{d.city}</strong>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs uppercase tracking-widest text-white/85">
                            <em className="not-italic">{d.name}</em>
                            <span aria-hidden>·</span>
                            <em className="not-italic">{d.languageLabel}</em>
                          </span>
                        </CardContent>
                      </Card>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="mt-10" aria-label="Instruction language">
              <Step
                n={2}
                title="I understand…"
                hint="Instructions and meanings appear in this language."
              />
              <div
                className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4"
                role="radiogroup"
                aria-label="Instruction language"
              >
                {BASE_LANG_OPTIONS.map((opt) => {
                  const on = baseLang === opt.code;
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className="cursor-pointer rounded-base border-0 bg-transparent p-0 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      onClick={() => {
                        playSfx("tap");
                        setBaseLang(opt.code);
                        writeStoredBaseLang(opt.code);
                      }}
                    >
                      <Card
                        className={cn(
                          "relative justify-end gap-2 overflow-hidden py-4 transition-all bg-secondary-background",
                          "hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none",
                          on &&
                            "-translate-x-boxShadowX -translate-y-boxShadowY shadow-[8px_8px_0px_0px_var(--border)] outline-4 -outline-offset-4 outline-main hover:-translate-x-boxShadowX hover:-translate-y-boxShadowY hover:shadow-[8px_8px_0px_0px_var(--border)]",
                        )}
                      >
                        {on && (
                          <Badge className="absolute right-3 top-3 z-20 rotate-3 shadow-shadow">
                            Picked
                          </Badge>
                        )}
                        <CardContent className="relative flex flex-col gap-1 px-4">
                          <span
                            className={cn(
                              "font-indic text-lg font-heading",
                              opt.code === "en-IN" && "font-sans",
                            )}
                            lang={opt.code.slice(0, 2)}
                          >
                            {opt.native}
                          </span>
                          <span className="text-xs uppercase tracking-widest text-foreground/70">
                            {opt.label}
                          </span>
                        </CardContent>
                      </Card>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Secondary choice — a segmented control, not three more cards,
                so it cannot compete with the district grid. */}
            <section className="mt-10" aria-label="Language comfort">
              <Step
                n={3}
                title="Set your starting level"
                hint={`How much ${pickedSummary?.languageLabel ?? "of the language"} do you already have?`}
              />
              <div
                className="flex w-full max-w-2xl overflow-hidden rounded-base border-2 border-border bg-secondary-background shadow-shadow"
                role="radiogroup"
                aria-label="Language comfort"
              >
                {COMFORT_OPTIONS.map((opt, i) => {
                  const on = comfort === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={cn(
                        "flex-1 cursor-pointer px-3 py-3 font-heading transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ring",
                        i > 0 && "border-l-2 border-border",
                        on
                          ? "bg-main text-main-foreground"
                          : "text-foreground/70 hover:bg-main/25 hover:text-foreground",
                      )}
                      onClick={() => {
                        playSfx("tap");
                        setComfort(opt.value);
                      }}
                    >
                      {opt.title}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 max-w-[56ch] text-sm text-foreground/70">
                <strong className="font-heading text-foreground">
                  {pickedComfort.description}.
                </strong>{" "}
                Errands get harder as you go — this only sets where the first level starts.
              </p>
            </section>
          </div>

          {/* Level 3 — the brief. Small footprint, but it holds the CTA, so the
              action now sits at the end of the decision instead of before it. */}
          <aside aria-live="polite" className="lg:sticky lg:top-20 lg:self-start">
            <Card className="gap-0 overflow-hidden py-0 lg:max-h-[calc(100dvh-7rem)]">
              {pickedSummary && (
                <div className="relative h-28 shrink-0 border-b-2 border-border">
                  <Image
                    src={DISTRICT_COVER_IMAGES[pickedSummary.id]}
                    alt=""
                    fill
                    className="object-cover object-center"
                    sizes="21rem"
                  />
                  <span
                    className="absolute inset-0 bg-linear-to-t from-black/75 to-black/10"
                    aria-hidden
                  />
                  <span className="absolute bottom-3 left-4 right-4 flex flex-col">
                    <span
                      className="font-indic text-lg font-heading text-white"
                      lang={pickedSummary.language.slice(0, 2)}
                    >
                      {pickedSummary.native}
                    </span>
                    <strong className="font-heading text-white">
                      {pickedSummary.city} · {pickedSummary.name}
                    </strong>
                  </span>
                </div>
              )}

              {/* Scrolls on short viewports so the CTA below never leaves the card. */}
              <CardContent className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-5 py-5">
                <div className="flex flex-wrap gap-2">
                  <Badge>{pickedSummary?.languageLabel ?? "—"}</Badge>
                  <Badge variant="neutral">{pickedSummary?.taskCount ?? 0} errands</Badge>
                  <Badge variant="neutral">{pickedComfort.title}</Badge>
                </div>

                <p className="text-sm leading-relaxed text-foreground/80">
                  Hail an auto, order local food, buy something at a temple stall, and get a
                  ticket — all in {pickedSummary?.languageLabel ?? "the local language"}.
                </p>

                {picked && picked.phrases.length > 0 && (
                  <div className="grid gap-2">
                    <h3 className="text-xs font-heading uppercase tracking-widest text-foreground/60">
                      You will say things like
                    </h3>
                    <ul className="grid gap-2">
                      {picked.phrases.slice(0, 3).map((p) => (
                        <li
                          key={p.native}
                          className="rounded-base border-2 border-border bg-secondary-background px-3 py-2"
                        >
                          <span
                            className="block font-indic text-sm font-heading"
                            lang={picked.language.slice(0, 2)}
                          >
                            {p.native}
                          </span>
                          <em className="text-xs not-italic text-foreground/70">
                            {gloss(p.en, baseLang)}
                          </em>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {detailError && (
                  <p className="rounded-base border-2 border-border bg-black px-3 py-2 text-sm text-white">
                    {detailError}
                  </p>
                )}

              </CardContent>

              <div className="hidden shrink-0 border-t-2 border-border p-4 lg:block">
                <Button size="lg" className="w-full" disabled={!ready} onClick={enter}>
                  {enterLabel}
                </Button>
              </div>
            </Card>
          </aside>
        </div>

        <footer className="mt-10 border-t-2 border-border pt-5">
          <p className="text-xs text-foreground/60">
            Speech, voice and dialogue by{" "}
            <strong className="font-heading text-foreground">Sarvam AI</strong>
          </p>
        </footer>
      </div>

      {/* Phone: the CTA is pinned to the viewport, not parked at the end of a
          long scroll. It carries the current choice so the bar is also the
          confirmation of what you picked. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_0_0_var(--border)] lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3 sm:px-2">
          <p className="min-w-0 flex-1 truncate text-xs text-foreground/70">
            {pickedSummary ? (
              <>
                <strong className="font-heading text-foreground">{pickedSummary.city}</strong>
                {" · "}
                {pickedSummary.languageLabel}
              </>
            ) : (
              "Pick a city to start"
            )}
          </p>
          <Button size="lg" className="shrink-0" disabled={!ready} onClick={enter}>
            {ready ? enterLabel : "Enter"}
          </Button>
        </div>
      </div>
    </main>
  );
}
