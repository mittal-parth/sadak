import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import AuthHeader from "@/components/auth/AuthHeader";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "SADAK: an Indian street, in your language",
  description:
    "A third-person open street where every NPC speaks an Indian language. Talk your way through it, out loud. Built on Sarvam AI.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body>
        <AuthHeader />
        {children}
      </body>
    </html>
  );
}
