"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LandscapeGate() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay p-6">
      <Card className="max-w-sm text-center">
        <CardHeader>
          <CardTitle className="text-2xl">Rotate your phone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-foreground/80">
          <p>SADAK plays in landscape so you can see the street and use the on-screen controls.</p>
          <p className="text-4xl" aria-hidden>
            ↻
          </p>
          <p>Turn your device sideways, then keep playing.</p>
        </CardContent>
      </Card>
    </div>
  );
}
