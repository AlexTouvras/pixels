import type { Metadata } from "next";
import { Pixelify_Sans, Sora } from "next/font/google";
import "./globals.css";

const pixelify = Pixelify_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700"],
});

const sora = Sora({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Pixels — game-ready pixel art",
  description:
    "Generate and snap true pixel art sprites for games: grid-locked, palette-quantized PNGs.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${pixelify.variable} ${sora.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
