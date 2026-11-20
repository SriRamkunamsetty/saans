import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Saans — your urban air quality assistant",
  description:
    "Turn today's smog data into a personalised plan: low-emission routines, indoor air hacks and sustainable alternatives, each with its direct impact explained.",
  applicationName: "Saans",
};

// Zoom is deliberately not restricted (WCAG 1.4.4 Resize Text).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
