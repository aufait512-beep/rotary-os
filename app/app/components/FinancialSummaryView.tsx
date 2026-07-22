"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";

type FinancialSummary = {
  rotaryYear: string;
  month: string;
  annualIncomeBudget: number;
  annualExpenseBudget: number;
  monthIncome: number;
  monthExpense: number;
  monthBalance: number;
};

export function FinancialSummaryView() {
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const timerId = window.setTimeout(() => void (async () => {
      const { data, error } = await supabase.rpc("get_current_financial_summary");
      if (error) setMessage(`財務摘要讀取失敗：${error.message}`);
      else setSummary(data as FinancialSummary);
    })(), 0);
    return () => window.clearTimeout(timerId);
  }, []);
  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <section className="mx-auto max-w-md space-y-5">
        <Link href="/" className="text-sm font-bold text-[#173B73]/70">回首頁</Link>
        <header><p className="text-sm font-bold text-[#C99700]">唯讀摘要</p><h1 className="mt-2 text-3xl font-bold">年度預算與本月收支</h1></header>
        <p className="rounded-2xl bg-white p-4 text-sm font-semibold">僅顯示年度預算及本月收支合計，不提供交易、傳票或銀行明細。</p>
        {message ? <p className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{message}</p> : null}
        {summary ? <div className="grid grid-cols-2 gap-4">
          <SummaryCard label="年度收入預算" value={summary.annualIncomeBudget} />
          <SummaryCard label="年度支出預算" value={summary.annualExpenseBudget} />
          <SummaryCard label="本月收入" value={summary.monthIncome} />
          <SummaryCard label="本月支出" value={summary.monthExpense} />
          <div className="col-span-2"><SummaryCard label="本月結餘" value={summary.monthBalance} /></div>
        </div> : null}
        {summary ? <p className="text-center text-sm font-bold text-[#173B73]/65">{summary.rotaryYear}｜{summary.month}</p> : null}
      </section>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-3xl bg-white p-5 shadow-lg"><p className="text-sm font-semibold text-[#173B73]/65">{label}</p><p className="mt-2 text-xl font-bold">NT$ {Number(value || 0).toLocaleString("zh-TW")}</p></div>;
}
