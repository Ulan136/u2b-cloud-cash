import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SWRegister } from "./sw-register";
import { AppShell } from "@/components/AppShell";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

// Название магазина из переменной окружения (свой у каждого проекта Vercel).
const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || "U2B Cloud Cash";

export const metadata: Metadata = {
  title: STORE_NAME,
  description: "Учёт кассы",
  manifest: "/manifest.json",
  applicationName: "CloudCash",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CloudCash",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppShell>{children}</AppShell>
        <SWRegister />
      </body>
    </html>
  );
}
