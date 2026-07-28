import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";

export const metadata = {
  title: "Sign in — SADAK",
  description: "Sign in with Google or a magic link to access SADAK.",
};

function LoginFallback() {
  return (
    <div className="w-full max-w-md rounded-base border-2 border-border bg-background p-6 shadow-shadow">
      Loading sign-in…
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-6 p-6">
      <Suspense fallback={<LoginFallback />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
