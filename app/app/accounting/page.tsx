"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { RotaryYear } from "@/lib/events";
import { fetchRotaryYears } from "@/lib/supabaseData";
import { supabase } from "@/src/lib/supabase";

type EntryType = "income" | "expense";
type MonthCloseStatus = "draft" | "closed";

type AccountingCategory = {
  id: string;
  rotaryYearId: string;
  entryType: EntryType;
  groupName: string;
  name: string;
  annualBudget: number;
  sortOrder: number;
  isActive: boolean;
};

type AccountingEntry = {
  id: string;
  rotaryYearId: string;
  entryDate: string;
  entryType: EntryType;
  categoryId: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod: string;
  referenceNo: string;
  isPassThrough: boolean;
  note: string;
};

type BalanceSheetItem = {
  id: string;
  rotaryYearId: string;
  itemType: "asset" | "liability" | "fund";
  groupName: string;
  name: string;
  amount: number;
  sortOrder: number;
};

type MonthClose = {
  id: string;
  rotaryYearId: string;
  reportMonth: string;
  status: MonthCloseStatus;
  closedAt: string;
  closedBy: string;
  note: string;
};

type ReportRow = {
  key: string;
  groupName: string;
  name: string;
  monthAmount: number;
  yearAmount: number;
  annualBudget: number;
  budgetBalance: number;
  executionRate: string;
};

const tabs = ["收支登錄", "每月收支報表", "年度預算", "資產負債表"] as const;
const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";
const emptyEntry = {
  rotaryYearId: "",
  entryDate: "",
  entryType: "income" as EntryType,
  categoryId: "",
  category: "",
  description: "",
  amount: 0,
  paymentMethod: "轉帳",
  referenceNo: "",
  isPassThrough: false,
  note: "",
};

