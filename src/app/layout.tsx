import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "ScioCamp", template: "%s · ScioCamp" },
  description: "Rozvrh, kurzy, ateliéry, úkoly a hlasování pro ScioCamp.",
};

export const viewport: Viewport = {
  themeColor: "#3B6FE0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme nastavuje skript před vykreslením (tmavý režim bez probliknutí).
    <html lang="cs" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
