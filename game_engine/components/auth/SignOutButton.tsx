"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SignOutButtonProps = {
  className?: string;
  fullWidth?: boolean;
  /** `subtle` = muted text link for global chrome; `menu` = neutral button in HUD/menus */
  tone?: "subtle" | "menu";
};

export default function SignOutButton({
  className,
  fullWidth,
  tone = "menu",
}: SignOutButtonProps) {
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

  const label = busy ? "Logging out…" : "Log out";

  if (tone === "subtle") {
    return (
      <button
        type="button"
        disabled={busy}
        className={cn(
          "text-xs text-foreground/45 underline-offset-2 transition-colors hover:text-foreground/70 hover:underline disabled:opacity-50",
          className,
        )}
        onClick={() => void logOut()}
      >
        {label}
      </button>
    );
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
      {label}
    </Button>
  );
}
