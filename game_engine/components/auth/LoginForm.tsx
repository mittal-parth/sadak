"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function authRedirectPath(next: string | null): string {
  const path = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(path)}`;
}

export default function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const authError = searchParams.get("error") === "auth";

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"google" | "magic" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  async function signInWithGoogle() {
    setFormError(null);
    setMessage(null);
    setBusy("google");
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
      </CardContent>
    </Card>
  );
}
