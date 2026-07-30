import type { Metadata } from "next";
import AppFooter from "@/app/components/AppFooter";
import { AppAccessGate } from "@/app/components/AppAccessGate";
import { AuthProvider } from "@/app/components/AuthProvider";
import { appVersion } from "@/lib/appVersion";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `高雄晨光扶輪社｜${appVersion.fullVersion}`,
    template: `%s｜高雄晨光扶輪社`,
  },
  description: appVersion.systemPositioning,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/sunlight-icon-32x32.png?v=6", sizes: "32x32", type: "image/png" },
      { url: "/sunlight-icon-48x48.png?v=6", sizes: "48x48", type: "image/png" },
    ],
    apple: [
      { url: "/sunlight-rotary-logo.png?v=6", sizes: "512x512", type: "image/png" },
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
        <AuthProvider>
          <AppAccessGate>{children}</AppAccessGate>
          <AppFooter />
        </AuthProvider>
      </body>
    </html>
  );
}


