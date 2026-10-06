import type { Metadata } from "next";
import { connection } from "next/server";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Foundation Admin", template: "%s | Foundation Admin" },
  robots: { index: false, follow: false, nocache: true },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  await connection(); // dynamic rendering, so every response carries a fresh CSP nonce
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
