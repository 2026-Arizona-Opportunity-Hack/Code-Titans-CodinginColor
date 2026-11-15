import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, JetBrains_Mono } from "next/font/google";
import { MockProvider } from "./components/common/MockProvider";
import { Providers } from "./components/common/Providers";
import { SkipLink } from "./components/common/SkipLink";
import "./globals.css";

// Atkinson Hyperlegible is designed for legibility, which suits students on
// small screens. JetBrains Mono is for code.
const sans = Atkinson_Hyperlegible({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-atkinson",
  display: "swap",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CIC Learn",
  description: "Coding in Color: curriculum and student progress platform.",
  // Student links carry a secret in the URL fragment; never leak it via Referer.
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#007a3d", // CIC Dark Green
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <SkipLink />
        <MockProvider>
          <Providers>{children}</Providers>
        </MockProvider>
      </body>
    </html>
  );
}
