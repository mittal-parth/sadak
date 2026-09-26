import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Privacy Policy — sadak",
  description: "How sadak collects, uses, and stores your data.",
};

export default function PrivacyPage() {
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
            <Shield size={16} strokeWidth={2} aria-hidden />
          </span>
          <div className="space-y-2">
            <h1 className="text-2xl font-heading tracking-tight sm:text-3xl">
              Privacy Policy
            </h1>
            <p className="max-w-prose text-sm leading-relaxed text-foreground/70">
              Last updated: August 2026
            </p>
          </div>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-foreground/80">
          <section className="space-y-2">
            <h2 className="text-lg font-heading text-foreground">What sadak is</h2>
            <p>
              Sadak is an interactive voice-first game where you learn a new language through everyday conversations. This policy explains what data we collect while you play
              and why.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-heading text-foreground">Data we collect</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="text-foreground">Account data.</span> If you sign
                in, we use Supabase to store your email and session so you can save
                progress and appear on the leaderboard.
              </li>
              <li>
                <span className="text-foreground">Voice audio.</span> When you talk
                to an NPC, your microphone audio is streamed to our voice
                infrastructure (LiveKit) and to Sarvam AI for speech recognition and
                synthesis, so the game can understand and respond to you. Audio is
                not used for anything beyond powering that conversation.
              </li>
              <li>
                <span className="text-foreground">Analytics.</span> We use PostHog
                to understand how sadak is used (pages visited, features used,
                errors) so we can improve the game. This does not include your
                voice audio or conversation content.
              </li>
              <li>
                <span className="text-foreground">Local preferences.</span> Your
                audio mute setting and base language are stored only in your
                browser&apos;s local storage and never sent to us.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-heading text-foreground">
              Cookies and similar technology
            </h2>
            <p>
              Supabase sets a cookie to keep you signed in. PostHog sets cookies
              and uses local storage to distinguish visitors for analytics. You can
              clear cookies and site data in your browser at any time, which will
              sign you out and reset analytics identifiers.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-heading text-foreground">Third parties</h2>
            <p>
              We share data with the services that make sadak work: Supabase
              (accounts and database), LiveKit (real-time voice), Sarvam AI
              (speech and language processing), and PostHog (analytics, hosted in
              the EU). Each processes only the data needed for its function.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-heading text-foreground">Changes</h2>
            <p>
              We may update this policy as sadak evolves. Continued use of the game
              after changes means you accept the updated policy.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
