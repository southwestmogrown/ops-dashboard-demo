import type { Metadata } from "next";
import "./globals.css";
import AuthProviders from "@/components/AuthProviders";

export const metadata: Metadata = {
  title: "Kinetic Command | Ops Dashboard",
  description: "Real-time manufacturing floor KPI dashboard.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-[#e1e2ec] min-h-screen font-['Inter',sans-serif]">
        <AuthProviders>{children}</AuthProviders>
      </body>
    </html>
  );
}
