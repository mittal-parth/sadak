import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SADAK: an Indian street, in your language",
  description:
    "A third-person open street where every NPC speaks an Indian language. Talk your way through it, out loud. Built on Sarvam AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
