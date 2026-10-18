import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ScioCamp", template: "%s · ScioCamp" },
  description: "Rozvrh, kurzy, ateliéry, úkoly a hlasování pro ScioCamp.",
};

export const viewport: Viewport = {
  themeColor: "#3B6FE0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
