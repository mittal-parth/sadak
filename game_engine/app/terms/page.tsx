import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Terms & Conditions — sadak",
  description: "The terms that govern your use of sadak.",
};

export default function TermsPage() {
  return (
    <main className="min-h-full bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <Button variant="neutral" size="sm" asChild className="mb-6">
          <Link href="/">
            <ArrowLeft />
            Back to cities
          </Link>
        </Button>

        <div className="mb-8 flex items-start gap-4 sm:gap-5">
          <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-base border-2 border-border bg-main text-main-foreground shadow-shadow">
            <FileText size={16} strokeWidth={2} aria-hidden />
          </span>
          <div className="space-y-2">
            <h1 className="text-2xl font-heading tracking-tight sm:text-3xl">
              Terms &amp; Conditions
            </h1>
            <p className="max-w-prose text-sm leading-relaxed text-foreground/70">
              Last updated: August 2026
            </p>
          </div>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/80">
          <section className="space-y-2">
            <h2 className="text-lg font-heading text-foreground">Acceptance</h2>
            <p>
              By using sadak, you agree to these terms. If you don&apos;t agree,
              please don&apos;t use the game.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-heading text-foreground">The service</h2>
            <p>
              Sadak is an interactive voice-first game where you learn a new language through everyday conversations. It
              is provided as-is and may change, break, or be discontinued at any
              time.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-heading text-foreground">Accounts</h2>
            <p>
              If you sign in, you&apos;re
              responsible for keeping your credentials secure and for activity
              under your account. See our{" "}
              <Link href="/privacy" className="underline underline-offset-2">
                Privacy Policy
              </Link>{" "}
              for how we handle account data.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-heading text-foreground">Acceptable use</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Don&apos;t use sadak to harass, abuse, or harm others.</li>
              <li>
                Don&apos;t attempt to disrupt, reverse-engineer, or gain
                unauthorized access to the game or its infrastructure.
              </li>
              <li>Don&apos;t use automated tools to manipulate the leaderboard.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-heading text-foreground">
              Disclaimer &amp; liability
            </h2>
            <p>
              Sadak relies on third-party speech and AI services, so voice
              recognition and NPC responses may sometimes be inaccurate or
              unavailable. The game is provided without warranties of any kind,
              and to the fullest extent permitted by law, we&apos;re not liable
              for any damages arising from your use of it.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-heading text-foreground">Changes</h2>
            <p>
              We may update these terms as sadak evolves. Continued use of the
              game after changes means you accept the updated terms.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
