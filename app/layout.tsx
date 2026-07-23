import type { Metadata } from "next";
import Link from "next/link";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pumabench Results",
  description: "Benchmark results dashboard — model scores by area and subject",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">
              PumaBench
            </Link>
            <span className="tagline">UNAM admission test benchmark</span>
          </div>
        </header>
        <main className="container">{children}</main>
        <SpeedInsights />
      </body>
    </html>
  );
}
