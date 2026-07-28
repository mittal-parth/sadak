"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SignOutButtonProps = {
  className?: string;
  fullWidth?: boolean;
};

export default function SignOutButton({ className, fullWidth }: SignOutButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logOut() {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="neutral"
      size="sm"
      className={cn(fullWidth && "w-full", className)}
      disabled={busy}
      onClick={() => void logOut()}
    >
      {busy ? "Logging out…" : "Log out"}
    </Button>
  );
}
