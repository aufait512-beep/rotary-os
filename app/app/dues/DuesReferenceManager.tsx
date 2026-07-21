"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";

type ReferenceDocument = {
  id: string;
  storage_path: string;
  file_name: string;
  updated_at: string;
};

const BUCKET = "dues-reference";
const DOCUMENT_ID = "current-dues-reference";
const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.16),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

export function DuesReferenceManager() {
  const [document, setDocument] = useState<ReferenceDocument | null>(null);
  const [isManaging, setIsManaging] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function loadDocument() {
    const { data, error } = await supabase
      .from("dues_reference_documents")
      .select("id, storage_path, file_name, updated_at")
      .eq("id", DOCUMENT_ID)
      .maybeSingle();
    if (error) {
      setMessage(`收費明細參考圖讀取失敗：${error.message}`);
      return;
    }
    setDocument(data as ReferenceDocument | null);
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => void loadDocument(), 0);
    return () => window.clearTimeout(timerId);
  }, []);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMessage("請上傳 PNG、JPG 或 WEBP 圖片。");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage("圖片不可超過 10MB。");
      return;
    }

    setIsBusy(true);
    setMessage("");
    const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const newPath = `current/dues-reference-${Date.now()}.${extension}`;
    try {
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(newPath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data, error: saveError } = await supabase
        .from("dues_reference_documents")
        .upsert({
          id: DOCUMENT_ID,
          storage_path: newPath,
          file_name: file.name,
          updated_at: new Date().toISOString(),
        })
        .select("id, storage_path, file_name, updated_at")
        .single();
      if (saveError) {
        await supabase.storage.from(BUCKET).remove([newPath]);
        throw saveError;
      }

      const oldPath = document?.storage_path;
      setDocument(data as ReferenceDocument);
      setMessage(oldPath ? "收費明細參考圖已抽換。" : "收費明細參考圖已上傳。");
      if (oldPath && oldPath !== newPath) await supabase.storage.from(BUCKET).remove([oldPath]);
      setIsManaging(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "圖片上傳失敗");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRemove() {
    if (!document || !window.confirm("確定移除目前的收費明細參考圖？")) return;
    setIsBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.from("dues_reference_documents").delete().eq("id", DOCUMENT_ID);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([document.storage_path]);
      setDocument(null);
      setMessage("收費明細參考圖已移除。");
      setIsManaging(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "圖片移除失敗");
    } finally {
      setIsBusy(false);
    }
  }

  const imageUrl = document
    ? `${supabase.storage.from(BUCKET).getPublicUrl(document.storage_path).data.publicUrl}?v=${encodeURIComponent(document.updated_at)}`
    : "";

  return (
    <section className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">扶輪社收費明細參考</h2>
          <p className="mt-1 text-sm font-semibold text-[#173B73]/65">可隨年度或費率調整自行上傳抽換。</p>
        </div>
        <button
          type="button"
          onClick={() => setIsManaging((value) => !value)}
          className={`shrink-0 rounded-2xl bg-[#F7C948] px-4 py-2 text-sm font-bold ${buttonShadow}`}
        >
          {isManaging ? "收合" : document ? "抽換圖片" : "上傳圖片"}
        </button>
      </div>

      {document ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-[#E5D9BD] bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="扶輪社收費明細參考" className="h-auto w-full object-contain" />
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-[#C99700] bg-[#F8F3E8] p-6 text-center text-sm font-bold text-[#173B73]/65">
          尚未上傳收費明細參考圖
        </div>
      )}

      {isManaging ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={`cursor-pointer rounded-2xl bg-[#F7C948] px-4 py-3 text-center font-bold ${buttonShadow} ${isBusy ? "pointer-events-none opacity-60" : ""}`}>
            {isBusy ? "處理中…" : document ? "選擇新圖片抽換" : "選擇圖片上傳"}
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleUpload} className="sr-only" disabled={isBusy} />
          </label>
          {document ? (
            <button type="button" onClick={handleRemove} disabled={isBusy} className={`rounded-2xl bg-white px-4 py-3 font-bold text-red-700 disabled:opacity-60 ${buttonShadow}`}>
              移除目前圖片
            </button>
          ) : null}
        </div>
      ) : null}

      {message ? <p className="mt-3 rounded-2xl bg-[#F8F3E8] p-3 text-sm font-bold">{message}</p> : null}
    </section>
  );
}
