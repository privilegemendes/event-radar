import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Event Radar",
  description: "Track and rank AI events to attend, sponsor, and speak at",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Dark is the only theme wired up today. The token set in globals.css already
  // carries both, so enabling light mode means making this class conditional —
  // not another pass over the components.
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full dark`}
    >
      <body className="h-full bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
