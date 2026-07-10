"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { RotaryYear } from "@/lib/events";
import { fetchRotaryYears } from "@/lib/supabaseData";
import { supabase } from "@/src/lib/supabase";

type EntryType = "income" | "expense";
type AccountingCategory = {
  id: string;
  rotaryYearId: string;
  entryType: EntryType;
  groupName: string;
  name: string;
  annualBudget: number;
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
};

const tabs = ["收支登錄", "每月收支表", "年度預算", "資產負債表"] as const;
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
  const [tab, setTab] = useState<(typeof tabs)[number]>("收支登錄");
  const [years, setYears] = useState<RotaryYear[]>([]);
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [balanceItems, setBalanceItems] = useState<BalanceSheetItem[]>([]);
  const [yearId, setYearId] = useState("");
  const [month, setMonth] = useState("2026-07");
  const [form, setForm] = useState(emptyEntry);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadData() {
    try {
      setErrorMessage("");
      const [loadedYears, categoryRows, entryRows, balanceRows] = await Promise.all([
        fetchRotaryYears(),
        supabase.from("accounting_categories").select("*").order("sort_order"),
        supabase.from("accounting_entries").select("*").order("entry_date", { ascending: false }),
        supabase.from("balance_sheet_items").select("*").order("sort_order"),
      ]);
      if (categoryRows.error) throw categoryRows.error;
      if (entryRows.error) throw entryRows.error;
      if (balanceRows.error) throw balanceRows.error;

      const activeYear = loadedYears.find((year) => year.isActive) ?? loadedYears[0];
      setYears(loadedYears);
      setCategories((categoryRows.data ?? []).map(mapCategory));
      setEntries((entryRows.data ?? []).map(mapEntry));
      setBalanceItems((balanceRows.data ?? []).map(mapBalanceItem));
      if (activeYear) {
        setYearId(activeYear.id);
        setMonth(activeYear.startDate.slice(0, 7));
        setForm((currentForm) => ({ ...currentForm, rotaryYearId: activeYear.id }));
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? `會計資料讀取失敗：${error.message}` : "會計資料讀取失敗");
    }
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, []);

  const yearEntries = entries.filter((entry) => entry.rotaryYearId === yearId);
  const monthEntries = yearEntries.filter((entry) => entry.entryDate.startsWith(month));
  const yearCategories = categories.filter((category) => category.rotaryYearId === yearId);
  const formCategories = yearCategories.filter((category) => category.entryType === form.entryType);

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
  }

  async function deleteEntry(entryId: string) {
    if (!window.confirm("確定要刪除此筆收支紀錄嗎？")) return;
    const { error } = await supabase.from("accounting_entries").delete().eq("id", entryId);
    if (error) {
      setErrorMessage(`會計紀錄刪除失敗：${error.message}`);
      return;
    }
    setEntries((currentEntries) => currentEntries.filter((entry) => entry.id !== entryId));
  }

  function editEntry(entry: AccountingEntry) {
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

  function exportCsv() {
    downloadCsv("高雄晨光扶輪社_會計收支.csv", [
      ["日期", "收入/支出", "科目", "摘要", "金額", "繳費方式", "參考號", "備註"],
      ...yearEntries.map((entry) => [
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

  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="mx-auto max-w-md space-y-3 print:hidden">
          <Link href="/" className="text-sm font-bold text-[#173B73]/75">
            回首頁
          </Link>
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-[#C99700]">Rotary OS</p>
            <h1 className="mt-2 text-3xl font-bold">會計收支管理</h1>
          </div>
        </header>
        {errorMessage ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 print:hidden">
            {errorMessage}
          </p>
        ) : null}

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:hidden">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`rounded-2xl px-3 py-3 text-sm font-bold ${tab === item ? "bg-[#F7C948]" : "bg-white"} ${buttonShadow}`}
            >
              {item}
            </button>
          ))}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 print:hidden">
          <select
            value={yearId}
            onChange={(event) => {
              setYearId(event.target.value);
              setForm((currentForm) => ({ ...currentForm, rotaryYearId: event.target.value }));
            }}
            className="rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 font-bold"
          >
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.displayName || year.name}
              </option>
            ))}
          </select>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 font-bold"
          />
        </section>

        {tab === "收支登錄" ? (
          <section className="grid gap-6 lg:grid-cols-[420px_1fr] print:hidden">
            <form onSubmit={saveEntry} className="space-y-4 rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
              <h2 className="text-xl font-bold">{editingId ? "編輯收支" : "新增收支"}</h2>
              <Input label="日期" type="date" value={form.entryDate} onChange={(value) => setForm({ ...form, entryDate: value })} required />
              <label className="block"><span className="text-sm font-bold">收入／支出</span><select value={form.entryType} onChange={(event) => setForm({ ...form, entryType: event.target.value as EntryType, categoryId: "", category: "" })} className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3"><option value="income">收入</option><option value="expense">支出</option></select></label>
              <label className="block"><span className="text-sm font-bold">科目群組 / 科目</span><select value={form.categoryId} onChange={(event) => { const category = yearCategories.find((item) => item.id === event.target.value); setForm({ ...form, categoryId: event.target.value, category: category?.name ?? "" }); }} className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3"><option value="">自訂科目</option>{formCategories.map((category) => <option key={category.id} value={category.id}>{category.groupName} / {category.name}</option>)}</select></label>
              <Input label="摘要" value={form.description} onChange={(value) => setForm({ ...form, description: value })} required />
              <Input label="金額" type="number" value={String(form.amount)} onChange={(value) => setForm({ ...form, amount: Number(value) || 0 })} required />
              <Input label="繳費方式" value={form.paymentMethod} onChange={(value) => setForm({ ...form, paymentMethod: value })} />
              <Input label="匯款後五碼或參考號" value={form.referenceNo} onChange={(value) => setForm({ ...form, referenceNo: value })} />
              <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.isPassThrough} onChange={(event) => setForm({ ...form, isPassThrough: event.target.checked })} />代收付標記</label>
              <Input label="備註" value={form.note} onChange={(value) => setForm({ ...form, note: value })} />
              <button type="submit" className={`w-full rounded-2xl bg-[#F7C948] py-4 font-bold ${buttonShadow}`}>{editingId ? "儲存修改" : "新增收支"}</button>
            </form>
            <section className="space-y-3">
              <div className="flex items-center justify-between"><h2 className="text-2xl font-bold">收支紀錄</h2><button type="button" onClick={exportCsv} className={`rounded-2xl bg-[#F7C948] px-4 py-2 text-sm font-bold ${buttonShadow}`}>匯出 CSV</button></div>
              {yearEntries.map((entry) => <EntryCard key={entry.id} entry={entry} onEdit={editEntry} onDelete={deleteEntry} />)}
            </section>
          </section>
        ) : null}
        {tab === "每月收支表" ? <MonthlyReport month={month} entries={monthEntries} yearEntries={yearEntries} categories={yearCategories} /> : null}
        {tab === "年度預算" ? <BudgetTab categories={yearCategories} entries={yearEntries} onUpdateBudget={updateBudget} /> : null}
        {tab === "資產負債表" ? <BalanceSheetTab items={balanceItems.filter((item) => item.rotaryYearId === yearId)} entries={yearEntries} /> : null}
      </section>
    </main>
  );
}

