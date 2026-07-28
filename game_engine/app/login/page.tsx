import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";
import { LoginShowcase } from "@/components/auth/LoginShowcase";

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
    <main className="flex min-h-full flex-col-reverse lg:flex-row">
      <div className="flex flex-1 items-center justify-center px-6 py-10 lg:basis-[45%] lg:px-10 lg:py-14">
        <Suspense fallback={<LoginFallback />}>
          <LoginForm />
        </Suspense>
      </div>

      <LoginShowcase className="h-[32vh] shrink-0 lg:h-auto lg:min-h-full lg:basis-[55%] lg:shrink" />
    </main>
  );
}
