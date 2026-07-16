"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RotaryYear } from "@/lib/events";
import { memberRoleOptions, MemberRoleType } from "@/lib/memberFeeRules";
import { fetchRotaryYears, upsertRotaryYear } from "@/lib/supabaseData";
import {
  defaultTransitionSelections,
  executeYearTransition,
  fetchYearTransitionHistory,
  fetchYearTransitionPreview,
  transitionModuleOptions,
  TransitionModuleKey,
  TransitionPreview,
  TransitionRoleMapping,
  TransitionSelections,
  TransitionTargetDraft,
} from "@/lib/yearTransition";

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

type HistoryRow = Record<string, unknown>;

export default function YearTransitionPage() {
  const [years, setYears] = useState<RotaryYear[]>([]);
  const [sourceYearId, setSourceYearId] = useState("");
  const [targetMode, setTargetMode] = useState<"existing" | "new">("existing");
  const [targetYearId, setTargetYearId] = useState("");
  const [targetDraft, setTargetDraft] = useState<TransitionTargetDraft>({
    name: "",
    displayName: "",
    startDate: "",
    endDate: "",
  });
  const [selections, setSelections] = useState<TransitionSelections>({
    ...defaultTransitionSelections,
  });
  const [budgetMode, setBudgetMode] = useState<"structure_only" | "with_amounts">(
    "structure_only"
  );
  const [feeConflictMode, setFeeConflictMode] = useState<
    "skip" | "insert_missing" | "update_selected"
  >("insert_missing");
  const [feeRuleUpdateIds, setFeeRuleUpdateIds] = useState<string[]>([]);
  const [roleMappings, setRoleMappings] = useState<TransitionRoleMapping[]>([]);
  const [carryForward, setCarryForward] = useState(false);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<TransitionPreview | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [completedTargetYearId, setCompletedTargetYearId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const sourceYear = years.find((year) => year.id === sourceYearId);
  const existingTargets = years.filter((year) => year.id !== sourceYearId);
  const selectedTargetYear = years.find((year) => year.id === targetYearId);
  const effectiveTarget = targetMode === "existing" ? selectedTargetYear : targetDraft;
  const includedRoleCount = roleMappings.filter(
    (mapping) => mapping.include && mapping.targetRoleType
  ).length;

  const configureTargetForSource = useCallback((source: RotaryYear, availableYears: RotaryYear[]) => {
    const nextExisting = availableYears.find(
      (year) => year.id !== source.id && year.startDate > source.endDate
    );
    setTargetYearId(nextExisting?.id ?? "");
    setTargetMode(nextExisting ? "existing" : "new");
    setTargetDraft(suggestNextYear(source));
    setPreview(null);
    setResult(null);
  }, []);

  const loadInitialData = useCallback(async () => {
    try {
      setErrorMessage("");
      const loadedYears = await fetchRotaryYears();
      setYears(loadedYears);
      const initialSource =
        loadedYears.find((year) => year.isActive) ?? loadedYears[0];
      if (initialSource) {
        setSourceYearId(initialSource.id);
        configureTargetForSource(initialSource, loadedYears);
      }
      try {
        setHistory(await fetchYearTransitionHistory());
      } catch {
        setHistory([]);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "年度資料讀取失敗"));
    }
  }, [configureTargetForSource]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadInitialData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadInitialData]);

  function handleSourceYearChange(yearId: string) {
    setSourceYearId(yearId);
    const nextSource = years.find((year) => year.id === yearId);
    if (nextSource) configureTargetForSource(nextSource, years);
  }

  function invalidatePreview() {
    setPreview(null);
    setResult(null);
    setSuccessMessage("");
  }

  function updateSelection(key: TransitionModuleKey, checked: boolean) {
    setSelections((current) => ({ ...current, [key]: checked }));
    invalidatePreview();
  }

  function setAllSelections(checked: boolean) {
    setSelections(
      Object.fromEntries(
        transitionModuleOptions.map((option) => [option.key, checked])
      ) as TransitionSelections
    );
    invalidatePreview();
  }

  async function buildPreview() {
    setErrorMessage("");
    setSuccessMessage("");
    setResult(null);
    if (!sourceYear) {
      setErrorMessage("請先選擇來源年度。");
      return;
    }

    const validationError = validateTargetYear({
      years,
      sourceYear,
      targetMode,
      targetYearId,
      targetDraft,
    });
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    if (!effectiveTarget) {
      setErrorMessage("請先選擇或建立目標年度。");
      return;
    }

    try {
      setIsLoading(true);
      const nextPreview = await fetchYearTransitionPreview(
        sourceYear.id,
        targetMode === "existing" ? targetYearId : null,
        effectiveTarget.startDate,
        effectiveTarget.endDate
      );
      setPreview(nextPreview);
      setRoleMappings(nextPreview.roleMappings);
      setFeeRuleUpdateIds([]);
      setCarryForward(false);
      setSuccessMessage("交接預覽已建立，尚未寫入任何資料。");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "交接預覽建立失敗"));
    } finally {
      setIsLoading(false);
    }
  }

  function updateRoleMapping(
    sourceRoleId: string,
    patch: Partial<TransitionRoleMapping>
  ) {
    setRoleMappings((current) =>
      current.map((mapping) =>
        mapping.sourceRoleId === sourceRoleId ? { ...mapping, ...patch } : mapping
      )
    );
  }

  async function runTransition() {
    if (!preview || !sourceYear || !effectiveTarget) {
      setErrorMessage("請先建立並確認交接預覽。");
      return;
    }
    const confirmed = window.confirm("確認建立新扶輪年度並帶入所選設定？");
    if (!confirmed) return;
    const confirmedAgain = window.confirm(
      `再次確認：來源 ${sourceYear.displayName}，目標 ${effectiveTarget.displayName}。不會複製活動、交易或出席資料。`
    );
    if (!confirmedAgain) return;

    try {
      setIsExecuting(true);
      setErrorMessage("");
      setSuccessMessage("");
      const response = await executeYearTransition({
        sourceYearId: sourceYear.id,
        targetYearId: targetMode === "existing" ? targetYearId : null,
        targetYear: targetMode === "new" ? targetDraft : null,
        selections,
        roleMappings,
        budgetMode,
        feeConflictMode,
        feeRuleUpdateIds,
        carryForwardAmount: carryForward ? preview.retainedSurplus : null,
        note,
      });
      setResult(response as unknown as Record<string, unknown>);
      setCompletedTargetYearId(response.target_year_id);
      setSuccessMessage("年度交接完成。新年度尚未設為目前年度。");
      const [loadedYears, loadedHistory] = await Promise.all([
        fetchRotaryYears(),
        fetchYearTransitionHistory(),
      ]);
      setYears(loadedYears);
      setHistory(loadedHistory);
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "年度交接失敗；資料庫交易已回復，不會留下部分交接資料")
      );
    } finally {
      setIsExecuting(false);
    }
  }

  async function activateCompletedYear() {
    const target = years.find((year) => year.id === completedTargetYearId);
    if (!target) {
      setErrorMessage("找不到已完成交接的目標年度，請重新整理後再試。");
      return;
    }
    const confirmed = window.confirm(`是否將 ${target.displayName} 設為目前年度？`);
    if (!confirmed) return;
    try {
      const saved = await upsertRotaryYear({ ...target, isActive: true });
      setYears((current) =>
        current.map((year) => ({ ...year, isActive: year.id === saved.id }))
      );
      setSuccessMessage(`${saved.displayName} 已設為目前年度，舊年度資料仍完整保留。`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "目前年度切換失敗"));
    }
  }

  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-3">
          <Link href="/" className="text-sm font-bold text-[#173B73]/75">
            回首頁
          </Link>
          <p className="text-sm font-bold tracking-[0.18em] text-[#C99700]">
            Rotary OS Beta 1.0
          </p>
          <h1 className="text-3xl font-bold">年度交接精靈</h1>
          <p className="max-w-2xl font-semibold text-[#173B73]/70">
            先預覽，再由秘書確認建立下一年度設定。來源年度資料不會被修改。
          </p>
        </header>

        {errorMessage ? <Message tone="error">{errorMessage}</Message> : null}
        {successMessage ? <Message tone="success">{successMessage}</Message> : null}

        <section className="rounded-3xl bg-white/90 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
          <h2 className="text-xl font-bold">1. 選擇來源與目標年度</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField
              label="來源年度"
              value={sourceYearId}
              onChange={handleSourceYearChange}
              options={years.map((year) => ({
                value: year.id,
                label: `${year.displayName}${year.isActive ? "（目前年度）" : ""}`,
              }))}
            />
            <label className="block">
              <span className="text-sm font-bold">目標年度方式</span>
              <select
                value={targetMode}
                onChange={(event) => {
                  setTargetMode(event.target.value as "existing" | "new");
                  invalidatePreview();
                }}
                className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base"
              >
                <option value="existing">選擇既有年度</option>
                <option value="new">建立下一年度</option>
              </select>
            </label>
          </div>

          {targetMode === "existing" ? (
            <div className="mt-4">
              <SelectField
                label="目標年度"
                value={targetYearId}
                onChange={(value) => {
                  setTargetYearId(value);
                  invalidatePreview();
                }}
                options={existingTargets.map((year) => ({
                  value: year.id,
                  label: year.displayName,
                }))}
              />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField label="年度名稱" value={targetDraft.name} onChange={(value) => {
                setTargetDraft((current) => ({ ...current, name: value })); invalidatePreview();
              }} placeholder="2027-2028" />
              <TextField label="顯示名稱" value={targetDraft.displayName} onChange={(value) => {
                setTargetDraft((current) => ({ ...current, displayName: value })); invalidatePreview();
              }} placeholder="27-28年度" />
              <DateField label="開始日期" value={targetDraft.startDate} onChange={(value) => {
                setTargetDraft((current) => ({ ...current, startDate: value })); invalidatePreview();
              }} />
              <DateField label="結束日期" value={targetDraft.endDate} onChange={(value) => {
                setTargetDraft((current) => ({ ...current, endDate: value })); invalidatePreview();
              }} />
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-white/90 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">2. 選擇交接項目</h2>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAllSelections(true)} className="text-sm font-bold">全部勾選</button>
              <button type="button" onClick={() => setAllSelections(false)} className="text-sm font-bold text-[#173B73]/60">全部取消</button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {transitionModuleOptions.map((option) => (
              <label key={option.key} className="flex min-w-0 items-center gap-3 rounded-2xl bg-[#F8F3E8] px-3 py-3 font-bold">
                <input type="checkbox" checked={selections[option.key]} onChange={(event) => updateSelection(option.key, event.target.checked)} className="h-5 w-5 shrink-0" />
                <span className="break-words">{option.label}</span>
              </label>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <fieldset className="rounded-2xl border border-[#E5D9BD] p-4">
              <legend className="px-2 font-bold">年度預算</legend>
              <Radio label="只複製科目，不複製金額" checked={budgetMode === "structure_only"} onChange={() => { setBudgetMode("structure_only"); invalidatePreview(); }} />
              <Radio label="複製科目及預算金額" checked={budgetMode === "with_amounts"} onChange={() => { setBudgetMode("with_amounts"); invalidatePreview(); }} />
            </fieldset>
            <label className="block rounded-2xl border border-[#E5D9BD] p-4">
              <span className="font-bold">目標年度已有社費規則時</span>
              <select value={feeConflictMode} onChange={(event) => { setFeeConflictMode(event.target.value as typeof feeConflictMode); invalidatePreview(); }} className="mt-3 w-full rounded-xl border border-[#E5D9BD] px-3 py-3">
                <option value="insert_missing">新增缺少規則</option>
                <option value="skip">略過全部社費規則</option>
                <option value="update_selected">人工選擇更新</option>
              </select>
            </label>
          </div>

          <button type="button" onClick={() => void buildPreview()} disabled={isLoading} className={`mt-5 w-full rounded-2xl bg-[#F7C948] py-3 font-bold disabled:opacity-60 ${buttonShadow}`}>
            {isLoading ? "建立預覽中" : "建立交接預覽"}
          </button>
        </section>

        {preview ? (
          <>
            <section className="rounded-3xl bg-white/90 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
              <h2 className="text-xl font-bold">3. 交接預覽</h2>
              <p className="mt-2 text-sm font-semibold text-[#173B73]/70">此畫面仍為只讀預覽，尚未寫入 Supabase。</p>
              {preview.targetHasData ? (
                <Message tone="warning">目標年度已有部分設定。精靈只會新增缺少資料，除非您明確勾選更新社費規則。</Message>
              ) : null}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-sm">
                  <thead><tr className="bg-[#173B73] text-white"><Th>交接項目</Th><Th>來源</Th><Th>目標已有</Th><Th>預計處理</Th></tr></thead>
                  <tbody>
                    {transitionModuleOptions.filter((option) => selections[option.key]).map((option) => {
                      const sourceCount = preview.counts[option.key] ?? 0;
                      const targetCount = preview.targetCounts[option.key] ?? 0;
                      return <tr key={option.key}><Td>{option.label}</Td><Td>{sourceCount}</Td><Td>{targetCount}</Td><Td>{previewAction(option.key, sourceCount, targetCount)}</Td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {selections.member_roles ? (
              <section className="rounded-3xl bg-white/90 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
                <h2 className="text-xl font-bold">年度職務人工確認</h2>
                <p className="mt-2 text-sm font-semibold text-[#173B73]/70">只有「社長當選人 → 社長」與資深身分預先勾選；其他職務不會自動沿用。</p>
                <div className="mt-4 space-y-3">
                  {roleMappings.length === 0 ? <p className="rounded-2xl bg-[#F8F3E8] p-4 font-bold">來源年度尚無職務資料。</p> : roleMappings.map((mapping) => (
                    <article key={mapping.sourceRoleId} className="min-w-0 rounded-2xl border border-[#E5D9BD] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold">{mapping.memberName}</p><p className="text-sm text-[#173B73]/70">來源：{mapping.sourceRoleLabel}</p></div><label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={mapping.include} onChange={(event) => updateRoleMapping(mapping.sourceRoleId, { include: event.target.checked })} className="h-5 w-5" />帶入</label></div>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                        <label className="block"><span className="text-sm font-bold">目標年度職務</span><select value={mapping.targetRoleType} onChange={(event) => updateRoleMapping(mapping.sourceRoleId, { targetRoleType: event.target.value as MemberRoleType | "" })} className="mt-2 w-full rounded-xl border border-[#E5D9BD] px-3 py-2"><option value="">尚未指定</option>{memberRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                        <DateField label="開始日期" value={mapping.startDate} onChange={(value) => updateRoleMapping(mapping.sourceRoleId, { startDate: value })} />
                        <DateField label="結束日期" value={mapping.endDate} onChange={(value) => updateRoleMapping(mapping.sourceRoleId, { endDate: value })} />
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {selections.fee_rules && feeConflictMode === "update_selected" ? (
              <section className="rounded-3xl bg-white/90 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
                <h2 className="text-xl font-bold">社費費率衝突確認</h2>
                <div className="mt-4 space-y-2">{preview.feeRules.map((rule) => <label key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F8F3E8] p-3"><span className="font-bold">{feeRuleText(rule)}：{formatCurrency(rule.amount)}{rule.targetExists ? `（目標目前 ${formatCurrency(rule.targetAmount ?? 0)}）` : "（新增）"}</span><input type="checkbox" disabled={!rule.targetExists} checked={feeRuleUpdateIds.includes(rule.id)} onChange={(event) => setFeeRuleUpdateIds((current) => event.target.checked ? [...current, rule.id] : current.filter((id) => id !== rule.id))} className="h-5 w-5" /></label>)}</div>
              </section>
            ) : null}

            <section className="rounded-3xl bg-white/90 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
              <h2 className="text-xl font-bold">4. 最終確認</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Summary label="程序模板" value={preview.counts.program_templates} />
                <Summary label="程序區塊" value={preview.counts.program_block_count} />
                <Summary label="會計科目" value={preview.counts.accounting_income + preview.counts.accounting_expense} />
                <Summary label="資產負債科目" value={preview.counts.balance_categories} />
                <Summary label="社費規則" value={preview.counts.fee_rules} />
                <Summary label="確認職務" value={includedRoleCount} />
                <Summary label="會計帳戶" value={preview.counts.accounting_accounts} />
                <Summary label="其他設定" value={preview.counts.checklist_templates + preview.counts.report_settings + preview.counts.brand_settings + preview.counts.language_settings} />
              </div>
              <label className="mt-4 flex items-start gap-3 rounded-2xl bg-[#F8F3E8] p-4 font-bold"><input type="checkbox" checked={carryForward} disabled={preview.retainedSurplus === null} onChange={(event) => setCarryForward(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" /><span>由上一年度期末帶入歷屆累計餘絀：{preview.retainedSurplus === null ? "尚無期末快照" : formatCurrency(preview.retainedSurplus)}</span></label>
              <label className="mt-4 block"><span className="text-sm font-bold">交接備註</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-2 w-full resize-none rounded-2xl border border-[#E5D9BD] px-4 py-3" /></label>
              <button type="button" onClick={() => void runTransition()} disabled={isExecuting} className={`mt-5 w-full rounded-2xl bg-[#173B73] py-3 font-bold text-white disabled:opacity-60 ${buttonShadow}`}>{isExecuting ? "交接執行中" : "確認並執行年度交接"}</button>
            </section>
          </>
        ) : null}

        {result ? (
          <section className="rounded-3xl border-2 border-emerald-500 bg-white p-5">
            <h2 className="text-2xl font-bold text-emerald-700">年度交接完成</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Link href="/calendar" className={`rounded-2xl bg-[#F7C948] px-3 py-3 text-center font-bold ${buttonShadow}`}>查看新年度</Link>
              <Link href="/members" className={`rounded-2xl bg-white px-3 py-3 text-center font-bold ${buttonShadow}`}>設定年度職務</Link>
              <Link href="/accounting" className={`rounded-2xl bg-white px-3 py-3 text-center font-bold ${buttonShadow}`}>編輯年度預算</Link>
              <Link href="/assistant" className={`rounded-2xl bg-white px-3 py-3 text-center font-bold ${buttonShadow}`}>檢查社費費率</Link>
              <button type="button" onClick={() => void activateCompletedYear()} className={`rounded-2xl bg-[#173B73] px-3 py-3 font-bold text-white ${buttonShadow}`}>設為目前年度</button>
            </div>
          </section>
        ) : null}

        {history.length > 0 ? (
          <section className="rounded-3xl bg-white/90 p-5">
            <h2 className="text-xl font-bold">最近交接歷程</h2>
            <div className="mt-4 space-y-2">{history.map((row) => <div key={String(row.id)} className="flex flex-wrap justify-between gap-2 rounded-2xl bg-[#F8F3E8] p-3 text-sm font-bold"><span>{yearRelationLabel(row.source)} → {yearRelationLabel(row.target)}</span><span>{transitionStatusLabel(String(row.status))} · {formatDateTime(String(row.created_at ?? ""))}</span></div>)}</div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="block"><span className="text-sm font-bold">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base"><option value="">請選擇</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="block"><span className="text-sm font-bold">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full rounded-2xl border border-[#E5D9BD] px-4 py-3 text-base" /></label>;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="text-sm font-bold">{label}</span><input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#E5D9BD] px-4 py-3 text-base" /></label>;
}

function Radio({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <label className="mt-2 flex items-center gap-3 rounded-xl bg-[#F8F3E8] p-3 font-bold"><input type="radio" checked={checked} onChange={onChange} className="h-5 w-5" />{label}</label>;
}

function Message({ tone, children }: React.PropsWithChildren<{ tone: "error" | "success" | "warning" }>) {
  const styles = tone === "error" ? "border-red-200 bg-red-50 text-red-700" : tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-800";
  return <p className={`mt-4 rounded-2xl border p-4 text-sm font-bold ${styles}`}>{children}</p>;
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl bg-[#F8F3E8] p-3 text-center"><p className="text-xs font-bold text-[#173B73]/65">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>;
}

function Th({ children }: React.PropsWithChildren) { return <th className="border border-[#E5D9BD] px-3 py-2 text-left">{children}</th>; }
function Td({ children }: React.PropsWithChildren) { return <td className="border border-[#E5D9BD] px-3 py-2 font-semibold">{children}</td>; }

function suggestNextYear(source: RotaryYear): TransitionTargetDraft {
  const startYear = Number(source.name.slice(0, 4)) + 1;
  const endYear = startYear + 1;
  return { name: `${startYear}-${endYear}`, displayName: `${String(startYear).slice(2)}-${String(endYear).slice(2)}年度`, startDate: `${startYear}-07-01`, endDate: `${endYear}-06-30` };
}

function validateTargetYear({ years, sourceYear, targetMode, targetYearId, targetDraft }: { years: RotaryYear[]; sourceYear: RotaryYear; targetMode: "existing" | "new"; targetYearId: string; targetDraft: TransitionTargetDraft }) {
  if (targetMode === "existing") return !targetYearId ? "請選擇目標年度。" : targetYearId === sourceYear.id ? "來源年度與目標年度不可相同。" : "";
  if (!targetDraft.name || !targetDraft.displayName || !targetDraft.startDate || !targetDraft.endDate) return "請完整填寫新年度資料。";
  if (targetDraft.endDate < targetDraft.startDate) return "目標年度結束日期不可早於開始日期。";
  if (years.some((year) => year.name === targetDraft.name)) return "年度名稱不可重複。";
  const overlap = years.find((year) => targetDraft.startDate <= year.endDate && targetDraft.endDate >= year.startDate);
  return overlap ? `目標年度日期與 ${overlap.displayName} 重疊。` : "";
}

function previewAction(key: TransitionModuleKey, sourceCount: number, targetCount: number) {
  if (sourceCount === 0) return "略過：來源無資料";
  if (key === "member_roles") return "需人工確認";
  if (targetCount > 0) return "衝突：只新增缺少資料";
  return "新增";
}

function feeRuleText(rule: { feeType: string; conditionType: string; conditionValue: string }) {
  const fee = rule.feeType === "annual_fee" ? "常年費" : "特別捐獻";
  const condition = rule.conditionType === "general" ? "一般" : rule.conditionType === "senior" ? "資深" : rule.conditionType === "long_leave" ? "長假" : rule.conditionValue;
  return `${fee}／${condition}`;
}

function yearRelationLabel(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return "未知年度";
  const year = row as Record<string, unknown>;
  return String(year.display_name || year.name || "未知年度");
}

function transitionStatusLabel(status: string) {
  return ({ completed: "完成", previewed: "已預覽", partial: "部分完成", failed: "失敗", cancelled: "取消", draft: "草稿" } as Record<string, string>)[status] ?? status;
}

function formatDateTime(value: string) { return value ? new Date(value).toLocaleString("zh-TW", { hour12: false }) : ""; }
function formatCurrency(value: number) { return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(value); }
function getErrorMessage(error: unknown, fallback: string) { return error instanceof Error ? `${fallback}：${error.message}` : fallback; }
