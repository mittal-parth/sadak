"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { acknowledgeCookieNotice, hasAcknowledgedCookieNotice } from "@/lib/consent";

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasAcknowledgedCookieNotice()) setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-border bg-secondary-background px-4 py-2 shadow-shadow">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-snug text-foreground/80">
          We use cookies and analytics. See our{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>
          .
        </p>
        <Button
          size="sm"
          className="h-7 shrink-0 px-3 text-xs"
          onClick={() => {
            acknowledgeCookieNotice();
            setVisible(false);
          }}
        >
          Got it
        </Button>
      </div>
    </div>
  );
}
