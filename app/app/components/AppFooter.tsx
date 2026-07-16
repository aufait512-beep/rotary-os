import Link from "next/link";
import { appVersion } from "@/lib/appVersion";

export default function AppFooter() {
  return (
    <footer className="bg-[#F8F3E8] px-4 py-4 text-center text-[11px] leading-5 text-gray-500">
      <p>{appVersion.fullVersion}</p>
      <p>由 {appVersion.developer} 開發與維護</p>
      <Link href="/about" className="font-semibold text-gray-500 underline-offset-2 hover:underline">
        系統資訊
      </Link>
    </footer>
  );
}
