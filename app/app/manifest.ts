import type { MetadataRoute } from "next";
import { appVersion } from "@/lib/appVersion";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `高雄晨光扶輪社 ${appVersion.fullVersion}`,
    short_name: "晨光 Rotary OS",
    description: appVersion.systemPositioning,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#F7C948",
    icons: [
      {
        src: "/sunlight-icon-48x48.png",
        sizes: "48x48",
        type: "image/png",
      },
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