function EntryCard({ entry, onEdit, onDelete }: { entry: AccountingEntry; onEdit: (entry: AccountingEntry) => void; onDelete: (entryId: string) => void }) {
  return <article className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]"><p className="text-sm font-bold text-[#C99700]">{entry.entryDate}｜{entry.entryType === "income" ? "收入" : "支出"}</p><h3 className="mt-1 text-xl font-bold">{entry.category || entry.description}</h3><p className="mt-2 font-bold">{formatCurrency(entry.amount)}</p><p className="text-sm font-semibold text-[#173B73]/75">{entry.description}</p><div className="mt-4 grid grid-cols-2 gap-3"><button type="button" onClick={() => onEdit(entry)} className={`rounded-2xl bg-[#F7C948] py-3 font-bold ${buttonShadow}`}>編輯</button><button type="button" onClick={() => onDelete(entry.id)} className={`rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}>刪除</button></div></article>;
}

function MonthlyReport({ month, entries, yearEntries, categories }: { month: string; entries: AccountingEntry[]; yearEntries: AccountingEntry[]; categories: AccountingCategory[] }) {
  const monthIncome = sumEntries(entries, "income");
  const monthExpense = sumEntries(entries, "expense");
  const yearIncome = sumEntries(yearEntries, "income");
  const yearExpense = sumEntries(yearEntries, "expense");
  return <section className="space-y-4"><div className="flex gap-2 print:hidden"><button type="button" onClick={() => window.print()} className={`rounded-2xl bg-[#F7C948] px-4 py-2 font-bold ${buttonShadow}`}>列印 A4</button></div><div className="rounded-3xl bg-white p-5 text-black"><h2 className="text-center text-2xl font-bold">高雄晨光扶輪社</h2><p className="mt-1 text-center font-bold">{toRocMonth(month)}月份收支明細表</p><ReportTable title="收入" type="income" entries={entries} yearEntries={yearEntries} categories={categories} /><ReportTable title="支出" type="expense" entries={entries} yearEntries={yearEntries} categories={categories} /><div className="mt-5 grid gap-2 text-sm font-bold sm:grid-cols-2"><p>本月收入總計：{formatCurrency(monthIncome)}</p><p>本月支出總計：{formatCurrency(monthExpense)}</p><p>本月收支差額：{formatCurrency(monthIncome - monthExpense)}</p><p>年度累計差額：{formatCurrency(yearIncome - yearExpense)}</p></div></div></section>;
}

