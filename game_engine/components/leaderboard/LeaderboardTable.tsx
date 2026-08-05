"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LeaderboardResponse } from "@/lib/game/leaderboard";
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
          If you are setting up locally, run migration{" "}
          <code className="font-heading text-foreground">010_leaderboard_view.sql</code>{" "}
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
      <div className="overflow-x-auto rounded-base border-2 border-border shadow-shadow">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Rank</TableHead>
              <TableHead>Player</TableHead>
              <TableHead className="text-right">Errands</TableHead>
              <TableHead className="text-right">Cities</TableHead>
              <TableHead className="text-right">XP</TableHead>
              <TableHead className="text-right">Cash</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => {
              const isMe = row.user_id === data.meId;
              return (
                <TableRow
                  key={row.user_id}
                  data-state={isMe ? "selected" : undefined}
                  className={cn(isMe && "ring-2 ring-inset ring-border")}
                >
                  <TableCell className="font-heading">#{row.rank}</TableCell>
                  <TableCell className="font-heading">
                    {row.display_name}
                    {isMe ? (
                      <span className="ml-2 text-xs font-base text-foreground/70">
                        (you)
                      </span>
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
                  <TableCell className="text-right tabular-nums">
                    ₹{formatNumber(row.total_cash)}
                  </TableCell>
                </TableRow>
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
