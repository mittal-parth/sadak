"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import posthog from "posthog-js";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const IS_DEV = process.env.NODE_ENV === "development";

/** Official multicolor Google "G" mark for the OAuth button. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function authRedirectPath(next: string | null): string {
  const path = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(path)}`;
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const authError = searchParams.get("error") === "auth";
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const [email, setEmail] = useState("");
  const [devEmail, setDevEmail] = useState("");
  const [devPassword, setDevPassword] = useState("");
  const [busy, setBusy] = useState<"google" | "magic" | "password" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  async function signInWithGoogle() {
    setFormError(null);
    setMessage(null);
    setBusy("google");
    posthog.capture("sign_in_attempted", { method: "google" });
    const redirectTo = authRedirectPath(next);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setFormError(error.message);
      setBusy(null);
    }
  }

  async function sendMagicLink(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setMessage(null);
    setBusy("magic");
    posthog.capture("sign_in_attempted", { method: "magic_link" });
    const redirectTo = authRedirectPath(next);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: true,
        emailRedirectTo: redirectTo,
      },
    });
    setBusy(null);
    if (error) {
      setFormError(error.message);
      return;
    }
    setMessage("Check your email for a sign-in link.");
  }

  async function signInWithPassword(event: React.FormEvent) {
    event.preventDefault();
    const trimmedEmail = devEmail.trim();
    if (!trimmedEmail || !devPassword) return;
    setFormError(null);
    setMessage(null);
    setBusy("password");
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: devPassword,
    });
    if (error) {
      setFormError(error.message);
      setBusy(null);
      return;
    }
    router.push(safeNext);
    router.refresh();
  }

  return (
    <div className="w-full max-w-md">
      <div className="flex items-baseline gap-2">
        <span className="font-indic text-2xl font-heading" lang="hi">
          सड़क
        </span>
        <h1 className="text-3xl font-heading tracking-tight">sadak</h1>
      </div>
      <p className="mt-3 text-sm text-foreground/70">
        A third-person street, in four languages. Sign in to walk it.
      </p>

      {authError ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>The link may have expired. Try again below.</AlertDescription>
        </Alert>
      ) : null}
      {formError ? (
        <Alert variant="destructive" className="mt-6">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {message ? (
        <Card className="mt-8 gap-0 py-5">
          <CardContent className="px-5">
            <div className="mb-3 flex size-10 items-center justify-center rounded-base border-2 border-border bg-main/20 text-foreground">
              <Mail size={20} strokeWidth={2} />
            </div>
            <h2 className="font-heading text-xl">Check your email</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/80">{message}</p>
            <Button
              type="button"
              variant="neutral"
              size="sm"
              className="mt-4"
              onClick={() => {
                setMessage(null);
                setEmail("");
              }}
            >
              Use a different email
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 flex flex-col gap-4">
          <Button
            type="button"
            variant="neutral"
            className="w-full"
            disabled={busy !== null}
            onClick={() => void signInWithGoogle()}
          >
            <GoogleMark />
            {busy === "google" ? "Redirecting…" : "Continue with Google"}
          </Button>

          <div className="relative text-center text-sm text-foreground/70">
            <span className="bg-background px-2 relative z-10">or</span>
            <div className="absolute inset-x-0 top-1/2 border-t border-border" aria-hidden />
          </div>

          <form className="flex flex-col gap-3" onSubmit={(e) => void sendMagicLink(e)}>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-heading">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 rounded-base border-2 border-border bg-secondary-background px-3 text-foreground shadow-shadow focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="you@example.com"
              />
            </label>
            <Button type="submit" className="w-full" disabled={busy !== null || !email.trim()}>
              {busy === "magic" ? "Sending…" : "Email me a magic link"}
            </Button>
          </form>

          {IS_DEV ? (
            <>
              <div className="relative text-center text-sm text-foreground/70">
                <span className="bg-background px-2 relative z-10 uppercase tracking-widest text-[11px] font-heading">
                  development only
                </span>
                <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-border" aria-hidden />
              </div>

              <form
                className="flex flex-col gap-3 rounded-base border-2 border-dashed border-border p-3"
                onSubmit={(e) => void signInWithPassword(e)}
              >
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-heading">Email</span>
                  <input
                    type="email"
                    name="dev-email"
                    autoComplete="email"
                    required
                    value={devEmail}
                    onChange={(e) => setDevEmail(e.target.value)}
                    className="h-10 rounded-base border-2 border-border bg-secondary-background px-3 text-foreground shadow-shadow focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="you@example.com"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-heading">Password</span>
                  <input
                    type="password"
                    name="dev-password"
                    autoComplete="current-password"
                    required
                    value={devPassword}
                    onChange={(e) => setDevPassword(e.target.value)}
                    className="h-10 rounded-base border-2 border-border bg-secondary-background px-3 text-foreground shadow-shadow focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Password"
                  />
                </label>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={busy !== null || !devEmail.trim() || !devPassword}
                >
                  {busy === "password" ? "Signing in…" : "Sign in with password"}
                </Button>
              </form>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
