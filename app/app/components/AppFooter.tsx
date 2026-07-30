"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { appVersion } from "@/lib/appVersion";

export default function AppFooter() {
  const pathname = usePathname();
  const isAppointmentSite = pathname.startsWith("/appointment");

  return (
    <footer className="bg-[#F8F3E8] px-4 py-4 text-center text-[11px] leading-5 text-gray-500">
      <p>{isAppointmentSite ? "Jade 怡箴・動物溝通預約網站" : appVersion.fullVersion}</p>
      <p>{isAppointmentSite ? "網站設計與維護 Jadecode.stuidio" : `由 ${appVersion.developer} 開發與維護`}</p>
      <Link href={isAppointmentSite ? "/appointment" : "/about"} className="font-semibold text-gray-500 underline-offset-2 hover:underline">
        {isAppointmentSite ? "返回預約首頁" : "系統資訊"}
      </Link>
    </footer>
  );
}
