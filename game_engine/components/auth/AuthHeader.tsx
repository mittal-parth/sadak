"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SignOutButton from "@/components/auth/SignOutButton";

const PUBLIC_PATHS = new Set(["/login"]);

export default function AuthHeader() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (mounted) {
        setUser(data.user);
        setReady(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  if (!ready || !user || PUBLIC_PATHS.has(pathname)) {
    return null;
  }

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-[200] flex justify-end p-3 sm:p-4">
      <div className="pointer-events-auto rounded-base border-2 border-border bg-background/95 px-2 py-1.5 shadow-shadow backdrop-blur-sm">
        <SignOutButton />
      </div>
    </header>
  );
}
