import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "기상특보 현황 대시보드",
  description: "실시간 기상특보 현황을 확인하고 개인별 알림 설정을 관리하세요",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${inter.className} flex flex-col min-h-screen`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:bg-white focus:px-4 focus:py-2 focus:text-blue-700 focus:underline">
          본문으로 건너뛰기
        </a>
        <Header />
        <div id="main-content" className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
