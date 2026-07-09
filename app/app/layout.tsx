import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rotary OS｜高雄晨光扶輪社智慧秘書系統",
  description:
    "Rotary OS 為扶輪社智慧秘書系統，整合社友管理、例會程序表、活動管理、社費、年度公益捐獻及 AI 智慧秘書。",
};

function AppFooter() {
  return (
    <footer className="bg-[#F8F3E8] px-4 py-6 text-center text-xs leading-6 text-gray-500">
      <p>Rotary OS v1.0.0</p>
      <p>© 2026 Jadecode Studio. All rights reserved.</p>
      <p>Powered by Jane AI</p>
    </footer>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        {children}
        <AppFooter />
      </body>
    </html>
  );
}
