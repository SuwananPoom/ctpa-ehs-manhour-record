import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const notoThai = Noto_Sans_Thai({
  subsets: ["thai"],
  variable: "--font-thai",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CTPA EHS Manhour Record & Safety KPI",
  description:
    "Daily manpower, working hours and Safety KPI dashboard for CTPA BKK22 — Chonburi Tech Park Data Center construction.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#00cc79",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${inter.variable} ${notoThai.variable}`}>
      <body style={{ fontFamily: "var(--font-inter), var(--font-thai), sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