function ReportTable({ title, type, entries, yearEntries, categories }: { title: string; type: EntryType; entries: AccountingEntry[]; yearEntries: AccountingEntry[]; categories: AccountingCategory[] }) {
  const rows = buildReportRows(type, entries, yearEntries, categories);
  return <div className="mt-5"><h3 className="font-bold">{title}</h3><table className="mt-2 w-full border-collapse text-sm"><thead><tr><th className="border p-2">科目</th><th className="border p-2">本月金額</th><th className="border p-2">年度累計</th><th className="border p-2">年度預算</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name}><td className="border p-2">{row.groupName} / {row.name}</td><td className="border p-2 text-right">{formatCurrency(row.monthAmount)}</td><td className="border p-2 text-right">{formatCurrency(row.yearAmount)}</td><td className="border p-2 text-right">{formatCurrency(row.annualBudget)}</td></tr>)}</tbody></table></div>;
}

function BudgetTab({ categories, entries, onUpdateBudget }: { categories: AccountingCategory[]; entries: AccountingEntry[]; onUpdateBudget: (category: AccountingCategory, budget: number) => void }) {
  return <section className="space-y-3">{categories.map((category) => { const spent = entries.filter((entry) => entry.category === category.name && entry.entryType === category.entryType).reduce((total, entry) => total + entry.amount, 0); const rate = category.annualBudget > 0 ? Math.round((spent / category.annualBudget) * 100) : 0; return <div key={category.id} className="rounded-3xl bg-white/85 p-5"><p className="text-sm font-bold text-[#C99700]">{category.entryType === "income" ? "收入" : "支出"} / {category.groupName}</p><h3 className="text-xl font-bold">{category.name}</h3><input type="number" value={category.annualBudget} onChange={(event) => onUpdateBudget(category, Number(event.target.value) || 0)} className="mt-3 w-full rounded-2xl border border-[#E5D9BD] px-4 py-3" /><p className="mt-2 text-sm font-bold">已執行：{formatCurrency(spent)}｜剩餘：{formatCurrency(category.annualBudget - spent)}｜執行率：{rate}%</p></div>; })}</section>;
}

function BalanceSheetTab({ items, entries }: { items: BalanceSheetItem[]; entries: AccountingEntry[] }) {
  const yearBalance = sumEntries(entries, "income") - sumEntries(entries, "expense");
  const assetTotal = items.filter((item) => item.itemType === "asset").reduce((total, item) => total + item.amount, 0);
  const liabilityFundTotal = items.filter((item) => item.itemType !== "asset").reduce((total, item) => total + item.amount, 0) + yearBalance;
  return <section className="space-y-4"><button type="button" onClick={() => window.print()} className={`rounded-2xl bg-[#F7C948] px-4 py-2 font-bold print:hidden ${buttonShadow}`}>列印 A4</button><div className="rounded-3xl bg-white p-5 text-black"><h2 className="text-center text-2xl font-bold">高雄晨光扶輪社簡式資產負債表</h2>{assetTotal !== liabilityFundTotal ? <p className="mt-3 rounded-2xl bg-red-50 p-3 text-center font-bold text-red-700">不平衡差額：{formatCurrency(assetTotal - liabilityFundTotal)}</p> : null}<BalanceList title="資產" items={items.filter((item) => item.itemType === "asset")} /><BalanceList title="負債及基金" items={items.filter((item) => item.itemType !== "asset")} extraLabel="本年度累積結餘" extraTotal={yearBalance} /><div className="mt-8 grid grid-cols-4 gap-4 text-center text-sm"><p>社長</p><p>秘書</p><p>會計長</p><p>製表</p></div></div></section>;
}

