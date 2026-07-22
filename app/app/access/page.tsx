"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppRole, roleLabels } from "@/lib/auth";
import { formatMemberName, Member } from "@/lib/members";
import { fetchMembers } from "@/lib/supabaseData";
import { supabase } from "@/src/lib/supabase";

type UserRow = { user_id: string; email: string; display_name: string; role: AppRole; member_id: string | null; is_active: boolean };
const buttonShadow = "shadow-[5px_5px_10px_rgba(0,0,0,0.15),-4px_-4px_9px_rgba(255,255,255,0.85)] active:translate-y-1";

export default function AccessPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const timerId = window.setTimeout(() => void (async () => {
      const [{ data, error }, loadedMembers] = await Promise.all([
        supabase.from("app_users").select("user_id, email, display_name, role, member_id, is_active").order("created_at"),
        fetchMembers(),
      ]);
      if (error) setMessage(`權限資料讀取失敗：${error.message}`);
      else { setUsers((data ?? []) as UserRow[]); setMembers(loadedMembers); }
    })(), 0);
    return () => window.clearTimeout(timerId);
  }, []);

  async function updateUser(userId: string, changes: Partial<UserRow>) {
    setMessage("");
    const { data, error } = await supabase.from("app_users").update(changes).eq("user_id", userId).select("user_id, email, display_name, role, member_id, is_active").single();
    if (error) setMessage(`權限更新失敗：${error.message}`);
    else { setUsers((rows) => rows.map((row) => row.user_id === userId ? data as UserRow : row)); setMessage("身分權限已更新。"); }
  }

  return <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]"><section className="mx-auto max-w-2xl space-y-5">
    <Link href="/" className="text-sm font-bold text-[#173B73]/70">回首頁</Link>
    <header><p className="text-sm font-bold text-[#C99700]">執行秘書專用</p><h1 className="mt-2 text-3xl font-bold">身分權限管理</h1><p className="mt-2 font-semibold text-[#173B73]/70">設定登入角色，並連結對應社友資料。</p></header>
    {message ? <p className="rounded-2xl bg-white p-4 text-sm font-bold">{message}</p> : null}
    <div className="space-y-4">{users.map((user) => <article key={user.user_id} className="rounded-3xl bg-white p-5 shadow-lg">
      <p className="font-bold">{user.display_name || user.email}</p><p className="mt-1 text-sm text-[#173B73]/65">{user.email}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label><span className="text-sm font-bold">角色</span><select value={user.role} onChange={(event) => void updateUser(user.user_id, { role: event.target.value as AppRole })} className="mt-2 w-full rounded-xl border border-[#E5D9BD] bg-white px-3 py-3">{(Object.keys(roleLabels) as AppRole[]).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
        <label><span className="text-sm font-bold">連結社友資料</span><select value={user.member_id ?? ""} onChange={(event) => void updateUser(user.user_id, { member_id: event.target.value || null })} className="mt-2 w-full rounded-xl border border-[#E5D9BD] bg-white px-3 py-3"><option value="">尚未連結</option>{members.map((member) => <option key={member.id} value={member.id}>{formatMemberName(member)}</option>)}</select></label>
      </div>
      <button type="button" onClick={() => void updateUser(user.user_id, { is_active: !user.is_active })} className={`mt-4 rounded-xl px-4 py-2 text-sm font-bold ${user.is_active ? "bg-white text-red-700" : "bg-[#F7C948]"} ${buttonShadow}`}>{user.is_active ? "停用帳號" : "啟用帳號"}</button>
    </article>)}{users.length === 0 && !message ? <p className="rounded-2xl bg-white p-5 text-center font-semibold">尚無登入帳號。</p> : null}</div>
  </section></main>;
}

