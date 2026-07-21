import Link from "next/link";
import { appVersion } from "@/lib/appVersion";

const menuItems = [
  { label: "年度行事曆", href: "/calendar" },
  { label: "📄 程序表", href: "/programs" },
  { label: "👥 社友管理", href: "/members" },
  { label: "💰 社費管理", href: "/dues" },
  { label: "📊 會計收支", href: "/accounting" },
  { label: "❤️ 年度捐獻計畫", href: "/donations" },
  { label: "Jade AI 助理", href: "/assistant" },
  { label: "年度交接精靈", href: "/year-transition" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <section className="mx-auto max-w-md">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold tracking-[0.3em]">高雄晨光扶輪社</p>
          <h1 className="mt-3 text-3xl font-bold">{appVersion.productName}</h1>
          <p className="mt-2 text-sm font-semibold text-[#173B73]/70">
            高雄晨光扶輪社智慧秘書系統
          </p>
        </div>

        <div className="mb-6 rounded-3xl bg-white/80 p-6 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
          <p className="text-sm font-semibold text-[#C99700]">{appVersion.fullVersion}</p>
          <h2 className="mt-2 text-2xl font-bold">年度社務工作台</h2>
          <div className="mt-4 space-y-3 text-base font-semibold leading-7 text-[#173B73]/80">
            <p>
              整合年度行事曆、例會程序表、社友管理、<br />
              社費管理及年度公益捐獻計畫。
            </p>
            <p>
              提供雲端同步、A4 程序表、PDF 匯出<br />
              與 AI 智慧秘書功能。
            </p>
            <p>打造扶輪社數位化管理平台。</p>
          </div>
        </div>

        <nav className="grid grid-cols-2 gap-4">
          {menuItems.map((item) => (
            <Link
              href={item.href}
              key={item.label}
              className="rounded-2xl bg-[#F7C948] px-3 py-5 text-center font-bold text-[#173B73] shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.8)] active:translate-y-1 active:shadow-inner"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-4">
          <Link
            href="/donate"
            className="block rounded-2xl bg-white px-4 py-3 text-center text-sm font-bold text-[#173B73] shadow-[6px_6px_12px_rgba(0,0,0,0.14),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner"
          >
            🔗 社友捐獻登記連結
          </Link>
        </div>
      </section>
    </main>
  );
}
