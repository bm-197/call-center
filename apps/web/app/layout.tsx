import type { Metadata } from "next";
import "./globals.css";
import { Geist_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const geistMono = Geist_Mono({subsets:['latin'],variable:'--font-mono'});

export const metadata: Metadata = {
  title: "Call Center — Amharic AI Call Center",
  description: "Amharic-based AI call center SaaS for Ethiopian organizations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="am" className={cn("font-mono", geistMono.variable)}>
      <body>{children}</body>
    </html>
  );
}
