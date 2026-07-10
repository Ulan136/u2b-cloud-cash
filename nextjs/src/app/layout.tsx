import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { SWRegister } from "./sw-register";
import { Nav } from "@/components/Nav";

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

export const metadata: Metadata = {
  title: "U2B Cloud Cash",
  description: "Учёт кассы",
  manifest: "/manifest.json",
  applicationName: "CloudCash",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CloudCash",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
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
        <Nav />
        {/* отступ снизу под фиксированную мобильную панель; на десктопе панель сверху */}
        <div className="pb-20 lg:pb-0">{children}</div>
        <SWRegister />
      </body>
    </html>
  );
}
