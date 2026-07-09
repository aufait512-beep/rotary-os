import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rotary OS",
  description: "高雄晨光扶輪社 2026-2027 年度",
};

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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
