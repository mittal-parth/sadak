import Link from "next/link";
import { ArrowLeft, BarChart2 } from "lucide-react";
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
        <div className="mb-10">
          <Button variant="neutral" size="sm" asChild className="mb-6">
            <Link href="/">
              <ArrowLeft />
              Back to cities
            </Link>
          </Button>
          <div className="flex items-start gap-4 sm:gap-5">
            <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-base border-2 border-border bg-main text-main-foreground shadow-shadow">
              <BarChart2 size={16} strokeWidth={2} aria-hidden />
            </span>
            <div className="space-y-2">
              <h1 className="text-2xl font-heading tracking-tight sm:text-3xl">
                Global leaderboard
              </h1>
              <p className="max-w-prose text-sm leading-relaxed text-foreground/70">
                Ranked by XP, then errands and cities completed.
              </p>
            </div>
          </div>
        </div>

        <LeaderboardTable />
      </div>
    </main>
  );
}
