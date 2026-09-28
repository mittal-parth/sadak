import { Suspense } from "react";
import LoginForm from "@/components/auth/LoginForm";
import { LoginShowcase } from "@/components/auth/LoginShowcase";

export const metadata = {
  title: "Sign in — SADAK",
  description: "Sign in with Google to access SADAK.",
};

function LoginFallback() {
  return (
    <div className="w-full max-w-md rounded-base border-2 border-border bg-background p-6 shadow-shadow">
      Loading sign-in…
    </div>
  );
}

export default function LoginPage() {
  // The viewport's height, not the parent's (which has none): the picture
  // wall runs the full height beside the form.
  return (
    <main className="flex min-h-dvh flex-col-reverse lg:flex-row">
      <div className="flex flex-1 items-center justify-center px-6 py-12 lg:basis-[45%] lg:px-10 lg:py-14">
        <Suspense fallback={<LoginFallback />}>
          <LoginForm />
        </Suspense>
      </div>

      <LoginShowcase className="h-[48dvh] shrink-0 lg:h-auto lg:basis-[55%] lg:shrink" />
    </main>
  );
}
