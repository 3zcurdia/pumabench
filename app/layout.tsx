import type { Metadata } from "next";
import Link from "next/link";
import { SpeedInsights } from "@vercel/speed-insights/next";
import Footer from "@/components/Footer";
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
    <html lang="es">
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">
              PumaBench
            </Link>
            <span className="tagline">Benchmark del examen de admisión UNAM</span>
          </div>
        </header>
        <main className="container">{children}</main>
        <Footer />
        <SpeedInsights />
      </body>
    </html>
  );
}
