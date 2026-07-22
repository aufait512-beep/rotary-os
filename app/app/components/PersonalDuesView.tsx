"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { supabase } from "@/src/lib/supabase";

type DuesRow = {
  id: string;
  period_month: string;
  previous_balance: number;
  current_due: number;
  paid_amount: number;
  discount_amount: number;
  payment_date: string | null;
};

export function PersonalDuesView() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<DuesRow[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const memberId = profile?.memberId;
    const timerId = window.setTimeout(() => void (async () => {
      if (!memberId) {
        setMessage("此登入帳號尚未連結社友資料，請聯絡執行秘書設定。");
        return;
      }
      const { data, error } = await supabase
        .from("dues_records")
        .select("id, period_month, previous_balance, current_due, paid_amount, discount_amount, payment_date")
        .eq("member_id", memberId)
        .order("period_month", { ascending: false });
      if (error) setMessage(`個人社費狀態讀取失敗：${error.message}`);
      else setRows((data ?? []) as DuesRow[]);
    })(), 0);
    return () => window.clearTimeout(timerId);
  }, [profile?.memberId]);

  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <section className="mx-auto max-w-md space-y-5">
        <Link href="/" className="text-sm font-bold text-[#173B73]/70">回首頁</Link>
        <header><p className="text-sm font-bold text-[#C99700]">唯讀資料</p><h1 className="mt-2 text-3xl font-bold">我的社費狀態</h1></header>
        <p className="rounded-2xl bg-white p-4 text-sm font-semibold">此頁僅供本人查看，無法編輯或更改。</p>
        {message ? <p className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-[#A35C00]">{message}</p> : null}
        {rows.map((row) => {
          const due = Number(row.previous_balance || 0) + Number(row.current_due || 0);
          const completed = Number(row.paid_amount || 0) + Number(row.discount_amount || 0);
          const remaining = Math.max(0, due - completed);
          return (
            <article key={row.id} className="rounded-3xl bg-white p-5 shadow-lg">
              <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{row.period_month}</h2><span className={`rounded-full px-3 py-1 text-xs font-bold ${remaining > 0 ? "bg-[#FFF2C2]" : "bg-emerald-100 text-emerald-800"}`}>{remaining > 0 ? "尚待完成" : "已完成"}</span></div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Amount label="前期未繳" value={row.previous_balance} />
                <Amount label="本期應繳" value={row.current_due} />
                <Amount label="已完成金額" value={row.paid_amount} />
                <Amount label="尚待完成" value={remaining} />
              </div>
              {row.payment_date ? <p className="mt-3 text-xs font-semibold text-[#173B73]/65">完成日期：{row.payment_date}</p> : null}
            </article>
          );
        })}
        {!message && rows.length === 0 ? <p className="rounded-2xl bg-white p-5 text-center font-semibold">目前沒有社費紀錄。</p> : null}
      </section>
    </main>
  );
}

function Amount({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-[#F8F3E8] p-3"><p className="text-xs font-semibold text-[#173B73]/65">{label}</p><p className="mt-1 font-bold">NT$ {Number(value || 0).toLocaleString("zh-TW")}</p></div>;
}
