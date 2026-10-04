import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/common/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FAROVON TMS", template: "%s · FAROVON TMS" },
  description: "Система управления обучением ГК «Фаровон»",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#18181b" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow">
          Перейти к содержимому
        </a>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
