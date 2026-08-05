"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Hash,
  Sparkles,
  User,
  type LucideIcon,
} from "lucide-react";
import type { LeaderboardResponse, LeaderboardRow } from "@/lib/game/leaderboard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

function formatNumber(value: number): string {
  return value.toLocaleString("en-IN");
}

function ColumnHead({
  icon: Icon,
  label,
  shortLabel,
  className,
}: {
  icon: LucideIcon;
  label: string;
  shortLabel?: string;
  className?: string;
}) {
  return (
    <TableHead className={className}>
      <span
        className="inline-flex items-center justify-end gap-1 whitespace-nowrap text-xs sm:gap-1.5 sm:text-sm"
        title={shortLabel ? label : undefined}
      >
        <Icon
          size={14}
          strokeWidth={2}
          aria-hidden
          className="size-3 shrink-0 sm:size-3.5"
        />
        <span className="sm:hidden">{shortLabel ?? label}</span>
        <span className="hidden sm:inline">{label}</span>
      </span>
    </TableHead>
  );
}

const PODIUM_MEDALS: Record<number, string> = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

function podiumRowClass(rank: number): string {
  switch (rank) {
    case 1:
      return "bg-amber-100 hover:bg-amber-100";
    case 2:
      return "bg-slate-200 hover:bg-slate-200";
    case 3:
      return "bg-orange-100 hover:bg-orange-100";
    default:
      return "bg-secondary-background hover:bg-secondary-background";
  }
}

function rowClass(rank: number, isMe: boolean): string {
  if (isMe && rank > 3) {
    return "bg-main/40 text-foreground ring-2 ring-inset ring-border hover:bg-main/40";
  }
  if (isMe) {
    return cn(
      podiumRowClass(rank),
      "text-foreground ring-2 ring-inset ring-border",
    );
  }
  return cn("text-foreground", podiumRowClass(rank));
}

function ScoreRow({
  row,
  isMe,
  className,
}: {
  row: LeaderboardRow;
  isMe?: boolean;
  className?: string;
}) {
  const medal = PODIUM_MEDALS[row.rank];

  return (
    <TableRow className={className}>
      <TableCell className="font-heading">
        <span className="inline-flex items-center gap-1.5 pl-1">
          {medal ? (
            <span className="-rotate-12 text-lg leading-none select-none" aria-hidden>
              {medal}
            </span>
          ) : null}
          #{row.rank}
        </span>
      </TableCell>
      <TableCell className="font-heading">
        {row.display_name}
        {isMe ? (
          <span className="ml-2 text-xs font-base opacity-80">(you)</span>
        ) : null}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatNumber(row.errands_completed)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatNumber(row.cities_completed)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatNumber(row.total_xp)}
      </TableCell>
    </TableRow>
  );
}

export default function LeaderboardTable() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(PAGE_SIZE),
      });
      const res = await fetch(`/api/leaderboard?${params.toString()}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not load leaderboard.");
      }
      const payload = (await res.json()) as LeaderboardResponse;
      setData(payload);
      setPage(payload.page);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Could not load leaderboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const canGoPrev = page > 1;
  const canGoNext = data ? page < totalPages : false;

  if (loading && !data) {
    return (
      <p className="py-12 text-center text-sm text-foreground/70">
        Loading leaderboard…
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-base border-2 border-border bg-secondary-background p-6 text-center">
        <p className="font-heading">{error}</p>
        <p className="mt-2 text-sm text-foreground/70">
          If you are setting up locally, run migrations{" "}
          <code className="font-heading text-foreground">010_leaderboard_view.sql</code> and{" "}
          <code className="font-heading text-foreground">011_leaderboard_all_users.sql</code>{" "}
          in the Supabase SQL editor.
        </p>
        <Button
          type="button"
          variant="neutral"
          size="sm"
          className="mt-4"
          onClick={() => void load(page)}
        >
          Try again
        </Button>
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="rounded-base border-2 border-border bg-secondary-background p-8 text-center">
        <p className="font-heading text-lg">No scores yet</p>
        <p className="mt-2 text-sm text-foreground/70">
          Complete errands in any city to appear on the board.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-base border-2 border-border bg-secondary-background shadow-shadow">
        <Table className="[&_td]:px-2 [&_th]:px-2 sm:[&_td]:px-4 sm:[&_th]:px-4">
          <TableHeader>
            <TableRow className="bg-main text-main-foreground hover:bg-main">
              <TableHead className="w-14 text-main-foreground sm:w-20">
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs sm:gap-1.5 sm:text-sm">
                  <Hash
                    size={14}
                    strokeWidth={2}
                    aria-hidden
                    className="size-3 shrink-0 sm:size-3.5"
                  />
                  Rank
                </span>
              </TableHead>
              <TableHead className="text-main-foreground">
                <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs sm:gap-1.5 sm:text-sm">
                  <User
                    size={14}
                    strokeWidth={2}
                    aria-hidden
                    className="size-3 shrink-0 sm:size-3.5"
                  />
                  Player
                </span>
              </TableHead>
              <ColumnHead
                icon={ClipboardList}
                label="Errands"
                className="text-right text-main-foreground"
              />
              <ColumnHead
                icon={Building2}
                label="Cities completed"
                shortLabel="Cities"
                className="text-right text-main-foreground"
              />
              <ColumnHead
                icon={Sparkles}
                label="XP"
                className="text-right text-main-foreground"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => {
              const isMe = row.user_id === data.meId;
              return (
                <ScoreRow
                  key={row.user_id}
                  row={row}
                  isMe={isMe}
                  className={rowClass(row.rank, isMe)}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-foreground/70">
          Page {page} of {totalPages}
          <span className="hidden sm:inline">
            {" "}
            · {formatNumber(data.total)} player{data.total === 1 ? "" : "s"}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="neutral"
            size="sm"
            disabled={!canGoPrev || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft />
            Prev
          </Button>
          <Button
            type="button"
            variant="neutral"
            size="sm"
            disabled={!canGoNext || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
