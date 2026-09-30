import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Littleloop Studio — Tiny stories, big imagination",
  description: "A private creative studio for making original animated kids' cartoon Shorts, from first idea to YouTube upload.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
