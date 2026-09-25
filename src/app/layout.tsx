import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, Space_Grotesk, Instrument_Serif } from "next/font/google";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });
const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
});

export const metadata: Metadata = {
  title: "ReelForge — Faceless videos on autopilot",
  description:
    "ReelForge writes, voices, edits and posts scroll-stopping Shorts & TikToks while you sleep. Pick a niche — the AI runs your channel.",
  openGraph: {
    title: "ReelForge — Faceless videos on autopilot",
    description:
      "AI writes the script, paints the scenes, narrates the voice and posts on schedule. You never touch a camera.",
    images: ["/scenes/tech.jpg"],
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${grotesk.variable} ${instrument.variable}`}
    >
      <body className="grain bg-void font-sans text-cream antialiased">
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
