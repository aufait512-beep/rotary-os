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
      setErrorMessage("?????????????????????");
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
      setErrorMessage("?????????" + error.message);
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
    setMessage("????????");
  }

  async function deleteEntry(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (entry && isClosedMonth(entry.entryDate, monthCloses, entry.rotaryYearId)) {
      setErrorMessage("??????????????????");
      return;
    }
    if (!window.confirm("????????????")) return;
    const { error } = await supabase.from("accounting_entries").delete().eq("id", entryId);
    if (error) {
      setErrorMessage("?????????" + error.message);
      return;
    }
    setEntries((currentEntries) => currentEntries.filter((item) => item.id !== entryId));
  }

  function editEntry(entry: AccountingEntry) {
    if (isClosedMonth(entry.entryDate, monthCloses, entry.rotaryYearId)) {
      setErrorMessage("??????????????????");
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
      setErrorMessage("??????????????????");
      return null;
    }
    if (category.annualBudget < 0 || !Number.isInteger(category.annualBudget)) {
      setErrorMessage("??????? 0 ?????");
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
      setErrorMessage("?????????????????????");
      return null;
    }

    const { data, error } = await supabase
      .from("accounting_categories")
      .upsert(toCategoryRow({ ...category, id: category.id || crypto.randomUUID() }), { onConflict: "id" })
      .select()
      .single();
    if (error) {
      setErrorMessage("???????????" + error.message);
      return null;
    }
    const savedCategory = mapCategory(data);
    setCategories((currentCategories) =>
      currentCategories.some((item) => item.id === savedCategory.id)
        ? currentCategories.map((item) => (item.id === savedCategory.id ? savedCategory : item))
        : [...currentCategories, savedCategory]
    );
    setMessage("??????????");
    return savedCategory;
  }

  async function deleteCategory(category: AccountingCategory) {
    const hasEntries = entries.some((entry) => sameCategory(entry, category));
    if (hasEntries) {
      setErrorMessage("?????????????????????");
      return;
    }
    if (!window.confirm("????? " + category.groupName + " / " + category.name + " ??")) return;
    if (!window.confirm("?????????????")) return;
    const { error } = await supabase.from("accounting_categories").delete().eq("id", category.id);
    if (error) {
      setErrorMessage("?????????" + error.message);
      return;
    }
    setCategories((currentCategories) => currentCategories.filter((item) => item.id !== category.id));
  }

  async function closeMonth() {
    if (!yearId || !month) return;
    if (!window.confirm("????? " + month + " ?????????????????")) return;
    const payload = {
      id: currentClose?.id ?? crypto.randomUUID(),
      rotary_year_id: yearId,
      report_month: month,
      status: "closed",
      closed_at: new Date().toISOString(),
      closed_by: "??",
      note: currentClose?.note || "",
    };
    const { data, error } = await supabase
      .from("accounting_month_closes")
      .upsert(payload, { onConflict: "rotary_year_id,report_month" })
      .select()
      .single();
    if (error) {
      setErrorMessage("?????" + error.message);
      return;
    }
    setMonthCloses((current) => upsertClose(current, mapMonthClose(data)));
    setMessage(month + " ??????");
  }

  async function unlockMonth() {
    if (!currentClose || !unlockReason.trim()) {
      setErrorMessage("??????????");
      return;
    }
    const { data, error } = await supabase
      .from("accounting_month_closes")
      .update({ status: "draft", note: unlockReason })
      .eq("id", currentClose.id)
      .select()
      .single();
    if (error) {
      setErrorMessage("???????" + error.message);
      return;
    }
    await supabase.from("accounting_month_close_logs").insert({
      month_close_id: currentClose.id,
      action: "unlock",
      reason: unlockReason,
    });
    setMonthCloses((current) => upsertClose(current, mapMonthClose(data)));
    setUnlockReason("");
    setMessage(month + " ??????");
  }

  function exportCsv() {
    downloadCsv("擃??典??嗉憚蝷震???嗆.csv", [
      ["?交?", "?嗅/?臬", "蝘", "??", "??", "蝜唾祥?孵?", "??", "?酉"],
      ...yearToDateEntries.map((entry) => [
        entry.entryDate,
        entry.entryType === "income" ? "?嗅" : "?臬",
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
      setErrorMessage(getErrorMessage(error, "JPG ?臬憭望?"));
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
            <span className="text-sm font-bold">撟游漲</span>
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
            <span className="text-sm font-bold">?遢</span>
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
        <h2 className="text-xl font-bold">{editingId ? "蝺刻摩?嗆" : "?啣??嗆"}</h2>
        <Input label="?交?" type="date" value={form.entryDate} onChange={(value) => onChange({ ...form, entryDate: value })} required />
        <label className="block">
          <span className="text-sm font-bold">?????</span>
          <select
            value={form.entryType}
            onChange={(event) => onChange({ ...form, entryType: event.target.value as EntryType, categoryId: "", category: "" })}
            className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3"
          >
            <option value="income">??</option>
            <option value="expense">??</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold">???? / ????</span>
          <select
            value={form.categoryId}
            onChange={(event) => {
              const category = formCategories.find((item) => item.id === event.target.value);
              onChange({ ...form, categoryId: event.target.value, category: category?.name ?? "" });
            }}
            className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3"
          >
            <option value="">????</option>
            {formCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.groupName} / {category.name}
              </option>
            ))}
          </select>
        </label>
        <Input label="??" value={form.description} onChange={(value) => onChange({ ...form, description: value })} required />
        <Input label="??" type="number" value={String(form.amount)} onChange={(value) => onChange({ ...form, amount: Number(value) || 0 })} required />
        <Input label="????" value={form.paymentMethod} onChange={(value) => onChange({ ...form, paymentMethod: value })} />
        <Input label="???????" value={form.referenceNo} onChange={(value) => onChange({ ...form, referenceNo: value })} />
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" checked={form.isPassThrough} onChange={(event) => onChange({ ...form, isPassThrough: event.target.checked })} />
          ??? / ???
        </label>
        <Input label="??" value={form.note} onChange={(value) => onChange({ ...form, note: value })} />
        <button type="submit" className={"w-full rounded-2xl bg-[#F7C948] py-4 font-bold " + buttonShadow}>
          {editingId ? "????" : "????"}
        </button>
      </form>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">????</h2>
          <button type="button" onClick={onExportCsv} className={"rounded-2xl bg-[#F7C948] px-4 py-2 text-sm font-bold " + buttonShadow}>
            ?? CSV
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
      <p className="text-sm font-bold text-[#C99700]">{entry.entryDate}?{entry.entryType === "income" ? "??" : "??"}</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <h3 className="text-xl font-bold">{entry.category || entry.description}</h3>
        {locked ? <span className="rounded-full bg-[#173B73] px-3 py-1 text-xs font-bold text-white">???</span> : null}
      </div>
      <p className="mt-2 font-bold">{formatCurrency(entry.amount)}</p>
      <p className="text-sm font-semibold text-[#173B73]/75">{entry.description}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" disabled={locked} onClick={() => onEdit(entry)} className={"rounded-2xl bg-[#F7C948] py-3 font-bold disabled:opacity-50 " + buttonShadow}>??</button>
        <button type="button" disabled={locked} onClick={() => onDelete(entry.id)} className={"rounded-2xl bg-white py-3 font-bold disabled:opacity-50 " + buttonShadow}>??</button>
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
        <button type="button" onClick={onPrint} className={"rounded-2xl bg-[#F7C948] px-4 py-2 font-bold " + buttonShadow}>??</button>
        <button type="button" onClick={onExportJpg} disabled={isExportingJpg} className={"rounded-2xl bg-white px-4 py-2 font-bold disabled:opacity-60 " + buttonShadow}>
          {isExportingJpg ? "???" : "?? JPG"}
        </button>
        <button type="button" onClick={onExportCsv} className={"rounded-2xl bg-white px-4 py-2 font-bold " + buttonShadow}>?? CSV</button>
        {status === "closed" ? (
          <span className="rounded-full bg-[#173B73] px-4 py-2 text-sm font-bold text-white">???</span>
        ) : (
          <button type="button" onClick={onCloseMonth} className={"rounded-2xl bg-[#F7C948] px-4 py-2 font-bold " + buttonShadow}>????</button>
        )}
      </div>
      {status === "closed" ? (
        <div className="grid gap-2 rounded-3xl bg-white/85 p-4 print:hidden sm:grid-cols-[1fr_auto]">
          <input
            value={unlockReason}
            onChange={(event) => onUnlockReasonChange(event.target.value)}
            placeholder="??????"
            className="rounded-2xl border border-[#E5D9BD] px-4 py-3"
          />
          <button type="button" onClick={onUnlockMonth} className={"rounded-2xl bg-white px-4 py-3 font-bold " + buttonShadow}>????</button>
        </div>
      ) : null}
      {checks.length > 0 ? (
        <div className="space-y-1 rounded-3xl bg-[#FFF6D6] p-4 text-sm font-bold print:hidden">
          {checks.map((check) => <p key={check}>- {check}</p>)}
        </div>
      ) : null}
      <div className="grid gap-3 print:hidden sm:grid-cols-2 lg:hidden">
        <SummaryCard title="?嗅" monthAmount={report.monthIncome} yearAmount={report.yearIncome} />
        <SummaryCard title="?臬" monthAmount={report.monthExpense} yearAmount={report.yearExpense} />
        <SummaryCard title="????" monthAmount={report.monthBalance} yearAmount={report.yearBalance} />
        <SummaryCard title="??????" monthAmount={report.balanceDifference} yearAmount={report.balanceDifference} />
      </div>
      <div id="accounting-monthly-report" className="overflow-x-auto rounded-3xl bg-white p-5 text-black">
        <div className="min-w-[1120px]">
          <h2 className="text-center text-2xl font-bold">???????</h2>
          <p className="mt-1 text-center text-lg font-bold">{toRocMonth(month)}?????</p>
          <p className="mt-1 text-center text-sm">?????{formatDate(cutoffDate)}</p>
          <TwoColumnReport expenseRows={report.expenseRows} incomeRows={report.incomeRows} />
          <ReportClosing report={report} />
          <MonthlyBalanceSheetSection report={report} />
          <PassThroughSection entries={passThroughEntries} />
          <div className="mt-10 grid grid-cols-4 gap-8 text-center text-sm">
            <p>??</p>
            <p>??</p>
            <p>???</p>
            <p>??</p>
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
          <th className="border border-black px-2 py-2" colSpan={4}>?臬</th>
          <th className="border border-black px-2 py-2" colSpan={4}>?嗅</th>
        </tr>
        <tr>
          {["?臬蝘", "?祆???", "撟游漲蝝航?", "撟游漲??", "?嗅蝘", "?祆???", "撟游漲蝝航?", "撟游漲??"].map((title) => (
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
  const isSubtotal = row.name === "撠?";
  return (
    <>
      <td className={"border border-black px-2 py-2 " + (isSubtotal ? "font-bold" : "")}>{isSubtotal ? row.groupName + " ??" : row.groupName + " / " + row.name}</td>
      <td className="border border-black px-2 py-2 text-right">{formatCurrency(row.monthAmount)}</td>
      <td className="border border-black px-2 py-2 text-right">{formatCurrency(row.yearAmount)}</td>
      <td className="border border-black px-2 py-2 text-right">{formatCurrency(row.annualBudget)}</td>
    </>
  );
}

function ReportClosing({ report }: { report: ReturnType<typeof buildReport> }) {
  return (
    <section className="mt-5 grid grid-cols-2 gap-3 text-sm font-bold">
      <p>???????{formatCurrency(report.monthIncome)}</p>
      <p>???????{formatCurrency(report.monthExpense)}</p>
      <p>?????<Money value={report.monthBalance} /></p>
      <p>???????{formatCurrency(report.yearIncome)}</p>
      <p>???????{formatCurrency(report.yearExpense)}</p>
      <p>???????<Money value={report.yearBalance} /></p>
    </section>
  );
}

function MonthlyBalanceSheetSection({ report }: { report: ReturnType<typeof buildReport> }) {
  if (!report.balanceSheet.hasSnapshot) {
    return (
      <section className="mt-6">
        <h3 className="text-lg font-bold">?????</h3>
        <p className="mt-2 rounded-2xl border border-dashed border-black/30 p-4 text-center font-bold">
          ????????????
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6">
      <h3 className="text-lg font-bold">?????</h3>
      {report.balanceSheet.balanceDifference !== 0 ? (
        <p className="mt-2 font-bold text-red-600">
          ??????????? {formatCurrency(report.balanceSheet.balanceDifference)}?
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-4">
        <MonthlyBalanceColumn title="??" groups={report.balanceSheet.assetGroups} total={report.balanceSheet.assetTotal} />
        <MonthlyBalanceColumn title="?????" groups={report.balanceSheet.liabilityFundGroups} total={report.balanceSheet.liabilityFundTotal} />
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
                <td className="border border-black px-2 py-1">{group.groupName}撠?</td>
                <td className="border border-black px-2 py-1 text-right">{formatCurrency(group.total)}</td>
              </tr>
            </Fragment>
          ))}
          <tr className="font-bold">
            <td className="border border-black px-2 py-2">{title}??</td>
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
      <h3 className="text-lg font-bold">?????????</h3>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr>
            {["??", "??", "??", "??", "?????"].map((title) => (
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
              <td className="border border-black px-2 py-2">{entry.note.includes("??") ? "?" : "?"}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className="border border-black px-2 py-2" colSpan={2}>??</td>
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
    setImportMessage("??? " + parsedRows.length + " ?????????????");
  }

  function updateImportRow(previewId: string, patch: Partial<BudgetImportRow>) {
    setImportRows((currentRows) =>
      currentRows.map((row) => (row.previewId === previewId ? { ...row, ...patch } : row))
    );
  }

  async function confirmImport() {
    const validRows = importRows.filter((row) => !validateCategoryLike(row));
    if (validRows.length === 0) {
      setImportMessage("???????????");
      return;
    }
    if (!window.confirm("???? " + validRows.length + " ???????")) return;

    let savedCount = 0;
    for (const row of validRows) {
      const savedCategory = await onSaveCategory(row);
      if (savedCategory) savedCount += 1;
    }
    setImportRows([]);
    setImportMessage("?????????" + savedCount + " ??");
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
      const confirmed = window.confirm("??????????????????????????????");
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
        <h2 className="text-2xl font-bold">撟游漲??蝮質汗</h2>
        <label className="mt-4 block">
          <span className="text-sm font-bold">撟游漲</span>
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
          <SummaryBox label="?嗅????" value={incomeBudget} />
          <SummaryBox label="?臬????" value={expenseBudget} />
          <SummaryBox label="??撌桅?" value={budgetDifference} />
        </div>
        {budgetDifference !== 0 ? (
          <p className="mt-4 rounded-2xl bg-[#FFF6D6] p-4 text-sm font-bold">
            ?砍僑摨行?亥??臬??撠撟唾﹛嚗榆憿?{formatCurrency(budgetDifference)}??          </p>
        ) : null}
      </div>

      <div className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
        <h2 className="text-xl font-bold">?臬撟游漲?? Excel</h2>
        <p className="mt-2 text-sm font-semibold text-[#173B73]/70">
          ?芸?交???臬憿???蝞之??蝘?僑摨阡?蝞???嚗??臬隞颱??祕??憿?鞈鞎????        </p>
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
                    <p className="font-bold">{row.entryType === "income" ? "??" : "??"}?{row.groupName} / {row.name || "?????"}</p>
                    <span className={"shrink-0 rounded-full px-3 py-1 text-xs font-bold " + (row.error ? "bg-red-100 text-red-700" : "bg-white text-[#173B73]")}>
                      {row.error || row.status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <select value={row.entryType} onChange={(event) => updateImportRow(row.previewId, { entryType: event.target.value as EntryType })} className="rounded-2xl border border-[#E5D9BD] px-3 py-2">
                      <option value="income">??</option>
                      <option value="expense">??</option>
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
              ????????
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
        {isFormOpen ? "????????" : "??????"}
      </button>

      {isFormOpen ? (
        <form onSubmit={submitCategoryForm} className="space-y-4 rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
          <h2 className="text-xl font-bold">{editingCategoryId ? "??????" : "??????"}</h2>
          <label className="block">
            <span className="text-sm font-bold">??</span>
            <select value={categoryForm.entryType} onChange={(event) => setCategoryForm({ ...categoryForm, entryType: event.target.value as EntryType })} className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3">
              <option value="income">??</option>
              <option value="expense">??</option>
            </select>
          </label>
          <Input label="????" value={categoryForm.groupName} onChange={(value) => setCategoryForm({ ...categoryForm, groupName: value })} required />
          <Input label="?????" value={categoryForm.name} onChange={(value) => setCategoryForm({ ...categoryForm, name: value })} required />
          <Input label="????" type="number" value={String(categoryForm.annualBudget)} onChange={(value) => setCategoryForm({ ...categoryForm, annualBudget: Math.max(0, Number(value) || 0) })} />
          <Input label="????" type="number" value={String(categoryForm.sortOrder)} onChange={(value) => setCategoryForm({ ...categoryForm, sortOrder: Number(value) || 0 })} />
          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={categoryForm.isActive} onChange={(event) => setCategoryForm({ ...categoryForm, isActive: event.target.checked })} />
            ??
          </label>
          <button type="submit" className={"w-full rounded-2xl bg-[#F7C948] py-4 font-bold " + buttonShadow}>
            ??????
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
                <p className="text-sm font-bold text-[#C99700]">{category.entryType === "income" ? "?嗅" : "?臬"} / {category.groupName}</p>
                <h3 className="text-xl font-bold">{category.name}</h3>
              </div>
              <span className={"shrink-0 rounded-full px-3 py-1 text-xs font-bold text-white " + (category.isActive ? "bg-[#173B73]" : "bg-[#F47C6C]")}>
                {category.isActive ? "?" : "?"}
              </span>
            </div>
            <input type="number" min={0} value={category.annualBudget} onChange={(event) => onUpdateBudget(category, Math.max(0, Number(event.target.value) || 0))} className="mt-3 w-full rounded-2xl border border-[#E5D9BD] px-4 py-3" />
            <p className="mt-2 text-sm font-bold">
              ??? {formatCurrency(spent)}????? {category.annualBudget > 0 ? formatCurrency(category.annualBudget) : "???"}??? {category.annualBudget > 0 ? formatCurrency(category.entryType === "income" ? spent - category.annualBudget : category.annualBudget - spent) : "?"}???? {category.annualBudget > 0 ? rate + "%" : "?"}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <button type="button" onClick={() => editCategory(category)} className={"rounded-2xl bg-[#F7C948] py-3 text-sm font-bold " + buttonShadow}>
                ??
              </button>
              <button type="button" onClick={() => void onSaveCategory({ ...category, isActive: !category.isActive })} className={"rounded-2xl bg-white py-3 text-sm font-bold " + buttonShadow}>
                {category.isActive ? "??" : "??"}
              </button>
              <button type="button" disabled={hasEntries} onClick={() => onDeleteCategory(category)} className={"rounded-2xl bg-white py-3 text-sm font-bold disabled:opacity-50 " + buttonShadow}>
                ??
              </button>
            </div>
            {hasEntries ? <p className="mt-2 text-xs font-bold text-[#173B73]/60">?????????????????</p> : null}
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
      <p className="mt-1 text-sm font-semibold">???<Money value={yearAmount} /></p>
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

    if (firstCell.includes("?嗅蝘") || secondCell.includes("?嗅蝘")) {
      currentType = "income";
      currentGroup = "";
      groupSort = 0;
      childSort = 0;
      return;
    }
    if (firstCell.includes("?臬蝘") || secondCell.includes("?臬蝘")) {
      currentType = "expense";
      currentGroup = "";
      groupSort = 0;
      childSort = 0;
      return;
    }
    if (
      (combinedCells.includes("?嗅??") || combinedCells.includes("?臬??")) &&
      !combinedCells.includes("?嗅蝘") &&
      !combinedCells.includes("?臬蝘")
    ) {
      currentType = "";
      currentGroup = "";
      return;
    }
    if (!currentType || firstCell === "??") return;

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
          groupName: currentGroup || "???",
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
  const error = !name ? "???????" : annualBudget < 0 ? "????" : "";
  const status = error
    ? error
    : existingCategory
      ? existingCategory.annualBudget === annualBudget && existingCategory.sortOrder === sortOrder
        ? "???芾?"
        : "?湔?Ｘ?蝘"
      : "?啣?蝘";

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
  if (!category.rotaryYearId) return "?????";
  if (!category.groupName.trim()) return "?澆??航炊";
  if (!category.name.trim()) return "???????";
  if (!Number.isInteger(category.annualBudget) || category.annualBudget < 0) return "?澆??航炊";
  return "";
}

function hasFollowingChild(rows: string[][], groupIndex: number) {
  for (let index = groupIndex + 1; index < rows.length; index += 1) {
    const firstCell = cleanCell(rows[index][0]);
    const secondCell = cleanCell(rows[index][1]);
    if (firstCell === "??") return false;
    if (parseGroupName(firstCell)) return false;
    if (secondCell) return true;
  }
  return false;
}

function parseGroupName(value: string) {
  const trimmedValue = cleanCell(value);
  return /^\d+[.)??]/.test(trimmedValue) ? trimmedValue : "";
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
  const groupNames = Array.from(new Set(typeCategories.map((category) => category.groupName || "???")));
  groupNames.forEach((groupName) => {
    const groupCategories = typeCategories.filter((category) => (category.groupName || "???") === groupName);
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
        executionRate: category.annualBudget > 0 ? ((yearAmount / category.annualBudget) * 100).toFixed(1) + "%" : "?",
      });
    });
    rows.push({
      key: type + "-" + groupName + "-subtotal",
      groupName,
      name: "撠?",
      monthAmount: groupMonth,
      yearAmount: groupYear,
      annualBudget: groupBudget,
      budgetBalance: type === "income" ? groupYear - groupBudget : groupBudget - groupYear,
      executionRate: groupBudget > 0 ? ((groupYear / groupBudget) * 100).toFixed(1) + "%" : "?",
    });
  });
  return rows;
}

function buildReportChecks(categories: AccountingCategory[], monthEntries: AccountingEntry[], report: ReturnType<typeof buildReport>) {
  const checks: string[] = [];
  if (monthEntries.some((entry) => !entry.categoryId && entry.entryType === "income")) checks.push("?????????");
  if (monthEntries.some((entry) => !entry.categoryId && entry.entryType === "expense")) checks.push("?????????");
  if (monthEntries.some((entry) => entry.amount < 0)) checks.push("???????????");
  if (report.balanceDifference !== 0) checks.push("?????????? " + formatCurrency(report.balanceDifference) + "?");
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
    ["???????", toRocMonth(month) + "?????"],
    ["?臬蝘", "?祆???", "撟游漲蝝航?", "撟游漲??", "?嗅蝘", "?祆???", "撟游漲蝝航?", "撟游漲??"],
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
    ["?祆??嗅", String(report.monthIncome), "?祆??臬", String(report.monthExpense), "?祆?蝯?", String(report.monthBalance)],
    ["撟游漲?嗅", String(report.yearIncome), "撟游漲?臬", String(report.yearExpense), "撟游漲蝯?", String(report.yearBalance)],
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
    rows.push([group.groupName + "??", String(group.total)]);
  });
  rows.push(["資產合計", String(balanceSheet.assetTotal)]);
  rows.push([]);
  rows.push(["負債及基金"]);
  balanceSheet.liabilityFundGroups.forEach((group) => {
    rows.push([group.groupName]);
    group.items.forEach((item) => rows.push([normalizeBalanceName(item.name), String(item.amount)]));
    rows.push([group.groupName + "??", String(group.total)]);
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
  return "?? " + (Number(year) - 1911) + " ? " + Number(monthNumber) + " ?";
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
