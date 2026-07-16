import Link from "next/link";
import { appVersion } from "@/lib/appVersion";

const coreFeatures = [
  "年度行事曆",
  "活動與例會管理",
  "程序模板管理",
  "社友與年度職務管理",
  "長假與出席管理",
  "社費費率與批次建立",
  "個人費用與捐獻明細",
  "Accounting V3.5 智慧會計",
  "資產負債與月底檢查",
  "Jade AI 智慧秘書",
  "年度交接精靈",
  "多語系架構預留",
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <section className="mx-auto max-w-md space-y-6 text-center">
        <Link href="/" className="block text-left text-sm font-bold text-[#173B73]/75">
          返回首頁
        </Link>

        <div className="rounded-3xl bg-white/85 p-8 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
          <h1 className="text-3xl font-bold">{appVersion.fullVersion}</h1>
          <p className="mt-3 text-base font-semibold text-[#173B73]/75">
            高雄晨光扶輪社年度社務管理系統
          </p>
          <p className="mt-1 text-sm font-semibold text-[#173B73]/60">
            Release {appVersion.release}
          </p>

          <div className="mt-7 text-left">
            <h2 className="text-lg font-bold">核心功能</h2>
            <ul className="mt-3 grid grid-cols-1 gap-2 text-sm font-semibold text-[#173B73]/80 sm:grid-cols-2">
              {coreFeatures.map((feature) => (
                <li key={feature} className="rounded-xl bg-[#F8F3E8] px-3 py-2">
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 space-y-6 text-sm font-semibold text-[#173B73]/80">
            <div>
              <p className="text-[#C99700]">Developed by</p>
              <p className="mt-1 text-lg font-bold">{appVersion.developer}</p>
            </div>

            <div>
              <p className="text-[#C99700]">Powered by</p>
              <p className="mt-1 text-lg font-bold">{appVersion.assistantName}</p>
            </div>

            <div className="pt-4 text-xs leading-6 text-gray-500">
              <p>{appVersion.copyright}</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
