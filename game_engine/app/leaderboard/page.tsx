import Link from "next/link";
import { ArrowLeft, Trophy } from "lucide-react";
import LeaderboardTable from "@/components/leaderboard/LeaderboardTable";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Leaderboard — sadak",
  description: "Global player rankings for sadak errands.",
};

export default function LeaderboardPage() {
  return (
    <main className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Button variant="neutral" size="sm" asChild className="mb-4">
              <Link href="/">
                <ArrowLeft />
                Back to cities
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-base border-2 border-border bg-main text-main-foreground shadow-shadow">
                <Trophy size={20} strokeWidth={2} aria-hidden />
              </span>
              <div>
                <h1 className="text-2xl font-heading tracking-tight sm:text-3xl">
                  Global leaderboard
                </h1>
                <p className="mt-1 text-sm text-foreground/70">
                  Ranked by XP, then cash, errands, and cities completed.
                </p>
              </div>
            </div>
          </div>
        </div>

        <LeaderboardTable />
      </div>
    </main>
  );
}
