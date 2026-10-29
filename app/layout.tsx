import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const sans = Instrument_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "Vaachak — AI telecalling for India",
  description: "AI voice agents that call every lead, work through your lists in 7 Indian languages and log every outcome.",
};
export const viewport: Viewport = { themeColor: "#060814" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