function BalanceList({ title, items, extraLabel, extraTotal = 0 }: { title: string; items: BalanceSheetItem[]; extraLabel?: string; extraTotal?: number }) { const total = items.reduce((sum, item) => sum + item.amount, 0) + extraTotal; return <div className="mt-5"><h3 className="font-bold">{title}</h3>{items.map((item) => <p key={item.id} className="flex justify-between border-b py-1"><span>{item.groupName} / {item.name}</span><span>{formatCurrency(item.amount)}</span></p>)}{extraLabel ? <p className="flex justify-between border-b py-1"><span>{extraLabel}</span><span>{formatCurrency(extraTotal)}</span></p> : null}<p className="flex justify-between pt-2 font-bold"><span>合計</span><span>{formatCurrency(total)}</span></p></div>; }

function Input({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label className="block"><span className="text-sm font-bold">{label}</span><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3" /></label>; }
function mapCategory(row: Record<string, unknown>): AccountingCategory { return { id: text(row.id), rotaryYearId: text(row.rotary_year_id), entryType: text(row.entry_type) === "expense" ? "expense" : "income", groupName: text(row.group_name), name: text(row.name), annualBudget: number(row.annual_budget) }; }
function toCategoryRow(category: AccountingCategory) { return { id: category.id, rotary_year_id: category.rotaryYearId, entry_type: category.entryType, group_name: category.groupName, name: category.name, annual_budget: category.annualBudget }; }
function mapEntry(row: Record<string, unknown>): AccountingEntry { return { id: text(row.id), rotaryYearId: text(row.rotary_year_id), entryDate: text(row.entry_date), entryType: text(row.entry_type) === "expense" ? "expense" : "income", categoryId: text(row.category_id), category: text(row.category), description: text(row.description), amount: number(row.amount), paymentMethod: text(row.payment_method), referenceNo: text(row.reference_no), isPassThrough: Boolean(row.is_pass_through), note: text(row.note) }; }
function toEntryRow(entry: AccountingEntry) { return { id: entry.id, rotary_year_id: entry.rotaryYearId || null, entry_date: entry.entryDate, entry_type: entry.entryType, category_id: entry.categoryId || null, category: entry.category, description: entry.description, amount: entry.amount, payment_method: entry.paymentMethod, reference_no: entry.referenceNo, is_pass_through: entry.isPassThrough, note: entry.note }; }
function mapBalanceItem(row: Record<string, unknown>): BalanceSheetItem { return { id: text(row.id), rotaryYearId: text(row.rotary_year_id), itemType: text(row.item_type) === "asset" ? "asset" : text(row.item_type) === "fund" ? "fund" : "liability", groupName: text(row.group_name), name: text(row.name), amount: number(row.amount) }; }
function buildReportRows(type: EntryType, monthEntries: AccountingEntry[], yearEntries: AccountingEntry[], categories: AccountingCategory[]) { const names = new Set([...categories.filter((category) => category.entryType === type).map((category) => category.name), ...yearEntries.filter((entry) => entry.entryType === type).map((entry) => entry.category)]); return [...names].filter(Boolean).map((name) => { const category = categories.find((item) => item.name === name); return { groupName: category?.groupName ?? "未分類", name, monthAmount: monthEntries.filter((entry) => entry.entryType === type && entry.category === name).reduce((total, entry) => total + entry.amount, 0), yearAmount: yearEntries.filter((entry) => entry.entryType === type && entry.category === name).reduce((total, entry) => total + entry.amount, 0), annualBudget: category?.annualBudget ?? 0 }; }); }
function sumEntries(entries: AccountingEntry[], type: EntryType) { return entries.filter((entry) => entry.entryType === type).reduce((total, entry) => total + entry.amount, 0); }
function text(value: unknown) { if (typeof value === "string") return value; if (typeof value === "number") return String(value); return ""; }
function number(value: unknown) { return Number(value) || 0; }
function formatCurrency(value: number) { return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(value); }
function toRocMonth(month: string) { const [year, monthNumber] = month.split("-"); return `${Number(year) - 1911}年${Number(monthNumber)}`; }
function downloadCsv(filename: string, rows: string[][]) { const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n"); const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
