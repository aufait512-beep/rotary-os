"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { canManageEvents, isExecutiveSecretary, roleLabels } from "@/lib/auth";
import { FinancialSummaryView } from "./FinancialSummaryView";
import { PersonalDuesView } from "./PersonalDuesView";
import { useAuth } from "./AuthProvider";

const publicPaths = ["/login", "/donate", "/calendar"];
const executiveOnlyPaths = ["/programs", "/members", "/donations", "/assistant", "/year-transition", "/access"];

export function AppAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, isLoading, signOut } = useAuth();
  const isPublicPath = pathname === "/" || publicPaths.some((path) => pathname.startsWith(path));
  if (isPublicPath) return children;
  if (isLoading) return <AccessMessage title="正在確認身分…" />;
  if (!profile) return <AccessMessage title="請先登入 Rotary OS" actionHref="/login" actionLabel="前往登入" />;
  if (!profile.isActive) return <AccessMessage title="此帳號尚未啟用" detail="請聯絡執行秘書確認使用權限。" />;

  if (pathname === "/dues" && !isExecutiveSecretary(profile.role)) return <PersonalDuesView />;
  if (pathname === "/accounting" && !isExecutiveSecretary(profile.role)) return <FinancialSummaryView />;
  if (pathname.startsWith("/events") && !canManageEvents(profile.role)) return <AccessMessage title="年度活動僅供社友查看" detail="新增與編輯活動由執行秘書或社長處理。" actionHref="/calendar" actionLabel="查看年度行事曆" />;
  if (executiveOnlyPaths.some((path) => pathname.startsWith(path)) && !isExecutiveSecretary(profile.role)) {
    return <AccessMessage title="此功能由執行秘書管理" actionHref="/" actionLabel="回到首頁" />;
  }

  return (
    <>
      <div className="fixed right-3 top-3 z-50 flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-xs font-bold text-[#173B73] shadow-lg print:hidden">
        <span>{roleLabels[profile.role]}</span>
        <button type="button" onClick={() => void signOut()} className="text-[#A35C00]">登出</button>
      </div>
      {children}
    </>
  );
}

function AccessMessage({ title, detail = "", actionHref, actionLabel }: { title: string; detail?: string; actionHref?: string; actionLabel?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#F8F3E8] px-5 text-[#173B73]">
      <section className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-xl">
        <h1 className="text-2xl font-bold">{title}</h1>
        {detail ? <p className="mt-3 font-semibold text-[#173B73]/70">{detail}</p> : null}
        {actionHref ? <Link href={actionHref} className="mt-5 block rounded-2xl bg-[#F7C948] px-4 py-3 font-bold">{actionLabel}</Link> : null}
      </section>
    </main>
  );
}
