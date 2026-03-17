import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ops Dashboard — RealTruck Demo",
  description: "Real-time manufacturing floor KPI dashboard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-slate-200 min-h-screen">
        {children}
      </body>
    </html>
  );
}