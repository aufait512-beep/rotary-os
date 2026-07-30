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
    theme_color: "#17458F",
    icons: [
      {
        src: "/sunlight-rotary-logo.png?v=6",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}

