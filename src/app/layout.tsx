import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "BscScan - USDT Wallet Security",
  description: "Check your BEP-20 token wallet security.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />{children}</body></html>;
}
