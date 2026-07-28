import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import AuthHeader from "@/components/auth/AuthHeader";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://playsadak.vercel.app";

const siteTitle = "SADAK: an Indian street, in your language";
const siteDescription =
  "A third-person open street where every NPC speaks an Indian language. Talk your way through it, out loud. Built on Sarvam AI.";

const openGraphImage = {
  url: "/open-graph-img.jpg",
  width: 1161,
  height: 613,
  alt: "SADAK — an Indian street where every NPC speaks your language",
  type: "image/jpeg",
} as const;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  applicationName: "SADAK",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png", sizes: "500x500" }],
    apple: [{ url: "/icon.png", type: "image/png", sizes: "500x500" }],
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "/",
    siteName: "SADAK",
    locale: "en_US",
    type: "website",
    images: [openGraphImage],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: [openGraphImage.url],
  },
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