export default function AccountingPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("每月收支報表");
  const [years, setYears] = useState<RotaryYear[]>([]);
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [balanceItems, setBalanceItems] = useState<BalanceSheetItem[]>([]);
  const [monthCloses, setMonthCloses] = useState<MonthClose[]>([]);
  const [yearId, setYearId] = useState("");
  const [month, setMonth] = useState(getCurrentMonth());
  const [cutoffDate, setCutoffDate] = useState(getMonthEnd(getCurrentMonth()));
  const [form, setForm] = useState(emptyEntry);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [unlockReason, setUnlockReason] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");
  const [isExportingJpg, setIsExportingJpg] = useState(false);

  async function loadData() {
    try {
      setErrorMessage("");
      const [loadedYears, categoryRows, entryRows, balanceRows, closeRows] = await Promise.all([
        fetchRotaryYears(),
        supabase.from("accounting_categories").select("*").order("sort_order"),
        supabase.from("accounting_entries").select("*").order("entry_date", { ascending: false }),
        supabase.from("balance_sheet_items").select("*").order("sort_order"),
        supabase.from("accounting_month_closes").select("*").order("report_month", { ascending: false }),
      ]);
      if (categoryRows.error) throw categoryRows.error;
      if (entryRows.error) throw entryRows.error;
      if (balanceRows.error) throw balanceRows.error;
      if (closeRows.error) throw closeRows.error;

      const activeYear = loadedYears.find((year) => year.isActive) ?? loadedYears[0];
      setYears(loadedYears);
      setCategories((categoryRows.data ?? []).map(mapCategory));
      setEntries((entryRows.data ?? []).map(mapEntry));
      setBalanceItems((balanceRows.data ?? []).map(mapBalanceItem));
      setMonthCloses((closeRows.data ?? []).map(mapMonthClose));
      if (activeYear) {
        const defaultMonth = activeYear.startDate.slice(0, 7);
        setYearId(activeYear.id);
        setMonth(defaultMonth);
        setCutoffDate(getMonthEnd(defaultMonth));
        setForm((currentForm) => ({ ...currentForm, rotaryYearId: activeYear.id }));
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(getErrorMessage(error, "會計資料讀取失敗"));
    }
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, []);

  const selectedYear = years.find((year) => year.id === yearId);
  const monthEnd = cutoffDate || getMonthEnd(month);
  const monthStart = `${month}-01`;
  const yearStart = selectedYear?.startDate ?? `${month.slice(0, 4)}-07-01`;
  const yearCategories = categories
    .filter((category) => category.rotaryYearId === yearId && category.isActive)
    .sort((first, second) => first.sortOrder - second.sortOrder);
  const monthEntries = entries.filter(
    (entry) =>
      entry.rotaryYearId === yearId &&
      entry.entryDate >= monthStart &&
      entry.entryDate <= monthEnd
  );
  const yearToDateEntries = entries.filter(
    (entry) =>
      entry.rotaryYearId === yearId &&
      entry.entryDate >= yearStart &&
      entry.entryDate <= monthEnd
  );
  const formCategories = yearCategories.filter((category) => category.entryType === form.entryType);
  const currentClose = monthCloses.find(
    (close) => close.rotaryYearId === yearId && close.reportMonth === month
  );
  const report = useMemo(
    () => buildReport(yearCategories, monthEntries, yearToDateEntries, balanceItems.filter((item) => item.rotaryYearId === yearId)),
    [yearCategories, monthEntries, yearToDateEntries, balanceItems, yearId]
  );
  const checks = buildReportChecks(yearCategories, monthEntries, report);

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    if (isClosedMonth(form.entryDate, monthCloses, form.rotaryYearId)) {
      setErrorMessage("此月份已鎖定，請先解除鎖定後再修改。");
      return;
    }

    const nextEntry = { ...form, id: editingId ?? crypto.randomUUID() };
    const { data, error } = await supabase
      .from("accounting_entries")
      .upsert(toEntryRow(nextEntry), { onConflict: "id" })
      .select()
      .single();
    if (error) {
      console.error(error);
      setErrorMessage(`會計紀錄儲存失敗：${error.message}`);
      return;
    }
    const savedEntry = mapEntry(data);
    setEntries((currentEntries) =>
      editingId
        ? currentEntries.map((entry) => (entry.id === savedEntry.id ? savedEntry : entry))
        : [savedEntry, ...currentEntries]
    );
    setEditingId(null);
    setForm({ ...emptyEntry, rotaryYearId: yearId });
    setMessage("收支紀錄已儲存。");
  }

  async function deleteEntry(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (entry && isClosedMonth(entry.entryDate, monthCloses, entry.rotaryYearId)) {
      setErrorMessage("此月份已鎖定，請先解除鎖定後再刪除。");
      return;
    }
    if (!window.confirm("確定要刪除此筆收支紀錄嗎？")) return;
    const { error } = await supabase.from("accounting_entries").delete().eq("id", entryId);
    if (error) {
      setErrorMessage(`會計紀錄刪除失敗：${error.message}`);
      return;
    }
    setEntries((currentEntries) => currentEntries.filter((item) => item.id !== entryId));
  }

  function editEntry(entry: AccountingEntry) {
    if (isClosedMonth(entry.entryDate, monthCloses, entry.rotaryYearId)) {
      setErrorMessage("此月份已鎖定，請先解除鎖定後再編輯。");
      return;
    }
    setEditingId(entry.id);
    setForm({
      rotaryYearId: entry.rotaryYearId,
      entryDate: entry.entryDate,
      entryType: entry.entryType,
      categoryId: entry.categoryId,
      category: entry.category,
      description: entry.description,
      amount: entry.amount,
      paymentMethod: entry.paymentMethod,
      referenceNo: entry.referenceNo,
      isPassThrough: entry.isPassThrough,
      note: entry.note,
    });
    setTab("收支登錄");
  }

  async function updateBudget(category: AccountingCategory, annualBudget: number) {
    const { data, error } = await supabase
      .from("accounting_categories")
      .upsert({ ...toCategoryRow(category), annual_budget: annualBudget }, { onConflict: "id" })
      .select()
      .single();
    if (error) {
      setErrorMessage(`年度預算更新失敗：${error.message}`);
      return;
    }
    const savedCategory = mapCategory(data);
    setCategories((currentCategories) =>
      currentCategories.map((item) => (item.id === savedCategory.id ? savedCategory : item))
    );
  }

  async function closeMonth() {
    if (!yearId || !month) return;
    if (!window.confirm(`確定鎖定 ${month} 會計月份？鎖定後不可直接修改或刪除該月收支。`)) return;
    const payload = {
      id: currentClose?.id ?? crypto.randomUUID(),
      rotary_year_id: yearId,
      report_month: month,
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by: "會計長",
      note: currentClose?.note || "",
    };
    const { data, error } = await supabase
      .from("accounting_month_closes")
      .upsert(payload, { onConflict: "rotary_year_id,report_month" })
      .select()
      .single();
    if (error) {
      setErrorMessage(`月結鎖定失敗：${error.message}`);
      return;
    }
    setMonthCloses((current) => upsertClose(current, mapMonthClose(data)));
    setMessage(`${month} 已鎖定。`);
  }

  async function unlockMonth() {
    if (!currentClose || !unlockReason.trim()) {
      setErrorMessage("解除鎖定需填寫原因。");
      return;
    }
    const { data, error } = await supabase
      .from("accounting_month_closes")
      .update({ status: "draft", note: unlockReason })
      .eq("id", currentClose.id)
      .select()
      .single();
    if (error) {
      setErrorMessage(`解除鎖定失敗：${error.message}`);
      return;
    }
    await supabase.from("accounting_month_close_logs").insert({
      month_close_id: currentClose.id,
      action: "unlock",
      reason: unlockReason,
    });
    setMonthCloses((current) => upsertClose(current, mapMonthClose(data)));
    setUnlockReason("");
    setMessage(`${month} 已解除鎖定。`);
  }

  function exportCsv() {
    downloadCsv("高雄晨光扶輪社_會計收支.csv", [
      ["日期", "收入/支出", "科目", "摘要", "金額", "繳費方式", "參考號", "備註"],
      ...yearToDateEntries.map((entry) => [
        entry.entryDate,
        entry.entryType === "income" ? "收入" : "支出",
        entry.category,
        entry.description,
        String(entry.amount),
        entry.paymentMethod,
        entry.referenceNo,
        entry.note,
      ]),
    ]);
  }

  async function exportReportJpg() {
    const reportElement = document.getElementById("accounting-monthly-report");
    if (!reportElement) return;
    setIsExportingJpg(true);
    try {
      const html2canvasModule = await import("html2canvas");
      const canvas = await html2canvasModule.default(reportElement, {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.download = `高雄晨光扶輪社_會計收支報表_${month}.jpg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "JPG 匯出失敗"));
    } finally {
      setIsExportingJpg(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #accounting-monthly-report,
          #accounting-monthly-report * {
            visibility: visible;
          }
          #accounting-monthly-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="mx-auto max-w-md space-y-3 print:hidden">
          <Link href="/" className="text-sm font-bold text-[#173B73]/75">
            回首頁
          </Link>
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-[#C99700]">Rotary OS</p>
            <h1 className="mt-2 text-3xl font-bold">會計收支管理</h1>
          </div>
        </header>
        {message ? <Notice tone="success">{message}</Notice> : null}
        {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:hidden">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`rounded-2xl px-3 py-3 text-sm font-bold ${
                tab === item ? "bg-[#F7C948]" : "bg-white"
              } ${buttonShadow}`}
            >
              {item}
            </button>
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-3 print:hidden">
          <label>
            <span className="text-sm font-bold">年度</span>
            <select
              value={yearId}
              onChange={(event) => {
                setYearId(event.target.value);
                setForm((currentForm) => ({ ...currentForm, rotaryYearId: event.target.value }));
              }}
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 font-bold"
            >
              {years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.displayName || year.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm font-bold">月份</span>
            <input
              type="month"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setCutoffDate(getMonthEnd(event.target.value));
              }}
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 font-bold"
            />
          </label>
          <label>
            <span className="text-sm font-bold">統計截止日</span>
            <input
              type="date"
              value={cutoffDate}
              onChange={(event) => setCutoffDate(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 font-bold"
            />
          </label>
        </section>

        {tab === "收支登錄" ? (
          <AccountingEntryTab
            form={form}
            editingId={editingId}
            formCategories={formCategories}
            entries={yearToDateEntries}
            monthCloses={monthCloses}
            onSubmit={saveEntry}
            onChange={setForm}
            onEdit={editEntry}
            onDelete={deleteEntry}
            onExportCsv={exportCsv}
          />
        ) : null}

        {tab === "每月收支報表" ? (
          <MonthlyReport
            month={month}
            cutoffDate={monthEnd}
            status={currentClose?.status ?? "draft"}
            report={report}
            checks={checks}
            passThroughEntries={buildPassThroughEntries(yearToDateEntries, yearCategories)}
            onPrint={() => window.print()}
            onExportJpg={() => void exportReportJpg()}
            isExportingJpg={isExportingJpg}
            onExportCsv={() => exportReportCsv(month, report)}
            onCloseMonth={closeMonth}
            onUnlockMonth={unlockMonth}
            unlockReason={unlockReason}
            onUnlockReasonChange={setUnlockReason}
          />
        ) : null}

        {tab === "年度預算" ? (
          <BudgetTab categories={yearCategories} entries={yearToDateEntries} onUpdateBudget={updateBudget} />
        ) : null}
        {tab === "資產負債表" ? (
          <BalanceSheetOnly items={report.balanceItems} yearBalance={report.yearBalance} />
        ) : null}
      </section>
    </main>
  );
}

function AccountingEntryTab({
  form,
  editingId,
  formCategories,
  entries,
  monthCloses,
  onSubmit,
  onChange,
  onEdit,
  onDelete,
  onExportCsv,
}: {
  form: typeof emptyEntry;
  editingId: string | null;
  formCategories: AccountingCategory[];
  entries: AccountingEntry[];
  monthCloses: MonthClose[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChange: (form: typeof emptyEntry) => void;
  onEdit: (entry: AccountingEntry) => void;
  onDelete: (entryId: string) => void;
  onExportCsv: () => void;
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-[420px_1fr] print:hidden">
      <form onSubmit={onSubmit} className="space-y-4 rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
        <h2 className="text-xl font-bold">{editingId ? "編輯收支" : "新增收支"}</h2>
        <Input label="日期" type="date" value={form.entryDate} onChange={(value) => onChange({ ...form, entryDate: value })} required />
        <label className="block">
          <span className="text-sm font-bold">收入／支出</span>
          <select
            value={form.entryType}
            onChange={(event) => onChange({ ...form, entryType: event.target.value as EntryType, categoryId: "", category: "" })}
            className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3"
          >
            <option value="income">收入</option>
            <option value="expense">支出</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold">預算大項 / 登帳科目</span>
          <select
            value={form.categoryId}
            onChange={(event) => {
              const category = formCategories.find((item) => item.id === event.target.value);
              onChange({ ...form, categoryId: event.target.value, category: category?.name ?? "" });
            }}
            className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3"
          >
            <option value="">自訂科目</option>
            {formCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.groupName} / {category.name}
              </option>
            ))}
          </select>
        </label>
        <Input label="摘要" value={form.description} onChange={(value) => onChange({ ...form, description: value })} required />
        <Input label="金額" type="number" value={String(form.amount)} onChange={(value) => onChange({ ...form, amount: Number(value) || 0 })} required />
        <Input label="繳費方式" value={form.paymentMethod} onChange={(value) => onChange({ ...form, paymentMethod: value })} />
        <Input label="匯款後五碼或參考號" value={form.referenceNo} onChange={(value) => onChange({ ...form, referenceNo: value })} />
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={form.isPassThrough} onChange={(event) => onChange({ ...form, isPassThrough: event.target.checked })} />
          暫付款 / 代收付標記
        </label>
        <Input label="備註" value={form.note} onChange={(value) => onChange({ ...form, note: value })} />
        <button type="submit" className={`w-full rounded-2xl bg-[#F7C948] py-4 font-bold ${buttonShadow}`}>
          {editingId ? "儲存修改" : "新增收支"}
        </button>
      </form>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">收支紀錄</h2>
          <button type="button" onClick={onExportCsv} className={`rounded-2xl bg-[#F7C948] px-4 py-2 text-sm font-bold ${buttonShadow}`}>
            匯出 CSV
          </button>
        </div>
        {entries.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            locked={isClosedMonth(entry.entryDate, monthCloses, entry.rotaryYearId)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </section>
    </section>
  );
}

function EntryCard({
  entry,
  locked,
  onEdit,
  onDelete,
}: {
  entry: AccountingEntry;
  locked: boolean;
  onEdit: (entry: AccountingEntry) => void;
  onDelete: (entryId: string) => void;
}) {
  return (
    <article className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
      <p className="text-sm font-bold text-[#C99700]">{entry.entryDate}｜{entry.entryType === "income" ? "收入" : "支出"}</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <h3 className="text-xl font-bold">{entry.category || entry.description}</h3>
        {locked ? <span className="rounded-full bg-[#173B73] px-3 py-1 text-xs font-bold text-white">已鎖定</span> : null}
      </div>
      <p className="mt-2 font-bold">{formatCurrency(entry.amount)}</p>
      <p className="text-sm font-semibold text-[#173B73]/75">{entry.description}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" disabled={locked} onClick={() => onEdit(entry)} className={`rounded-2xl bg-[#F7C948] py-3 font-bold disabled:opacity-50 ${buttonShadow}`}>編輯</button>
        <button type="button" disabled={locked} onClick={() => onDelete(entry.id)} className={`rounded-2xl bg-white py-3 font-bold disabled:opacity-50 ${buttonShadow}`}>刪除</button>
      </div>
    </article>
  );
}

function MonthlyReport({
  month,
  cutoffDate,
  status,
  report,
  checks,
  passThroughEntries,
  onPrint,
  onExportJpg,
  isExportingJpg,
  onExportCsv,
  onCloseMonth,
  onUnlockMonth,
  unlockReason,
  onUnlockReasonChange,
}: {
  month: string;
  cutoffDate: string;
  status: MonthCloseStatus;
  report: ReturnType<typeof buildReport>;
  checks: string[];
  passThroughEntries: AccountingEntry[];
  onPrint: () => void;
  onExportJpg: () => void;
  isExportingJpg: boolean;
  onExportCsv: () => void;
  onCloseMonth: () => void;
  onUnlockMonth: () => void;
  unlockReason: string;
  onUnlockReasonChange: (value: string) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={onPrint} className={`rounded-2xl bg-[#F7C948] px-4 py-2 font-bold ${buttonShadow}`}>列印</button>
        <button type="button" onClick={onExportJpg} disabled={isExportingJpg} className={`rounded-2xl bg-white px-4 py-2 font-bold disabled:opacity-60 ${buttonShadow}`}>
          {isExportingJpg ? "匯出中" : "匯出 JPG"}
        </button>
        <button type="button" onClick={onExportCsv} className={`rounded-2xl bg-white px-4 py-2 font-bold ${buttonShadow}`}>匯出 CSV</button>
        {status === "closed" ? (
          <span className="rounded-full bg-[#173B73] px-4 py-2 text-sm font-bold text-white">本月已鎖定</span>
        ) : (
          <button type="button" onClick={onCloseMonth} className={`rounded-2xl bg-[#F7C948] px-4 py-2 font-bold ${buttonShadow}`}>鎖定本月</button>
        )}
      </div>
      {status === "closed" ? (
        <div className="grid gap-2 rounded-3xl bg-white/85 p-4 print:hidden sm:grid-cols-[1fr_auto]">
          <input
            value={unlockReason}
            onChange={(event) => onUnlockReasonChange(event.target.value)}
            placeholder="解除鎖定原因"
            className="rounded-2xl border border-[#E5D9BD] px-4 py-3"
          />
          <button type="button" onClick={onUnlockMonth} className={`rounded-2xl bg-white px-4 py-3 font-bold ${buttonShadow}`}>解除鎖定</button>
        </div>
      ) : null}
      {checks.length > 0 ? (
        <div className="space-y-1 rounded-3xl bg-[#FFF6D6] p-4 text-sm font-bold print:hidden">
          {checks.map((check) => <p key={check}>- {check}</p>)}
        </div>
      ) : null}
      <div className="grid gap-3 print:hidden sm:grid-cols-2 lg:hidden">
        <SummaryCard title="收入" monthAmount={report.monthIncome} yearAmount={report.yearIncome} />
        <SummaryCard title="支出" monthAmount={report.monthExpense} yearAmount={report.yearExpense} />
        <SummaryCard title="本月結餘" monthAmount={report.monthBalance} yearAmount={report.yearBalance} />
        <SummaryCard title="資產負債差額" monthAmount={report.balanceDifference} yearAmount={report.balanceDifference} />
      </div>
      <div id="accounting-monthly-report" className="overflow-x-auto rounded-3xl bg-white p-5 text-black">
        <div className="min-w-[1120px]">
          <h2 className="text-center text-2xl font-bold">高雄晨光扶輪社</h2>
          <p className="mt-1 text-center text-lg font-bold">{toRocMonth(month)}月份收支明細表</p>
          <p className="mt-1 text-center text-sm">統計日期：{formatDate(cutoffDate)}</p>
          <TwoColumnReport expenseRows={report.expenseRows} incomeRows={report.incomeRows} />
          <ReportClosing report={report} />
          <BalanceSheetSection report={report} />
          <PassThroughSection entries={passThroughEntries} />
          <div className="mt-10 grid grid-cols-4 gap-8 text-center text-sm">
            <p>社長</p>
            <p>秘書</p>
            <p>會計長</p>
            <p>製表</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function TwoColumnReport({ expenseRows, incomeRows }: { expenseRows: ReportRow[]; incomeRows: ReportRow[] }) {
  const maxRows = Math.max(expenseRows.length, incomeRows.length);
  const rows = Array.from({ length: maxRows }, (_, index) => ({
    expense: expenseRows[index],
    income: incomeRows[index],
  }));
  return (
    <table className="mt-5 w-full border-collapse text-sm">
      <thead>
        <tr className="bg-[#F8F3E8]">
          <th className="border border-black px-2 py-2" colSpan={4}>支出</th>
          <th className="border border-black px-2 py-2" colSpan={4}>收入</th>
        </tr>
        <tr>
          {["支出科目", "本月金額", "年度累計", "年度預算", "收入科目", "本月金額", "年度累計", "年度預算"].map((title) => (
            <th key={title} className="border border-black px-2 py-2 text-left">{title}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            <ReportCell row={row.expense} />
            <ReportCell row={row.income} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportCell({ row }: { row?: ReportRow }) {
  if (!row) {
    return (
      <>
        <td className="border border-black px-2 py-2" />
        <td className="border border-black px-2 py-2" />
        <td className="border border-black px-2 py-2" />
        <td className="border border-black px-2 py-2" />
      </>
    );
  }
  const isSubtotal = row.name === "小計";
  return (
    <>
      <td className={`border border-black px-2 py-2 ${isSubtotal ? "font-bold" : ""}`}>{isSubtotal ? `${row.groupName} 小計` : `${row.groupName} / ${row.name}`}</td>
      <td className="border border-black px-2 py-2 text-right">{formatCurrency(row.monthAmount)}</td>
      <td className="border border-black px-2 py-2 text-right">{formatCurrency(row.yearAmount)}</td>
      <td className="border border-black px-2 py-2 text-right">{formatCurrency(row.annualBudget)}</td>
    </>
  );
}

function ReportClosing({ report }: { report: ReturnType<typeof buildReport> }) {
  return (
    <section className="mt-5 grid grid-cols-2 gap-3 text-sm font-bold">
      <p>本月收入總計：{formatCurrency(report.monthIncome)}</p>
      <p>本月支出總計：{formatCurrency(report.monthExpense)}</p>
      <p>本月結餘：<Money value={report.monthBalance} /></p>
      <p>年度累計收入：{formatCurrency(report.yearIncome)}</p>
      <p>年度累計支出：{formatCurrency(report.yearExpense)}</p>
      <p>年度累計結餘：<Money value={report.yearBalance} /></p>
    </section>
  );
}

function BalanceSheetSection({ report }: { report: ReturnType<typeof buildReport> }) {
  return (
    <section className="mt-6">
      <h3 className="text-lg font-bold">簡式資產負債表</h3>
      {report.balanceDifference !== 0 ? (
        <p className="mt-2 font-bold text-red-600">
          資產負債表不平衡，差額 {formatCurrency(report.balanceDifference)}。
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-4">
        <BalanceList title="資產" items={report.assetItems} total={report.assetTotal} />
        <BalanceList title="負債及基金" items={report.liabilityFundItems} total={report.liabilityFundTotal} extraLabel="本年度累計結餘" extraAmount={report.yearBalance} />
      </div>
    </section>
  );
}

function PassThroughSection({ entries }: { entries: AccountingEntry[] }) {
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  return (
    <section className="mt-6">
      <h3 className="text-lg font-bold">暫付款與代收付明細</h3>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr>
            {["日期", "摘要", "金額", "備註", "是否已結清"].map((title) => (
              <th key={title} className="border border-black px-2 py-2 text-left">{title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="border border-black px-2 py-2">{entry.entryDate}</td>
              <td className="border border-black px-2 py-2">{entry.description || entry.category}</td>
              <td className="border border-black px-2 py-2 text-right">{formatCurrency(entry.amount)}</td>
              <td className="border border-black px-2 py-2">{entry.note || "-"}</td>
              <td className="border border-black px-2 py-2">{entry.note.includes("結清") ? "是" : "否"}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className="border border-black px-2 py-2" colSpan={2}>合計</td>
            <td className="border border-black px-2 py-2 text-right">{formatCurrency(total)}</td>
            <td className="border border-black px-2 py-2" colSpan={2} />
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function BudgetTab({ categories, entries, onUpdateBudget }: { categories: AccountingCategory[]; entries: AccountingEntry[]; onUpdateBudget: (category: AccountingCategory, budget: number) => void }) {
  return (
    <section className="space-y-3 print:hidden">
      {categories.map((category) => {
        const spent = entries
          .filter((entry) => sameCategory(entry, category))
          .reduce((total, entry) => total + entry.amount, 0);
        const rate = category.annualBudget > 0 ? Math.round((spent / category.annualBudget) * 100) : 0;
        return (
          <div key={category.id} className="rounded-3xl bg-white/85 p-5">
            <p className="text-sm font-bold text-[#C99700]">{category.entryType === "income" ? "收入" : "支出"} / {category.groupName}</p>
            <h3 className="text-xl font-bold">{category.name}</h3>
            <input type="number" value={category.annualBudget} onChange={(event) => onUpdateBudget(category, Number(event.target.value) || 0)} className="mt-3 w-full rounded-2xl border border-[#E5D9BD] px-4 py-3" />
            <p className="mt-2 text-sm font-bold">
              已執行：{formatCurrency(spent)}｜
              年度預算：{category.annualBudget > 0 ? formatCurrency(category.annualBudget) : "未設定"}｜
              餘額：{category.annualBudget > 0 ? formatCurrency(category.entryType === "income" ? spent - category.annualBudget : category.annualBudget - spent) : "—"}｜
              執行率：{category.annualBudget > 0 ? `${rate}%` : "—"}
            </p>
          </div>
        );
      })}
    </section>
  );
}

function BalanceSheetOnly({ items, yearBalance }: { items: BalanceSheetItem[]; yearBalance: number }) {
  const assetItems = items.filter((item) => item.itemType === "asset");
  const liabilityFundItems = items.filter((item) => item.itemType !== "asset");
  const assetTotal = assetItems.reduce((sum, item) => sum + item.amount, 0);
  const liabilityFundTotal = liabilityFundItems.reduce((sum, item) => sum + item.amount, 0) + yearBalance;
  return (
    <section className="rounded-3xl bg-white p-5 text-black">
      <h2 className="text-center text-2xl font-bold">高雄晨光扶輪社簡式資產負債表</h2>
      {assetTotal !== liabilityFundTotal ? <p className="mt-3 rounded-2xl bg-red-50 p-3 text-center font-bold text-red-700">不平衡差額：{formatCurrency(assetTotal - liabilityFundTotal)}</p> : null}
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <BalanceList title="資產" items={assetItems} total={assetTotal} />
        <BalanceList title="負債及基金" items={liabilityFundItems} total={liabilityFundTotal} extraLabel="本年度累計結餘" extraAmount={yearBalance} />
      </div>
    </section>
  );
}

function BalanceList({ title, items, total, extraLabel, extraAmount = 0 }: { title: string; items: BalanceSheetItem[]; total: number; extraLabel?: string; extraAmount?: number }) {
  return (
    <div>
      <h4 className="font-bold">{title}</h4>
      {items.map((item) => <p key={item.id} className="flex justify-between border-b py-1"><span>{item.groupName} / {item.name}</span><span>{formatCurrency(item.amount)}</span></p>)}
      {extraLabel ? <p className="flex justify-between border-b py-1"><span>{extraLabel}</span><span>{formatCurrency(extraAmount)}</span></p> : null}
      <p className="flex justify-between pt-2 font-bold"><span>合計</span><span>{formatCurrency(total)}</span></p>
    </div>
  );
}

function SummaryCard({ title, monthAmount, yearAmount }: { title: string; monthAmount: number; yearAmount: number }) {
  return (
    <article className="rounded-3xl bg-white/85 p-4">
      <p className="text-sm font-bold text-[#C99700]">{title}</p>
      <p className="mt-1 text-xl font-bold"><Money value={monthAmount} /></p>
      <p className="mt-1 text-sm font-semibold">年度：<Money value={yearAmount} /></p>
    </article>
  );
}

function Notice({ tone, children }: { tone: "success" | "error" | "warning"; children: React.ReactNode }) {
  const className =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-700"
      : tone === "warning"
        ? "border-yellow-200 bg-yellow-50 text-[#173B73]"
        : "border-red-200 bg-red-50 text-red-700";
  return <p className={`rounded-2xl border p-4 text-sm font-bold print:hidden ${className}`}>{children}</p>;
}

function Money({ value }: { value: number }) {
  return <span className={value < 0 ? "text-red-600" : "text-[#173B73]"}>{formatCurrency(value)}</span>;
}

function Input({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="block"><span className="text-sm font-bold">{label}</span><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3" /></label>;
}

function buildReport(categories: AccountingCategory[], monthEntries: AccountingEntry[], yearEntries: AccountingEntry[], balanceItems: BalanceSheetItem[]) {
  const incomeRows = buildReportRows("income", monthEntries, yearEntries, categories);
  const expenseRows = buildReportRows("expense", monthEntries, yearEntries, categories);
  const monthIncome = sumEntries(monthEntries, "income");
  const monthExpense = sumEntries(monthEntries, "expense");
  const yearIncome = sumEntries(yearEntries, "income");
  const yearExpense = sumEntries(yearEntries, "expense");
  const assetItems = ensureBalanceItems(balanceItems, "asset", ["銀行活存", "銀行定存", "零用金", "暫付款", "應收款", "其他資產"]);
  const liabilityFundItems = ensureBalanceItems(balanceItems.filter((item) => item.itemType !== "asset"), "liability", ["歷屆累計餘絀", "代收付", "應付款", "其他負債"]);
  const assetTotal = assetItems.reduce((sum, item) => sum + item.amount, 0);
  const yearBalance = yearIncome - yearExpense;
  const liabilityFundTotal = liabilityFundItems.reduce((sum, item) => sum + item.amount, 0) + yearBalance;
  return {
    incomeRows,
    expenseRows,
    monthIncome,
    monthExpense,
    monthBalance: monthIncome - monthExpense,
    yearIncome,
    yearExpense,
    yearBalance,
    balanceItems,
    assetItems,
    liabilityFundItems,
    assetTotal,
    liabilityFundTotal,
    balanceDifference: assetTotal - liabilityFundTotal,
  };
}

function buildReportRows(type: EntryType, monthEntries: AccountingEntry[], yearEntries: AccountingEntry[], categories: AccountingCategory[]) {
  const rows: ReportRow[] = [];
  const typeCategories = categories.filter((category) => category.entryType === type);
  const groupNames = Array.from(new Set(typeCategories.map((category) => category.groupName || "未分類")));
  groupNames.forEach((groupName) => {
    const groupCategories = typeCategories.filter((category) => (category.groupName || "未分類") === groupName);
    let groupMonth = 0;
    let groupYear = 0;
    let groupBudget = 0;
    groupCategories.forEach((category) => {
      const monthAmount = monthEntries.filter((entry) => sameCategory(entry, category)).reduce((total, entry) => total + entry.amount, 0);
      const yearAmount = yearEntries.filter((entry) => sameCategory(entry, category)).reduce((total, entry) => total + entry.amount, 0);
      groupMonth += monthAmount;
      groupYear += yearAmount;
      groupBudget += category.annualBudget;
      rows.push({
        key: category.id,
        groupName,
        name: category.name,
        monthAmount,
        yearAmount,
        annualBudget: category.annualBudget,
        budgetBalance: type === "income" ? yearAmount - category.annualBudget : category.annualBudget - yearAmount,
        executionRate: category.annualBudget > 0 ? `${((yearAmount / category.annualBudget) * 100).toFixed(1)}%` : "—",
      });
    });
    rows.push({
      key: `${type}-${groupName}-subtotal`,
      groupName,
      name: "小計",
      monthAmount: groupMonth,
      yearAmount: groupYear,
      annualBudget: groupBudget,
      budgetBalance: type === "income" ? groupYear - groupBudget : groupBudget - groupYear,
      executionRate: groupBudget > 0 ? `${((groupYear / groupBudget) * 100).toFixed(1)}%` : "—",
    });
  });
  return rows;
}

function buildReportChecks(categories: AccountingCategory[], monthEntries: AccountingEntry[], report: ReturnType<typeof buildReport>) {
  const checks: string[] = [];
  if (monthEntries.some((entry) => !entry.categoryId && entry.entryType === "income")) checks.push("存在未分類收入。");
  if (monthEntries.some((entry) => !entry.categoryId && entry.entryType === "expense")) checks.push("存在未分類支出。");
  if (monthEntries.some((entry) => entry.amount < 0)) checks.push("存在負數或異常金額。");
  if (report.balanceDifference !== 0) checks.push(`資產負債不平衡，差額 ${formatCurrency(report.balanceDifference)}。`);
  return checks;
}

function buildPassThroughEntries(entries: AccountingEntry[], categories: AccountingCategory[]) {
  return entries.filter((entry) => {
    const category = categories.find((item) => item.id === entry.categoryId || item.name === entry.category);
    const textValue = `${entry.category} ${category?.groupName ?? ""} ${entry.description}`;
    return entry.isPassThrough || textValue.includes("暫付款") || textValue.includes("代收付");
  });
}

function ensureBalanceItems(items: BalanceSheetItem[], type: BalanceSheetItem["itemType"], names: string[]) {
  const existing = items.filter((item) => item.itemType === type);
  const missing = names
    .filter((name) => !existing.some((item) => item.name === name))
    .map((name, index) => ({
      id: `${type}-${name}`,
      rotaryYearId: "",
      itemType: type,
      groupName: type === "asset" ? "資產" : "負債及基金",
      name,
      amount: 0,
      sortOrder: 900 + index,
    }));
  return [...existing, ...missing].sort((first, second) => first.sortOrder - second.sortOrder);
}

function sameCategory(entry: AccountingEntry, category: AccountingCategory) {
  return entry.entryType === category.entryType && (entry.categoryId === category.id || entry.category === category.name);
}

function sumEntries(entries: AccountingEntry[], type: EntryType) {
  return entries.filter((entry) => entry.entryType === type).reduce((total, entry) => total + entry.amount, 0);
}

function isClosedMonth(entryDate: string, monthCloses: MonthClose[], rotaryYearId: string) {
  const reportMonth = entryDate.slice(0, 7);
  return monthCloses.some((close) => close.rotaryYearId === rotaryYearId && close.reportMonth === reportMonth && close.status === "closed");
}

function upsertClose(closes: MonthClose[], close: MonthClose) {
  return closes.some((item) => item.id === close.id)
    ? closes.map((item) => (item.id === close.id ? close : item))
    : [close, ...closes];
}

function exportReportCsv(month: string, report: ReturnType<typeof buildReport>) {
  downloadCsv(`高雄晨光扶輪社_會計收支報表_${month}.csv`, [
    ["高雄晨光扶輪社", `${toRocMonth(month)}月份收支明細表`],
    ["支出科目", "本月金額", "年度累計", "年度預算", "收入科目", "本月金額", "年度累計", "年度預算"],
    ...Array.from({ length: Math.max(report.expenseRows.length, report.incomeRows.length) }, (_, index) => {
      const expense = report.expenseRows[index];
      const income = report.incomeRows[index];
      return [
        expense ? `${expense.groupName}/${expense.name}` : "",
        expense ? String(expense.monthAmount) : "",
        expense ? String(expense.yearAmount) : "",
        expense ? String(expense.annualBudget) : "",
        income ? `${income.groupName}/${income.name}` : "",
        income ? String(income.monthAmount) : "",
        income ? String(income.yearAmount) : "",
        income ? String(income.annualBudget) : "",
      ];
    }),
    [],
    ["本月收入", String(report.monthIncome), "本月支出", String(report.monthExpense), "本月結餘", String(report.monthBalance)],
    ["年度收入", String(report.yearIncome), "年度支出", String(report.yearExpense), "年度結餘", String(report.yearBalance)],
  ]);
}

function mapCategory(row: Record<string, unknown>): AccountingCategory {
  return {
    id: text(row.id),
    rotaryYearId: text(row.rotary_year_id),
    entryType: text(row.entry_type) === "expense" ? "expense" : "income",
    groupName: text(row.group_name),
    name: text(row.name),
    annualBudget: number(row.annual_budget),
    sortOrder: number(row.sort_order),
    isActive: row.is_active !== false,
  };
}

function toCategoryRow(category: AccountingCategory) {
  return {
    id: category.id,
    rotary_year_id: category.rotaryYearId,
    entry_type: category.entryType,
    group_name: category.groupName,
    name: category.name,
    annual_budget: category.annualBudget,
    sort_order: category.sortOrder,
    is_active: category.isActive,
  };
}

function mapEntry(row: Record<string, unknown>): AccountingEntry {
  return {
    id: text(row.id),
    rotaryYearId: text(row.rotary_year_id),
    entryDate: text(row.entry_date),
    entryType: text(row.entry_type) === "expense" ? "expense" : "income",
    categoryId: text(row.category_id),
    category: text(row.category),
    description: text(row.description),
    amount: number(row.amount),
    paymentMethod: text(row.payment_method),
    referenceNo: text(row.reference_no),
    isPassThrough: Boolean(row.is_pass_through),
    note: text(row.note),
  };
}

function toEntryRow(entry: AccountingEntry) {
  return {
    id: entry.id,
    rotary_year_id: entry.rotaryYearId || null,
    entry_date: entry.entryDate,
    entry_type: entry.entryType,
    category_id: entry.categoryId || null,
    category: entry.category,
    description: entry.description,
    amount: entry.amount,
    payment_method: entry.paymentMethod,
    reference_no: entry.referenceNo,
    is_pass_through: entry.isPassThrough,
    note: entry.note,
  };
}

function mapBalanceItem(row: Record<string, unknown>): BalanceSheetItem {
  return {
    id: text(row.id),
    rotaryYearId: text(row.rotary_year_id),
    itemType: text(row.item_type) === "asset" ? "asset" : text(row.item_type) === "fund" ? "fund" : "liability",
    groupName: text(row.group_name),
    name: text(row.name),
    amount: number(row.amount),
    sortOrder: number(row.sort_order),
  };
}

function mapMonthClose(row: Record<string, unknown>): MonthClose {
  return {
    id: text(row.id),
    rotaryYearId: text(row.rotary_year_id),
    reportMonth: text(row.report_month),
    status: text(row.status) === "closed" ? "closed" : "draft",
    closedAt: text(row.closed_at),
    closedBy: text(row.closed_by),
    note: text(row.note),
  };
}

function text(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function number(value: unknown) {
  return Number(value) || 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(value);
}

function toRocMonth(month: string) {
  const [year, monthNumber] = month.split("-");
  return `民國 ${Number(year) - 1911} 年 ${Number(monthNumber)} 月`;
}

function getCurrentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const end = new Date(year, monthNumber, 0);
  return `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
}

function formatDate(date: string) {
  return date.replaceAll("-", "/");
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? `${fallback}：${error.message}` : fallback;
}
