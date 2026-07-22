"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";

export default function LoginPage() {
  const { profile, isLoading, signInWithGoogle, signOut } = useAuth();
  const [error, setError] = useState("");

  async function login() {
    try {
      setError("");
      await signInWithGoogle();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "登入失敗");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#F8F3E8] px-5 text-[#173B73]">
      <section className="w-full max-w-sm rounded-3xl bg-white/90 p-7 text-center shadow-xl">
        <p className="text-sm font-bold tracking-[0.25em] text-[#C99700]">ROTARY OS</p>
        <h1 className="mt-3 text-3xl font-bold">高雄晨光扶輪社</h1>
        <p className="mt-3 font-semibold text-[#173B73]/70">請使用核准的 Google 帳號登入</p>
        {isLoading ? <p className="mt-6 font-bold">正在確認登入狀態…</p> : profile ? (
          <div className="mt-6 space-y-3">
            <Link href="/" className="block rounded-2xl bg-[#F7C948] px-4 py-3 font-bold">進入 Rotary OS</Link>
            <button type="button" onClick={() => void signOut()} className="text-sm font-bold">改用其他帳號</button>
          </div>
        ) : (
          <button type="button" onClick={() => void login()} className="mt-6 w-full rounded-2xl bg-[#F7C948] px-4 py-4 font-bold shadow-lg active:translate-y-1">
            使用 Google 登入
          </button>
        )}
        {error ? <p className="mt-4 text-sm font-bold text-red-700">{error}</p> : null}
      </section>
    </main>
  );
}
