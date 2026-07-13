import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "高雄晨光扶輪社｜Rotary OS",
  description: "高雄晨光扶輪社年度社務管理系統",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/sunlight-icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/sunlight-icon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

function AppFooter() {
  return (
    <footer className="bg-[#F8F3E8] px-4 py-6 text-center text-xs leading-6 text-gray-500">
      <p>Rotary OS v1.0.0</p>
      <p>© 2026 Jadecode Studio. All rights reserved.</p>
      <p>Powered by Jade AI</p>
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
