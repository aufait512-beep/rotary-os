import type { Metadata } from "next";
import AppFooter from "@/app/components/AppFooter";
import { appVersion } from "@/lib/appVersion";
import "./globals.css";

export const metadata: Metadata = {
  title: `高雄晨光扶輪社｜${appVersion.fullVersion}`,
  description: appVersion.systemPositioning,
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
