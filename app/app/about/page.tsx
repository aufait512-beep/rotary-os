import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <section className="mx-auto max-w-md space-y-6 text-center">
        <Link href="/" className="block text-left text-sm font-bold text-[#173B73]/75">
          返回首頁
        </Link>

        <div className="rounded-3xl bg-white/85 p-8 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
          <h1 className="text-3xl font-bold">Rotary OS</h1>
          <p className="mt-3 text-base font-semibold text-[#173B73]/75">
            Version 1.0.0
          </p>
          <p className="mt-1 text-sm font-semibold text-[#173B73]/60">
            Release 2026.07
          </p>

          <div className="mt-8 space-y-6 text-sm font-semibold text-[#173B73]/80">
            <div>
              <p className="text-[#C99700]">Developed by</p>
              <p className="mt-1 text-lg font-bold">Jadecode Studio</p>
            </div>

            <div>
              <p className="text-[#C99700]">Powered by</p>
              <p className="mt-1 text-lg font-bold">Jane AI</p>
            </div>

            <div className="pt-4 text-xs leading-6 text-gray-500">
              <p>Copyright © 2026 Jadecode Studio.</p>
              <p>All Rights Reserved.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
