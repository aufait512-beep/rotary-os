"use client";

import { useEffect, useState } from "react";
import {
  fetchProgramTemplates,
  ProgramTemplate,
  ProgramTemplateBlock,
  updateProgramTemplateBlock,
} from "@/lib/programTemplates";

export function ProgramTemplateManager({
  rotaryYearId,
  onTemplatesChanged,
}: {
  rotaryYearId: string;
  onTemplatesChanged?: (templates: ProgramTemplate[]) => void;
}) {
  const [templates, setTemplates] = useState<ProgramTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  async function load() {
    if (!rotaryYearId) return;
    try {
      const loaded = await fetchProgramTemplates(rotaryYearId);
      const activeTemplates = loaded.filter((template) => template.isActive);
      setTemplates(activeTemplates);
      onTemplatesChanged?.(loaded);
      setSelectedId((current) => current || loaded[0]?.id || "");
      setNotice("");
    } catch {
      setNotice("模板資料尚未完成部署；目前程序表仍可使用內建安全模板。");
    }
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotaryYearId]);

  const selected = templates.find((template) => template.id === selectedId);

  async function saveBlock(block: ProgramTemplateBlock) {
    try {
      await updateProgramTemplateBlock(block);
      await load();
      setNotice("程序區塊已儲存。");
    } catch {
      setNotice("儲存失敗，請確認 Supabase migration 已執行。");
    }
  }

  return (
    <section className="mx-auto max-w-3xl rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)] print:hidden">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-center justify-between text-left text-xl font-bold"
      >
        <span>程序模板管理</span>
        <span aria-hidden>{isOpen ? "收合" : "展開"}</span>
      </button>

      {notice ? <p className="mt-3 rounded-2xl bg-[#F8F3E8] p-3 text-sm font-bold">{notice}</p> : null}

      {isOpen ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-2 sm:grid-cols-5">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedId(template.id)}
                className={`rounded-2xl px-3 py-3 text-sm font-bold ${selectedId === template.id ? "bg-[#F7C948]" : "bg-[#F8F3E8]"}`}
              >
                {template.name}
              </button>
            ))}
          </div>

          {selected ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-[#173B73]/70">可調整時間、文字、順序與是否顯示；歷史程序表不會被刪除。</p>
              {selected.blocks.map((block, index) => (
                <BlockEditor
                  key={`${block.id}-${block.title}-${block.sortOrder}-${block.isActive}`}
                  block={block}
                  canMoveUp={index > 0}
                  canMoveDown={index < selected.blocks.length - 1}
                  onSave={saveBlock}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm font-semibold">尚無可用模板。請先執行本次 Supabase migration。</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function BlockEditor({
  block,
  canMoveUp,
  canMoveDown,
  onSave,
}: {
  block: ProgramTemplateBlock;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSave: (block: ProgramTemplateBlock) => Promise<void>;
}) {
  const [draft, setDraft] = useState(block);

  return (
    <article className="rounded-2xl border border-[#E5D9BD] bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-[90px_1fr_auto]">
        <input
          aria-label="時間"
          type="time"
          value={draft.startTime}
          onChange={(event) => setDraft({ ...draft, startTime: event.target.value })}
          className="rounded-xl border border-[#E5D9BD] px-3 py-2"
        />
        <input
          aria-label="程序名稱"
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          className="rounded-xl border border-[#E5D9BD] px-3 py-2 font-bold"
        />
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />
          顯示
        </label>
      </div>
      <textarea
        aria-label="程序內容"
        value={draft.content}
        onChange={(event) => setDraft({ ...draft, content: event.target.value })}
        rows={2}
        className="mt-3 w-full rounded-xl border border-[#E5D9BD] px-3 py-2"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={!canMoveUp} onClick={() => setDraft({ ...draft, sortOrder: draft.sortOrder - 15 })} className="rounded-xl bg-[#F8F3E8] px-3 py-2 text-sm font-bold disabled:opacity-40">上移</button>
        <button type="button" disabled={!canMoveDown} onClick={() => setDraft({ ...draft, sortOrder: draft.sortOrder + 15 })} className="rounded-xl bg-[#F8F3E8] px-3 py-2 text-sm font-bold disabled:opacity-40">下移</button>
        <button type="button" onClick={() => void onSave(draft)} className="ml-auto rounded-xl bg-[#F7C948] px-4 py-2 text-sm font-bold">儲存區塊</button>
      </div>
    </article>
  );
}
