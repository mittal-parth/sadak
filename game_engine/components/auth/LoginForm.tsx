"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import posthog from "posthog-js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const IS_DEV = process.env.NODE_ENV === "development";

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
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-xl">Sign in to SADAK</CardTitle>
        <CardDescription>
          Access is restricted. Sign in with Google or a one-time email link.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {authError ? (
          <Alert variant="destructive">
            <AlertTitle>Sign-in failed</AlertTitle>
            <AlertDescription>
              The link may have expired. Try again below.
            </AlertDescription>
          </Alert>
        ) : null}
        {formError ? (
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        {message ? (
          <Alert>
            <AlertTitle>Email sent</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}

        <Button
          type="button"
          variant="neutral"
          className="w-full"
          disabled={busy !== null}
          onClick={() => void signInWithGoogle()}
        >
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
          <Button type="submit" className="w-full" disabled={busy !== null}>
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
      </CardContent>
    </Card>
  );
}
