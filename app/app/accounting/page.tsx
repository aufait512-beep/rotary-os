"use client";

import Link from "next/link";
import { Fragment, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import BalanceSheetManager from "./BalanceSheetManager";
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

type CategoryFormState = {
  id: string;
  rotaryYearId: string;
  entryType: EntryType;
  groupName: string;
  name: string;
  annualBudget: number;
  sortOrder: number;
  isActive: boolean;
};

type BudgetImportRow = CategoryFormState & {
  previewId: string;
  status: string;
  error: string;
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


type AccountingBalanceCategory = {
  id: string;
  rotaryYearId: string;
  itemType: "asset" | "liability" | "fund";
  groupName: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

type AccountingBalanceSnapshot = {
  id: string;
  rotaryYearId: string;
  reportMonth: string;
  reportDate: string;
};

type AccountingBalanceValue = {
  id: string;
  snapshotId: string;
  categoryId: string;
  amount: number;
};

type BalanceReportItem = {
  id: string;
  itemType: "asset" | "liability" | "fund";
  groupName: string;
  name: string;
  amount: number;
  sortOrder: number;
};

type BalanceReportGroup = {
  groupName: string;
  items: BalanceReportItem[];
  total: number;
};

type BalanceReport = {
  hasSnapshot: boolean;
  assetGroups: BalanceReportGroup[];
  liabilityFundGroups: BalanceReportGroup[];
  assetTotal: number;
  liabilityFundTotal: number;
  balanceDifference: number;
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
  paymentMethod: "頧董",
  referenceNo: "",
  isPassThrough: false,
  note: "",
};

export default function AccountingPage() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("每月收支報表");
  const [years, setYears] = useState<RotaryYear[]>([]);
  const [categories, setCategories] = useState<AccountingCategory[]>([]);
  const [entries, setEntries] = useState<AccountingEntry[]>([]);
  const [balanceCategories, setBalanceCategories] = useState<AccountingBalanceCategory[]>([]);
  const [balanceSnapshot, setBalanceSnapshot] = useState<AccountingBalanceSnapshot | null>(null);
  const [balanceValues, setBalanceValues] = useState<AccountingBalanceValue[]>([]);
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
      const [loadedYears, categoryRows, entryRows, closeRows] = await Promise.all([
        fetchRotaryYears(),
        supabase.from("accounting_categories").select("*").order("sort_order"),
        supabase.from("accounting_entries").select("*").order("entry_date", { ascending: false }),
        supabase.from("accounting_month_closes").select("*").order("report_month", { ascending: false }),
      ]);
      if (categoryRows.error) throw categoryRows.error;
      if (entryRows.error) throw entryRows.error;
      if (closeRows.error) throw closeRows.error;

      const activeYear = loadedYears.find((year) => year.isActive) ?? loadedYears[0];
      setYears(loadedYears);
      setCategories((categoryRows.data ?? []).map(mapCategory));
      setEntries((entryRows.data ?? []).map(mapEntry));
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

  const loadMonthlyBalanceSheet = useCallback(async () => {
    if (!yearId || !month) {
      setBalanceCategories([]);
      setBalanceSnapshot(null);
      setBalanceValues([]);
      return;
    }

    const reportMonth = month + "-01";
    const [categoryRows, snapshotRows] = await Promise.all([
      supabase
        .from("accounting_balance_categories")
        .select("*")
        .eq("rotary_year_id", yearId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("accounting_balance_snapshots")
        .select("*")
        .eq("rotary_year_id", yearId)
        .eq("report_month", reportMonth)
        .maybeSingle(),
    ]);

    if (categoryRows.error) {
      console.error({
        module: "accounting",
        operation: "fetch balance categories for monthly report",
        table: "accounting_balance_categories",
        error: categoryRows.error,
      });
      setErrorMessage(getErrorMessage(categoryRows.error, "Balance sheet categories failed to load"));
      return;
    }
    if (snapshotRows.error) {
      console.error({
        module: "accounting",
        operation: "fetch balance snapshot for monthly report",
        table: "accounting_balance_snapshots",
        error: snapshotRows.error,
      });
      setErrorMessage(getErrorMessage(snapshotRows.error, "Balance sheet snapshot failed to load"));
      return;
    }

    const nextCategories = (categoryRows.data ?? []).map(mapAccountingBalanceCategory);
    setBalanceCategories(nextCategories);

    if (!snapshotRows.data) {
      setBalanceSnapshot(null);
      setBalanceValues([]);
      return;
    }

    const nextSnapshot = mapAccountingBalanceSnapshot(snapshotRows.data);
    const valueRows = await supabase
      .from("accounting_balance_values")
      .select("*")
      .eq("snapshot_id", nextSnapshot.id);

    if (valueRows.error) {
      console.error({
        module: "accounting",
        operation: "fetch balance values for monthly report",
        table: "accounting_balance_values",
        error: valueRows.error,
      });
      setErrorMessage(getErrorMessage(valueRows.error, "Balance sheet values failed to load"));
      return;
    }

    setBalanceSnapshot(nextSnapshot);
    setBalanceValues((valueRows.data ?? []).map(mapAccountingBalanceValue));
  }, [month, yearId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadMonthlyBalanceSheet();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [loadMonthlyBalanceSheet]);

  const selectedYear = years.find((year) => year.id === yearId);
  const monthEnd = cutoffDate || getMonthEnd(month);
  const monthStart = month + "-01";
  const yearStart = selectedYear?.startDate ?? month.slice(0, 4) + "-07-01";
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
    () => buildReport(yearCategories, monthEntries, yearToDateEntries, balanceCategories, balanceSnapshot, balanceValues),
    [yearCategories, monthEntries, yearToDateEntries, balanceCategories, balanceSnapshot, balanceValues]
  );
  const checks = buildReportChecks(yearCategories, monthEntries, report);

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    if (isClosedMonth(form.entryDate, monthCloses, form.rotaryYearId)) {
      setErrorMessage("本月份已月結，請先解除月結後再新增或編輯。");
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
      setErrorMessage("收支紀錄儲存失敗：" + error.message);
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
      setErrorMessage("本月份已月結，請先解除月結後再操作。");
      return;
    }
    if (!window.confirm("確定要刪除此收支紀錄嗎？")) return;
    const { error } = await supabase.from("accounting_entries").delete().eq("id", entryId);
    if (error) {
      setErrorMessage("收支紀錄刪除失敗：" + error.message);
      return;
    }
    setEntries((currentEntries) => currentEntries.filter((item) => item.id !== entryId));
  }

  function editEntry(entry: AccountingEntry) {
    if (isClosedMonth(entry.entryDate, monthCloses, entry.rotaryYearId)) {
      setErrorMessage("本月份已月結，請先解除月結後再操作。");
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
    await saveCategory({ ...category, annualBudget });
  }

  async function saveCategory(category: CategoryFormState) {
    setErrorMessage("");
    if (!category.rotaryYearId || !category.groupName.trim() || !category.name.trim()) {
      setErrorMessage("請選擇年度，並填寫大項與子科目名稱。");
      return null;
    }
    if (category.annualBudget < 0 || !Number.isInteger(category.annualBudget)) {
      setErrorMessage("年度預算必須是 0 以上整數。");
      return null;
    }
    const duplicated = categories.find(
      (item) =>
        item.id !== category.id &&
        item.rotaryYearId === category.rotaryYearId &&
        item.entryType === category.entryType &&
        item.groupName.trim() === category.groupName.trim() &&
        item.name.trim() === category.name.trim()
    );
    if (duplicated) {
      setErrorMessage("同年度、同類型、同大項、同子科目不可重複。");
      return null;
    }

    const { data, error } = await supabase
      .from("accounting_categories")
      .upsert(toCategoryRow({ ...category, id: category.id || crypto.randomUUID() }), { onConflict: "id" })
      .select()
      .single();
    if (error) {
      setErrorMessage("年度預算科目儲存失敗：" + error.message);
      return null;
    }
    const savedCategory = mapCategory(data);
    setCategories((currentCategories) =>
      currentCategories.some((item) => item.id === savedCategory.id)
        ? currentCategories.map((item) => (item.id === savedCategory.id ? savedCategory : item))
        : [...currentCategories, savedCategory]
    );
    setMessage("年度預算科目已儲存。");
    return savedCategory;
  }

  async function deleteCategory(category: AccountingCategory) {
    const hasEntries = entries.some((entry) => sameCategory(entry, category));
    if (hasEntries) {
      setErrorMessage("此科目已有交易紀錄，不可刪除，請改為停用。");
      return;
    }
    if (!window.confirm("確定要刪除 " + category.groupName + " / " + category.name + " 嗎？")) return;
    if (!window.confirm("再次確認：刪除後不可復原。")) return;
    const { error } = await supabase.from("accounting_categories").delete().eq("id", category.id);
    if (error) {
      setErrorMessage("預算科目刪除失敗：" + error.message);
      return;
    }
    setCategories((currentCategories) => currentCategories.filter((item) => item.id !== category.id));
  }

  async function closeMonth() {
    if (!yearId || !month) return;
    if (!window.confirm("確定要鎖定 " + month + " 嗎？鎖定後需解除月結才能修改。")) return;
    const payload = {
      id: currentClose?.id ?? crypto.randomUUID(),
      rotary_year_id: yearId,
      report_month: month,
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by: "會計",
      note: currentClose?.note || "",
    };
    const { data, error } = await supabase
      .from("accounting_month_closes")
      .upsert(payload, { onConflict: "rotary_year_id,report_month" })
      .select()
      .single();
    if (error) {
      setErrorMessage("月結失敗：" + error.message);
      return;
    }
    setMonthCloses((current) => upsertClose(current, mapMonthClose(data)));
    setMessage(month + " 已完成月結。");
  }

  async function unlockMonth() {
    if (!currentClose || !unlockReason.trim()) {
      setErrorMessage("請填寫解除月結原因。");
      return;
    }
    const { data, error } = await supabase
      .from("accounting_month_closes")
      .update({ status: "draft", note: unlockReason })
      .eq("id", currentClose.id)
      .select()
      .single();
    if (error) {
      setErrorMessage("解除月結失敗：" + error.message);
      return;
    }
    await supabase.from("accounting_month_close_logs").insert({
      month_close_id: currentClose.id,
      action: "unlock",
      reason: unlockReason,
    });
    setMonthCloses((current) => upsertClose(current, mapMonthClose(data)));
    setUnlockReason("");
    setMessage(month + " 已解除月結。");
  }

  function exportCsv() {
    downloadCsv("高雄晨光扶輪社_會計收支紀錄.csv", [
      ["日期", "收入/支出", "科目", "摘要", "金額", "付款方式", "憑證編號", "備註"],
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
      link.download = "accounting-monthly-report_" + month + ".jpg";
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
      <style>{[
        "@media print {",
        "body * { visibility: hidden; }",
        "#accounting-monthly-report, #accounting-monthly-report * { visibility: visible; }",
        "#accounting-monthly-report { position: absolute; left: 0; top: 0; width: 100%; }",
        "}",
      ].join("\n")}</style>
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="mx-auto max-w-md space-y-3 print:hidden">
          <Link href="/" className="text-sm font-bold text-[#173B73]/75">
            返回首頁
          </Link>
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-[#C99700]">Rotary OS</p>
            <h1 className="mt-2 text-3xl font-bold">會計管理</h1>
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
              className={
                "rounded-2xl px-3 py-3 text-sm font-bold " +
                (tab === item ? "bg-[#F7C948]" : "bg-white") +
                " " +
                buttonShadow
              }
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
          <BudgetTab
            years={years}
            yearId={yearId}
            categories={yearCategories}
            allCategories={categories}
            entries={yearToDateEntries}
            onYearChange={(nextYearId) => {
              setYearId(nextYearId);
              setForm((currentForm) => ({ ...currentForm, rotaryYearId: nextYearId }));
            }}
            onSaveCategory={saveCategory}
            onDeleteCategory={deleteCategory}
            onUpdateBudget={updateBudget}
          />
        ) : null}
        {tab === "資產負債表" ? (
          <BalanceSheetManager
            years={years}
            yearId={yearId}
            month={month}
            cutoffDate={monthEnd}
            entries={entries}
            monthCloses={monthCloses}
            onSaved={loadMonthlyBalanceSheet}
          />
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
            <option value="">選擇科目</option>
            {formCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.groupName} / {category.name}
              </option>
            ))}
          </select>
        </label>
        <Input label="摘要" value={form.description} onChange={(value) => onChange({ ...form, description: value })} required />
        <Input label="金額" type="number" value={String(form.amount)} onChange={(value) => onChange({ ...form, amount: Number(value) || 0 })} required />
        <Input label="付款方式" value={form.paymentMethod} onChange={(value) => onChange({ ...form, paymentMethod: value })} />
        <Input label="憑證或參考編號" value={form.referenceNo} onChange={(value) => onChange({ ...form, referenceNo: value })} />
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={form.isPassThrough} onChange={(event) => onChange({ ...form, isPassThrough: event.target.checked })} />
          暫付款 / 代收付
        </label>
        <Input label="備註" value={form.note} onChange={(value) => onChange({ ...form, note: value })} />
        <button type="submit" className={"w-full rounded-2xl bg-[#F7C948] py-4 font-bold " + buttonShadow}>
          {editingId ? "儲存修改" : "新增收支"}
        </button>
      </form>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">收支紀錄</h2>
          <button type="button" onClick={onExportCsv} className={"rounded-2xl bg-[#F7C948] px-4 py-2 text-sm font-bold " + buttonShadow}>
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
        {locked ? <span className="rounded-full bg-[#173B73] px-3 py-1 text-xs font-bold text-white">已月結</span> : null}
      </div>
      <p className="mt-2 font-bold">{formatCurrency(entry.amount)}</p>
      <p className="text-sm font-semibold text-[#173B73]/75">{entry.description}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" disabled={locked} onClick={() => onEdit(entry)} className={"rounded-2xl bg-[#F7C948] py-3 font-bold disabled:opacity-50 " + buttonShadow}>編輯</button>
        <button type="button" disabled={locked} onClick={() => onDelete(entry.id)} className={"rounded-2xl bg-white py-3 font-bold disabled:opacity-50 " + buttonShadow}>刪除</button>
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
        <button type="button" onClick={onPrint} className={"rounded-2xl bg-[#F7C948] px-4 py-2 font-bold " + buttonShadow}>列印</button>
        <button type="button" onClick={onExportJpg} disabled={isExportingJpg} className={"rounded-2xl bg-white px-4 py-2 font-bold disabled:opacity-60 " + buttonShadow}>
          {isExportingJpg ? "匯出中" : "匯出 JPG"}
        </button>
        <button type="button" onClick={onExportCsv} className={"rounded-2xl bg-white px-4 py-2 font-bold " + buttonShadow}>匯出 CSV</button>
        {status === "closed" ? (
          <span className="rounded-full bg-[#173B73] px-4 py-2 text-sm font-bold text-white">已月結</span>
        ) : (
          <button type="button" onClick={onCloseMonth} className={"rounded-2xl bg-[#F7C948] px-4 py-2 font-bold " + buttonShadow}>鎖定本月</button>
        )}
      </div>
      {status === "closed" ? (
        <div className="grid gap-2 rounded-3xl bg-white/85 p-4 print:hidden sm:grid-cols-[1fr_auto]">
          <input
            value={unlockReason}
            onChange={(event) => onUnlockReasonChange(event.target.value)}
            placeholder="解除月結原因"
            className="rounded-2xl border border-[#E5D9BD] px-4 py-3"
          />
          <button type="button" onClick={onUnlockMonth} className={"rounded-2xl bg-white px-4 py-3 font-bold " + buttonShadow}>解除月結</button>
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
          <p className="mt-1 text-center text-lg font-bold">{toRocMonth(month)}收支明細表</p>
          <p className="mt-1 text-center text-sm">統計日期：{formatDate(cutoffDate)}</p>
          <TwoColumnReport expenseRows={report.expenseRows} incomeRows={report.incomeRows} />
          <ReportClosing report={report} />
          <MonthlyBalanceSheetSection report={report} />
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
      <td className={"border border-black px-2 py-2 " + (isSubtotal ? "font-bold" : "")}>{isSubtotal ? row.groupName + " 小計" : row.groupName + " / " + row.name}</td>
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

function MonthlyBalanceSheetSection({ report }: { report: ReturnType<typeof buildReport> }) {
  if (!report.balanceSheet.hasSnapshot) {
    return (
      <section className="mt-6">
        <h3 className="text-lg font-bold">資產負債表</h3>
        <p className="mt-2 rounded-2xl border border-dashed border-black/30 p-4 text-center font-bold">
          本月份尚未建立資產負債表
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6">
        <h3 className="text-lg font-bold">資產負債表</h3>
      {report.balanceSheet.balanceDifference !== 0 ? (
        <p className="mt-2 font-bold text-red-600">
          資產負債表不平衡，差額 {formatCurrency(report.balanceSheet.balanceDifference)}。
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-4">
        <MonthlyBalanceColumn title="資產" groups={report.balanceSheet.assetGroups} total={report.balanceSheet.assetTotal} />
        <MonthlyBalanceColumn title="負債及基金" groups={report.balanceSheet.liabilityFundGroups} total={report.balanceSheet.liabilityFundTotal} />
      </div>
    </section>
  );
}

function MonthlyBalanceColumn({ title, groups, total }: { title: string; groups: BalanceReportGroup[]; total: number }) {
  return (
    <section>
      <h4 className="font-bold">{title}</h4>
      <table className="mt-2 w-full border-collapse text-sm">
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.groupName}>
              <tr className="bg-[#F8F3E8] font-bold">
                <td className="border border-black px-2 py-1" colSpan={2}>{group.groupName}</td>
              </tr>
              {group.items.map((item) => (
                <tr key={item.id}>
                  <td className="border border-black px-2 py-1">{normalizeBalanceName(item.name)}</td>
                  <td className="border border-black px-2 py-1 text-right">{formatCurrency(item.amount)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td className="border border-black px-2 py-1">{group.groupName}小計</td>
                <td className="border border-black px-2 py-1 text-right">{formatCurrency(group.total)}</td>
              </tr>
            </Fragment>
          ))}
          <tr className="font-bold">
            <td className="border border-black px-2 py-2">{title}合計</td>
            <td className="border border-black px-2 py-2 text-right">{formatCurrency(total)}</td>
          </tr>
        </tbody>
      </table>
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

function BudgetTab({
  years,
  yearId,
  categories,
  allCategories,
  entries,
  onYearChange,
  onSaveCategory,
  onDeleteCategory,
  onUpdateBudget,
}: {
  years: RotaryYear[];
  yearId: string;
  categories: AccountingCategory[];
  allCategories: AccountingCategory[];
  entries: AccountingEntry[];
  onYearChange: (yearId: string) => void;
  onSaveCategory: (category: CategoryFormState) => Promise<AccountingCategory | null>;
  onDeleteCategory: (category: AccountingCategory) => void;
  onUpdateBudget: (category: AccountingCategory, budget: number) => void;
}) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>({
    id: "",
    rotaryYearId: yearId,
    entryType: "income",
    groupName: "",
    name: "",
    annualBudget: 0,
    sortOrder: 1000,
    isActive: true,
  });
  const [importRows, setImportRows] = useState<BudgetImportRow[]>([]);
  const [importMessage, setImportMessage] = useState("");
  const incomeBudget = categories
    .filter((category) => category.entryType === "income")
    .reduce((total, category) => total + category.annualBudget, 0);
  const expenseBudget = categories
    .filter((category) => category.entryType === "expense")
    .reduce((total, category) => total + category.annualBudget, 0);
  const budgetDifference = incomeBudget - expenseBudget;
  const sortedCategories = [...categories].sort((first, second) => {
    if (first.entryType !== second.entryType) return first.entryType === "income" ? -1 : 1;
    return first.sortOrder - second.sortOrder;
  });

  async function parseBudgetExcel(file: File) {
    const xlsx = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(buffer, { type: "array" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: "" });
    const parsedRows = parseBudgetRows(rows, yearId, allCategories);
    setImportRows(parsedRows);
    setImportMessage("已解析 " + parsedRows.length + " 筆預算科目，請確認後匯入。");
  }

  function updateImportRow(previewId: string, patch: Partial<BudgetImportRow>) {
    setImportRows((currentRows) =>
      currentRows.map((row) => (row.previewId === previewId ? { ...row, ...patch } : row))
    );
  }

  async function confirmImport() {
    const validRows = importRows.filter((row) => !validateCategoryLike(row));
    if (validRows.length === 0) {
      setImportMessage("沒有可匯入的預算科目。");
      return;
    }
    if (!window.confirm("確定匯入 " + validRows.length + " 筆預算科目嗎？")) return;

    let savedCount = 0;
    for (const row of validRows) {
      const savedCategory = await onSaveCategory(row);
      if (savedCategory) savedCount += 1;
    }
    setImportRows([]);
    setImportMessage("年度預算匯入完成：" + savedCount + " 筆。");
  }

  async function submitCategoryForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const existingCategory = editingCategoryId
      ? categories.find((category) => category.id === editingCategoryId)
      : undefined;
    const hasEntries = existingCategory
      ? entries.some((entry) => sameCategory(entry, existingCategory))
      : false;
    const nameChanged =
      existingCategory &&
      (existingCategory.groupName !== categoryForm.groupName ||
        existingCategory.name !== categoryForm.name);
    if (hasEntries && nameChanged) {
      const confirmed = window.confirm("此科目已有交易紀錄，修改名稱可能影響歷史報表，確定要繼續嗎？");
      if (!confirmed) return;
    }

    const savedCategory = await onSaveCategory({ ...categoryForm, rotaryYearId: yearId });
    if (savedCategory) {
      setIsFormOpen(false);
      setEditingCategoryId("");
      setCategoryForm({
        id: "",
        rotaryYearId: yearId,
        entryType: "income",
        groupName: "",
        name: "",
        annualBudget: 0,
        sortOrder: 1000,
        isActive: true,
      });
    }
  }

  function editCategory(category: AccountingCategory) {
    setEditingCategoryId(category.id);
    setCategoryForm({
      id: category.id,
      rotaryYearId: category.rotaryYearId,
      entryType: category.entryType,
      groupName: category.groupName,
      name: category.name,
      annualBudget: category.annualBudget,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    });
    setIsFormOpen(true);
  }

  return (
    <section className="space-y-5 print:hidden">
      <div className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
        <h2 className="text-2xl font-bold">年度預算總覽</h2>
        <label className="mt-4 block">
            <span className="text-sm font-bold">年度</span>
          <select
            value={yearId}
            onChange={(event) => onYearChange(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3"
          >
            {years.map((year) => (
              <option key={year.id} value={year.id}>
                {year.displayName || year.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SummaryBox label="收入預算合計" value={incomeBudget} />
          <SummaryBox label="支出預算合計" value={expenseBudget} />
          <SummaryBox label="預算差額" value={budgetDifference} />
        </div>
        {budgetDifference !== 0 ? (
          <p className="mt-4 rounded-2xl bg-[#FFF6D6] p-4 text-sm font-bold">
            本年度收入與支出預算尚未平衡，差額 {formatCurrency(budgetDifference)}。
          </p>
        ) : null}
      </div>

      <div className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
        <h2 className="text-xl font-bold">匯入年度預算 Excel</h2>
        <p className="mt-2 text-sm font-semibold text-[#173B73]/70">
          只匯入收入／支出類型、預算大項、子科目、年度預算與排序；不匯入任何每月實際金額或資產負債金額。
        </p>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void parseBudgetExcel(file);
            event.currentTarget.value = "";
          }}
          className="mt-4 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3"
        />
        {importMessage ? <p className="mt-3 rounded-2xl bg-green-50 p-3 text-sm font-bold text-green-700">{importMessage}</p> : null}
        {importRows.length > 0 ? (
          <div className="mt-4 space-y-3">
            <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {importRows.map((row) => (
                <article key={row.previewId} className="rounded-2xl bg-[#F8F3E8] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-bold">{row.entryType === "income" ? "收入" : "支出"}｜{row.groupName} / {row.name || "未命名科目"}</p>
                    <span className={"shrink-0 rounded-full px-3 py-1 text-xs font-bold " + (row.error ? "bg-red-100 text-red-700" : "bg-white text-[#173B73]")}>
                      {row.error || row.status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <select value={row.entryType} onChange={(event) => updateImportRow(row.previewId, { entryType: event.target.value as EntryType })} className="rounded-2xl border border-[#E5D9BD] px-3 py-2">
                      <option value="income">收入</option>
                      <option value="expense">支出</option>
                    </select>
                    <input value={row.groupName} onChange={(event) => updateImportRow(row.previewId, { groupName: event.target.value })} className="rounded-2xl border border-[#E5D9BD] px-3 py-2" />
                    <input value={row.name} onChange={(event) => updateImportRow(row.previewId, { name: event.target.value })} className="rounded-2xl border border-[#E5D9BD] px-3 py-2" />
                    <input type="number" min={0} value={row.annualBudget} onChange={(event) => updateImportRow(row.previewId, { annualBudget: Math.max(0, Number(event.target.value) || 0) })} className="rounded-2xl border border-[#E5D9BD] px-3 py-2" />
                    <input type="number" value={row.sortOrder} onChange={(event) => updateImportRow(row.previewId, { sortOrder: Number(event.target.value) || 0 })} className="rounded-2xl border border-[#E5D9BD] px-3 py-2" />
                  </div>
                </article>
              ))}
            </div>
            <button type="button" onClick={confirmImport} className={"w-full rounded-2xl bg-[#F7C948] py-4 font-bold " + buttonShadow}>
              確認匯入年度預算
            </button>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => {
          setIsFormOpen((currentValue) => !currentValue);
          setEditingCategoryId("");
          setCategoryForm({
            id: "",
            rotaryYearId: yearId,
            entryType: "income",
            groupName: "",
            name: "",
            annualBudget: 0,
            sortOrder: 1000,
            isActive: true,
          });
        }}
        className={"w-full rounded-2xl bg-[#F7C948] py-4 font-bold " + buttonShadow}
      >
        {isFormOpen ? "收合預算科目表單" : "新增預算科目"}
      </button>

      {isFormOpen ? (
        <form onSubmit={submitCategoryForm} className="space-y-4 rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
          <h2 className="text-xl font-bold">{editingCategoryId ? "編輯預算科目" : "新增預算科目"}</h2>
          <label className="block">
            <span className="text-sm font-bold">類型</span>
            <select value={categoryForm.entryType} onChange={(event) => setCategoryForm({ ...categoryForm, entryType: event.target.value as EntryType })} className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3">
              <option value="income">收入</option>
              <option value="expense">支出</option>
            </select>
          </label>
          <Input label="預算大項" value={categoryForm.groupName} onChange={(value) => setCategoryForm({ ...categoryForm, groupName: value })} required />
          <Input label="子科目名稱" value={categoryForm.name} onChange={(value) => setCategoryForm({ ...categoryForm, name: value })} required />
          <Input label="年度預算" type="number" value={String(categoryForm.annualBudget)} onChange={(value) => setCategoryForm({ ...categoryForm, annualBudget: Math.max(0, Number(value) || 0) })} />
          <Input label="顯示順序" type="number" value={String(categoryForm.sortOrder)} onChange={(value) => setCategoryForm({ ...categoryForm, sortOrder: Number(value) || 0 })} />
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={categoryForm.isActive} onChange={(event) => setCategoryForm({ ...categoryForm, isActive: event.target.checked })} />
            啟用
          </label>
          <button type="submit" className={"w-full rounded-2xl bg-[#F7C948] py-4 font-bold " + buttonShadow}>
            儲存預算科目
          </button>
        </form>
      ) : null}

      {sortedCategories.map((category) => {
        const spent = entries
          .filter((entry) => sameCategory(entry, category))
          .reduce((total, entry) => total + entry.amount, 0);
        const rate = category.annualBudget > 0 ? Math.round((spent / category.annualBudget) * 100) : 0;
        const hasEntries = entries.some((entry) => sameCategory(entry, category));
        return (
          <div key={category.id} className="rounded-3xl bg-white/85 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-[#C99700]">{category.entryType === "income" ? "收入" : "支出"} / {category.groupName}</p>
                <h3 className="text-xl font-bold">{category.name}</h3>
              </div>
              <span className={"shrink-0 rounded-full px-3 py-1 text-xs font-bold text-white " + (category.isActive ? "bg-[#173B73]" : "bg-[#F47C6C]")}>
                {category.isActive ? "啟用" : "停用"}
              </span>
            </div>
            <input type="number" min={0} value={category.annualBudget} onChange={(event) => onUpdateBudget(category, Math.max(0, Number(event.target.value) || 0))} className="mt-3 w-full rounded-2xl border border-[#E5D9BD] px-4 py-3" />
            <p className="mt-2 text-sm font-bold">
              已登錄 {formatCurrency(spent)}｜年度預算 {category.annualBudget > 0 ? formatCurrency(category.annualBudget) : "未設定"}｜餘額 {category.annualBudget > 0 ? formatCurrency(category.entryType === "income" ? spent - category.annualBudget : category.annualBudget - spent) : "—"}｜執行率 {category.annualBudget > 0 ? rate + "%" : "—"}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => editCategory(category)} className={"rounded-2xl bg-[#F7C948] py-3 text-sm font-bold " + buttonShadow}>
                編輯
              </button>
              <button type="button" onClick={() => void onSaveCategory({ ...category, isActive: !category.isActive })} className={"rounded-2xl bg-white py-3 text-sm font-bold " + buttonShadow}>
                {category.isActive ? "停用" : "啟用"}
              </button>
              <button type="button" disabled={hasEntries} onClick={() => onDeleteCategory(category)} className={"rounded-2xl bg-white py-3 text-sm font-bold disabled:opacity-50 " + buttonShadow}>
                刪除
              </button>
            </div>
            {hasEntries ? <p className="mt-2 text-xs font-bold text-[#173B73]/60">已有交易紀錄，只能停用，不可刪除。</p> : null}
          </div>
        );
      })}
    </section>
  );
}

function SummaryBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-[#F8F3E8] p-4 font-bold">
      <p className="text-sm text-[#173B73]/70">{label}</p>
      <p className="mt-1 text-xl">{formatCurrency(value)}</p>
    </div>
  );
}

function SummaryCard({ title, monthAmount, yearAmount }: { title: string; monthAmount: number; yearAmount: number }) {
  return (
    <article className="rounded-3xl bg-white/85 p-4">
      <p className="text-sm font-bold text-[#C99700]">{title}</p>
      <p className="mt-1 text-xl font-bold"><Money value={monthAmount} /></p>
      <p className="mt-1 text-sm font-semibold">年度累計 <Money value={yearAmount} /></p>
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
  return <p className={"rounded-2xl border p-4 text-sm font-bold print:hidden " + className}>{children}</p>;
}

function Money({ value }: { value: number }) {
  return <span className={value < 0 ? "text-red-600" : "text-[#173B73]"}>{formatCurrency(value)}</span>;
}

function Input({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="block"><span className="text-sm font-bold">{label}</span><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3" /></label>;
}

function parseBudgetRows(
  rows: string[][],
  rotaryYearId: string,
  existingCategories: AccountingCategory[]
): BudgetImportRow[] {
  const parsedRows: BudgetImportRow[] = [];
  let currentType: EntryType | "" = "";
  let currentGroup = "";
  let groupSort = 0;
  let childSort = 0;

  rows.forEach((row, index) => {
    const firstCell = cleanCell(row[0]);
    const secondCell = cleanCell(row[1]);
    const thirdCell = row[2];
    const combinedCells = firstCell + " " + secondCell;

    if (firstCell.includes("收入科目") || secondCell.includes("收入科目") || firstCell.includes("收入預算") || secondCell.includes("收入預算")) {
      currentType = "income";
      currentGroup = "";
      groupSort = 0;
      childSort = 0;
      return;
    }
    if (firstCell.includes("支出科目") || secondCell.includes("支出科目") || firstCell.includes("支出預算") || secondCell.includes("支出預算")) {
      currentType = "expense";
      currentGroup = "";
      groupSort = 0;
      childSort = 0;
      return;
    }
    if (
      (combinedCells.includes("收入預算") || combinedCells.includes("支出預算")) &&
      !combinedCells.includes("收入科目") &&
      !combinedCells.includes("支出科目")
    ) {
      currentType = "";
      currentGroup = "";
      return;
    }
    if (!currentType || firstCell === "合計" || firstCell === "總計") return;

    const groupName = parseGroupName(firstCell);
    if (groupName) {
      currentGroup = groupName;
      groupSort += 1000;
      childSort = 0;
      const nextHasChild = hasFollowingChild(rows, index);
      if (!nextHasChild) {
        parsedRows.push(
          buildImportRow({
            rotaryYearId,
            entryType: currentType,
            groupName: currentGroup,
            name: currentGroup.replace(/^\d+\.\s*/, ""),
            annualBudget: parseBudgetAmount(thirdCell),
            sortOrder: groupSort + 10,
            existingCategories,
          })
        );
      }
      return;
    }

    if (secondCell) {
      childSort += 10;
      parsedRows.push(
        buildImportRow({
          rotaryYearId,
          entryType: currentType,
          groupName: currentGroup || "未分類",
          name: secondCell,
          annualBudget: parseBudgetAmount(thirdCell),
          sortOrder: groupSort + childSort,
          existingCategories,
        })
      );
    }
  });

  return parsedRows;
}

function buildImportRow({
  rotaryYearId,
  entryType,
  groupName,
  name,
  annualBudget,
  sortOrder,
  existingCategories,
}: {
  rotaryYearId: string;
  entryType: EntryType;
  groupName: string;
  name: string;
  annualBudget: number;
  sortOrder: number;
  existingCategories: AccountingCategory[];
}): BudgetImportRow {
  const existingCategory = existingCategories.find(
    (category) =>
      category.rotaryYearId === rotaryYearId &&
      category.entryType === entryType &&
      category.groupName === groupName &&
      category.name === name
  );
  const error = !name ? "找不到科目名稱" : annualBudget < 0 ? "金額錯誤" : "";
  const status = error
    ? error
    : existingCategory
      ? existingCategory.annualBudget === annualBudget && existingCategory.sortOrder === sortOrder
        ? "金額未變"
        : "更新既有科目"
      : "新增科目";

  return {
    previewId: crypto.randomUUID(),
    id: existingCategory?.id ?? "",
    rotaryYearId,
    entryType,
    groupName,
    name,
    annualBudget,
    sortOrder,
    isActive: true,
    status,
    error,
  };
}

function validateCategoryLike(category: Pick<CategoryFormState, "rotaryYearId" | "groupName" | "name" | "annualBudget">) {
  if (!category.rotaryYearId) return "請選擇年度";
  if (!category.groupName.trim()) return "請填寫預算大項";
  if (!category.name.trim()) return "找不到科目名稱";
  if (!Number.isInteger(category.annualBudget) || category.annualBudget < 0) return "金額錯誤";
  return "";
}

function hasFollowingChild(rows: string[][], groupIndex: number) {
  for (let index = groupIndex + 1; index < rows.length; index += 1) {
    const firstCell = cleanCell(rows[index][0]);
    const secondCell = cleanCell(rows[index][1]);
    if (firstCell === "合計" || firstCell === "總計") return false;
    if (parseGroupName(firstCell)) return false;
    if (secondCell) return true;
  }
  return false;
}

function parseGroupName(value: string) {
  const trimmedValue = cleanCell(value);
  return /^\d+[.)、．]/.test(trimmedValue) ? trimmedValue : "";
}

function parseBudgetAmount(value: unknown) {
  if (typeof value === "number") return Math.max(0, Math.round(value));
  if (typeof value === "string") {
    const parsed = Number(value.replaceAll(",", "").trim());
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }
  return 0;
}

function cleanCell(value: unknown) {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function buildReport(
  categories: AccountingCategory[],
  monthEntries: AccountingEntry[],
  yearEntries: AccountingEntry[],
  balanceCategories: AccountingBalanceCategory[],
  balanceSnapshot: AccountingBalanceSnapshot | null,
  balanceValues: AccountingBalanceValue[]
) {
  const incomeRows = buildReportRows("income", monthEntries, yearEntries, categories);
  const expenseRows = buildReportRows("expense", monthEntries, yearEntries, categories);
  const monthIncome = sumEntries(monthEntries, "income");
  const monthExpense = sumEntries(monthEntries, "expense");
  const yearIncome = sumEntries(yearEntries, "income");
  const yearExpense = sumEntries(yearEntries, "expense");
  const yearBalance = yearIncome - yearExpense;
  const balanceSheet = buildBalanceReport(balanceCategories, balanceSnapshot, balanceValues);

  return {
    incomeRows,
    expenseRows,
    monthIncome,
    monthExpense,
    monthBalance: monthIncome - monthExpense,
    yearIncome,
    yearExpense,
    yearBalance,
    balanceSheet,
    balanceDifference: balanceSheet.balanceDifference,
  };
}

function buildBalanceReport(
  categories: AccountingBalanceCategory[],
  snapshot: AccountingBalanceSnapshot | null,
  values: AccountingBalanceValue[]
): BalanceReport {
  if (!snapshot) {
    return {
      hasSnapshot: false,
      assetGroups: [],
      liabilityFundGroups: [],
      assetTotal: 0,
      liabilityFundTotal: 0,
      balanceDifference: 0,
    };
  }

  const valueMap = new Map(values.map((value) => [value.categoryId, value.amount]));
  const items = categories
    .filter((category) => category.isActive || valueMap.has(category.id))
    .map((category) => ({
      id: category.id,
      itemType: category.itemType,
      groupName: category.groupName,
      name: normalizeBalanceName(category.name),
      amount: valueMap.get(category.id) ?? 0,
      sortOrder: category.sortOrder,
    }))
    .sort((first, second) => first.sortOrder - second.sortOrder);

  const assetGroups = groupBalanceItems(items.filter((item) => item.itemType === "asset"));
  const liabilityFundGroups = groupBalanceItems(items.filter((item) => item.itemType !== "asset"));
  const assetTotal = assetGroups.reduce((sum, group) => sum + group.total, 0);
  const liabilityFundTotal = liabilityFundGroups.reduce((sum, group) => sum + group.total, 0);

  return {
    hasSnapshot: true,
    assetGroups,
    liabilityFundGroups,
    assetTotal,
    liabilityFundTotal,
    balanceDifference: assetTotal - liabilityFundTotal,
  };
}

function groupBalanceItems(items: BalanceReportItem[]) {
  const groupNames = Array.from(new Set(items.map((item) => item.groupName)));
  return groupNames.map((groupName) => {
    const groupItems = items.filter((item) => item.groupName === groupName);
    return {
      groupName,
      items: groupItems,
      total: groupItems.reduce((sum, item) => sum + item.amount, 0),
    };
  });
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
        executionRate: category.annualBudget > 0 ? ((yearAmount / category.annualBudget) * 100).toFixed(1) + "%" : "—",
      });
    });
    rows.push({
      key: type + "-" + groupName + "-subtotal",
      groupName,
      name: "小計",
      monthAmount: groupMonth,
      yearAmount: groupYear,
      annualBudget: groupBudget,
      budgetBalance: type === "income" ? groupYear - groupBudget : groupBudget - groupYear,
      executionRate: groupBudget > 0 ? ((groupYear / groupBudget) * 100).toFixed(1) + "%" : "—",
    });
  });
  return rows;
}

function buildReportChecks(categories: AccountingCategory[], monthEntries: AccountingEntry[], report: ReturnType<typeof buildReport>) {
  const checks: string[] = [];
  if (monthEntries.some((entry) => !entry.categoryId && entry.entryType === "income")) checks.push("本月有未分類收入。");
  if (monthEntries.some((entry) => !entry.categoryId && entry.entryType === "expense")) checks.push("本月有未分類支出。");
  if (monthEntries.some((entry) => entry.amount < 0)) checks.push("本月有負數或異常金額。");
  if (report.balanceDifference !== 0) checks.push("資產負債不平衡，差額 " + formatCurrency(report.balanceDifference) + "。");
  return checks;
}

function buildPassThroughEntries(entries: AccountingEntry[], categories: AccountingCategory[]) {
  return entries.filter((entry) => {
    const category = categories.find((item) => item.id === entry.categoryId || item.name === entry.category);
    const textValue = entry.category + " " + (category?.groupName ?? "") + " " + entry.description;
    return entry.isPassThrough || textValue.includes("暫付款") || textValue.includes("代收付");
  });
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
  downloadCsv("accounting-monthly-report_" + month + ".csv", [
    ["高雄晨光扶輪社", toRocMonth(month) + "收支明細表"],
    ["支出科目", "本月金額", "年度累計", "年度預算", "收入科目", "本月金額", "年度累計", "年度預算"],
    ...Array.from({ length: Math.max(report.expenseRows.length, report.incomeRows.length) }, (_, index) => {
      const expense = report.expenseRows[index];
      const income = report.incomeRows[index];
      return [
        expense ? expense.groupName + "/" + expense.name : "",
        expense ? String(expense.monthAmount) : "",
        expense ? String(expense.yearAmount) : "",
        expense ? String(expense.annualBudget) : "",
        income ? income.groupName + "/" + income.name : "",
        income ? String(income.monthAmount) : "",
        income ? String(income.yearAmount) : "",
        income ? String(income.annualBudget) : "",
      ];
    }),
    [],
    ["本月收入", String(report.monthIncome), "本月支出", String(report.monthExpense), "本月結餘", String(report.monthBalance)],
    ["年度收入", String(report.yearIncome), "年度支出", String(report.yearExpense), "年度結餘", String(report.yearBalance)],
    [],
    ["資產負債表"],
    ...(report.balanceSheet.hasSnapshot
      ? buildBalanceCsvRows(report.balanceSheet)
      : [["本月份尚未建立資產負債表"]]),
  ]);
}

function buildBalanceCsvRows(balanceSheet: BalanceReport) {
  const rows: string[][] = [];
  rows.push(["資產"]);
  balanceSheet.assetGroups.forEach((group) => {
    rows.push([group.groupName]);
    group.items.forEach((item) => rows.push([normalizeBalanceName(item.name), String(item.amount)]));
    rows.push([group.groupName + "小計", String(group.total)]);
  });
  rows.push(["資產合計", String(balanceSheet.assetTotal)]);
  rows.push([]);
  rows.push(["負債及基金"]);
  balanceSheet.liabilityFundGroups.forEach((group) => {
    rows.push([group.groupName]);
    group.items.forEach((item) => rows.push([normalizeBalanceName(item.name), String(item.amount)]));
    rows.push([group.groupName + "小計", String(group.total)]);
  });
  rows.push(["負債及基金合計", String(balanceSheet.liabilityFundTotal)]);
  rows.push(["平衡差額", String(balanceSheet.balanceDifference)]);
  return rows;
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

function mapAccountingBalanceCategory(row: Record<string, unknown>): AccountingBalanceCategory {
  return {
    id: text(row.id),
    rotaryYearId: text(row.rotary_year_id),
    itemType: text(row.item_type) === "liability" ? "liability" : text(row.item_type) === "fund" ? "fund" : "asset",
    groupName: text(row.group_name),
    name: normalizeBalanceName(text(row.name)),
    sortOrder: number(row.sort_order),
    isActive: row.is_active !== false,
  };
}

function mapAccountingBalanceSnapshot(row: Record<string, unknown>): AccountingBalanceSnapshot {
  return {
    id: text(row.id),
    rotaryYearId: text(row.rotary_year_id),
    reportMonth: text(row.report_month),
    reportDate: text(row.report_date),
  };
}

function mapAccountingBalanceValue(row: Record<string, unknown>): AccountingBalanceValue {
  return {
    id: text(row.id),
    snapshotId: text(row.snapshot_id),
    categoryId: text(row.category_id),
    amount: number(row.amount),
  };
}

function normalizeBalanceName(name: string) {
  if (name === "本年度累積餘絀") return "本年度累積結餘";
  if (name.includes("本年度") && (name.includes("累積") || name.includes("累計")) && (name.includes("餘絀") || name.includes("結餘"))) {
    return "本年度累積結餘";
  }
  if (name.includes("歷屆") && (name.includes("累計") || name.includes("累積")) && name.includes("餘絀")) {
    return "歷屆累計餘絀";
  }
  return name;
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
  return "民國 " + (Number(year) - 1911) + " 年 " + Number(monthNumber) + " 月";
}

function getCurrentMonth() {
  const date = new Date();
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}

function getMonthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const end = new Date(year, monthNumber, 0);
  return end.getFullYear() + "-" + String(end.getMonth() + 1).padStart(2, "0") + "-" + String(end.getDate()).padStart(2, "0");
}

function formatDate(date: string) {
  return date.replaceAll("-", "/");
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((value) => "\"" + value.replaceAll("\"", "\"\"") + "\"").join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
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
  return error instanceof Error ? fallback + "?" + error.message : fallback;
}
