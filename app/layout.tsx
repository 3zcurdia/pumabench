import type { Metadata } from "next";
import Link from "next/link";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Footer from "@/components/Footer";
import ThemeInitScript from "@/components/ThemeInitScript";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resultados de Pumabench",
  description: "Panel de resultados del benchmark — calificaciones de modelos por area y tema",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <ThemeInitScript />
      </head>
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <div className="header-brand">
              <Link href="/" className="brand">
                <svg
                  className="brand-paw"
                  viewBox="0 0 32 32"
                  width="20"
                  height="20"
                  aria-hidden="true"
                >
                  <ellipse cx="12.5" cy="8.5" rx="2.6" ry="3.2" />
                  <ellipse cx="19.5" cy="8.5" rx="2.6" ry="3.2" />
                  <ellipse cx="6.5" cy="13.5" rx="2.6" ry="3.2" />
                  <ellipse cx="25.5" cy="13.5" rx="2.6" ry="3.2" />
                  <path d="M16 12c-4.4 0-7.6 3.4-7.6 6.9 0 3 2 4.9 4.4 4.9 1.6 0 2.4-1 3.2-1s1.6 1 3.2 1c2.4 0 4.4-1.9 4.4-4.9 0-3.5-3.2-6.9-7.6-6.9Z" />
                </svg>
                PumaBench
              </Link>
              <span className="tagline">Benchmark del examen de admisión UNAM</span>
            </div>
            <ThemeToggle />
          </div>
        </header>
        <main className="container">{children}</main>
        <Footer />
        <SpeedInsights />
      </body>
    </html>
  );
}
