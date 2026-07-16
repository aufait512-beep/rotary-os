"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { formatMemberName } from "@/lib/members";
import { supabase } from "@/src/lib/supabase";
import SmartVoucherPanel from "./SmartVoucherPanel";

type EntryType = "income" | "expense";
type Row = Record<string, unknown>;

type YearLike = {
  id: string;
  name: string;
  displayName: string;
  startDate: string;
  endDate: string;
};

type Account = {
  id: string;
  rotaryYearId: string;
  name: string;
  accountCategory: string;
  openingBalance: number;
  isActive: boolean;
};

type Category = {
  id: string;
  rotaryYearId: string;
  entryType: EntryType;
  groupName: string;
  name: string;
  annualBudget: number;
  sortOrder: number;
  isActive: boolean;
};

type Entry = {
  id: string;
  rotaryYearId: string;
  entryDate: string;
  entryType: EntryType;
  categoryId: string;
  category: string;
  description: string;
  amount: number;
  accountId: string;
  paymentMethod: string;
  referenceNo: string;
  isPassThrough: boolean;
  duesRecordId: string;
  sourceType: string;
  sourceId: string;
  status: string;
};

type DuesRecord = {
  id: string;
  memberId: string;
  periodMonth: string;
  previousBalance: number;
  currentDue: number;
  paidAmount: number;
  paymentDate: string;
  paymentMethod: string;
};

type DuesLineItem = {
  id: string;
  duesRecordId: string;
  itemType: string;
  itemName: string;
  amount: number;
};

type Payment = {
  id: string;
  memberId: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  accountId: string;
  referenceNo: string;
  note: string;
  status: "draft" | "received" | "posted" | "voided";
};

type Allocation = {
  id: string;
  paymentId: string;
  duesRecordId: string;
  allocatedAmount: number;
};

type Member = {
  id: string;
  chineseName: string;
  rotaryName: string;
};

type BalanceCategory = {
  id: string;
  itemType: "asset" | "liability" | "fund";
  groupName: string;
  name: string;
};

type BalanceValue = { categoryId: string; amount: number };
type Snapshot = { id: string; reportMonth: string };

type Reconciliation = {
  id: string;
  accountId: string;
  reportMonth: string;
  openingBalance: number;
  calculatedBalance: number;
  actualBalance: number | null;
  difference: number | null;
  status: "draft" | "confirmed";
};

type ChecklistRow = { id: string; itemKey: string; isCompleted: boolean };

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

const checklistItems = [
  ["confirm_dues", "確認本月社費收款"],
  ["post_dues", "將已收社費入帳"],
  ["meal_fees", "確認餐費已帶入社員社費"],
  ["other_entries", "登錄其他收入與支出"],
  ["bank_reconciliation", "完成銀行對帳"],
  ["petty_cash", "確認零用金"],
  ["member_receivables", "檢查社友應收款"],
  ["pass_through", "檢查代收付款"],
  ["balance_snapshot", "建立資產負債表快照"],
  ["diagnostics", "執行不平衡診斷"],
  ["monthly_report", "產生每月收支報表"],
  ["close_month", "確認後月結鎖定"],
  ["exports", "匯出 JPG／CSV／列印"],
] as const;

const lineItemLabels: Record<string, string> = {
  annual_fee: "常年社費",
  meal: "例會餐費",
  special_donation: "特別捐款",
  red_box: "慶典紅箱",
  rotary_foundation: "扶輪基金代收",
  pass_through: "代收付款",
};

export default function AccountingV3Workbench({
  years,
  yearId,
  month,
  cutoffDate,
  monthClosed,
  onRefresh,
  onEditEntry,
  onOpenBalanceSheet,
  onOpenMonthlyReport,
  onCloseMonth,
}: {
  years: YearLike[];
  yearId: string;
  month: string;
  cutoffDate: string;
  monthClosed: boolean;
  onRefresh: () => Promise<void> | void;
  onEditEntry: (entryId: string) => void;
  onOpenBalanceSheet: () => void;
  onOpenMonthlyReport: () => void;
  onCloseMonth: () => void;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [duesRecords, setDuesRecords] = useState<DuesRecord[]>([]);
  const [lineItems, setLineItems] = useState<DuesLineItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [balanceCategories, setBalanceCategories] = useState<BalanceCategory[]>([]);
  const [balanceValues, setBalanceValues] = useState<BalanceValue[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [checklistRows, setChecklistRows] = useState<ChecklistRow[]>([]);
  const [actualBalances, setActualBalances] = useState<Record<string, string>>({});
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [postingPaymentId, setPostingPaymentId] = useState("");
  const [legacyAccountId, setLegacyAccountId] = useState("");

  const [quickForm, setQuickForm] = useState({
    entryDate: cutoffDate,
    entryType: "income" as EntryType,
    groupName: "",
    categoryId: "",
    description: "",
    amount: "",
    accountId: "",
    paymentMethod: "轉帳",
    referenceNo: "",
    note: "",
  });
  const [paymentForm, setPaymentForm] = useState({
    memberId: "",
    paymentDate: cutoffDate,
    amount: "",
    paymentMethod: "轉帳",
    accountId: "",
    referenceNo: "",
    note: "",
  });

  const selectedYear = years.find((year) => year.id === yearId);
  const monthStart = `${month}-01`;
  const yearStart = selectedYear?.startDate ?? monthStart;

  const loadData = useCallback(async () => {
    if (!yearId || !month) return;
    setIsLoading(true);
    setErrorMessage("");
    const reportMonth = `${month}-01`;
    try {
      const [
        accountResult,
        categoryResult,
        entryResult,
        duesResult,
        lineItemResult,
        paymentResult,
        allocationResult,
        memberResult,
        balanceCategoryResult,
        snapshotResult,
        reconciliationResult,
        checklistResult,
      ] = await Promise.all([
        supabase.from("accounting_accounts").select("*").eq("rotary_year_id", yearId).order("sort_order"),
        supabase.from("accounting_categories").select("*").eq("rotary_year_id", yearId).order("sort_order"),
        supabase.from("accounting_entries").select("*").eq("rotary_year_id", yearId).order("entry_date", { ascending: false }),
        supabase.from("dues_records").select("*").order("period_month", { ascending: true }),
        supabase.from("dues_line_items").select("*").order("created_at", { ascending: true }),
        supabase.from("dues_payments").select("*").order("payment_date", { ascending: false }),
        supabase.from("dues_payment_allocations").select("*"),
        supabase.from("members").select("id,chinese_name,rotary_name"),
        supabase.from("accounting_balance_categories").select("*").eq("rotary_year_id", yearId).order("sort_order"),
        supabase.from("accounting_balance_snapshots").select("*").eq("rotary_year_id", yearId).eq("report_month", reportMonth).maybeSingle(),
        supabase.from("accounting_reconciliations").select("*").eq("rotary_year_id", yearId),
        supabase.from("accounting_month_checklists").select("*").eq("rotary_year_id", yearId).eq("report_month", month),
      ]);
      const results = [accountResult, categoryResult, entryResult, duesResult, lineItemResult, paymentResult, allocationResult, memberResult, balanceCategoryResult, snapshotResult, reconciliationResult, checklistResult];
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;

      setAccounts((accountResult.data ?? []).map(mapAccount));
      setCategories((categoryResult.data ?? []).map(mapCategory));
      setEntries((entryResult.data ?? []).map(mapEntry));
      setDuesRecords((duesResult.data ?? []).map(mapDuesRecord));
      setLineItems((lineItemResult.data ?? []).map(mapLineItem));
      setPayments((paymentResult.data ?? []).map(mapPayment));
      setAllocations((allocationResult.data ?? []).map(mapAllocation));
      setMembers((memberResult.data ?? []).map(mapMember));
      setBalanceCategories((balanceCategoryResult.data ?? []).map(mapBalanceCategory));
      setReconciliations((reconciliationResult.data ?? []).map(mapReconciliation));
      setChecklistRows((checklistResult.data ?? []).map(mapChecklist));

      if (snapshotResult.data) {
        const nextSnapshot = { id: text(snapshotResult.data.id), reportMonth: text(snapshotResult.data.report_month) };
        setSnapshot(nextSnapshot);
        const valuesResult = await supabase.from("accounting_balance_values").select("*").eq("snapshot_id", nextSnapshot.id);
        if (valuesResult.error) throw valuesResult.error;
        setBalanceValues((valuesResult.data ?? []).map((row) => ({ categoryId: text(row.category_id), amount: number(row.amount) })));
      } else {
        setSnapshot(null);
        setBalanceValues([]);
      }
    } catch (error) {
      console.error({ module: "accounting-v3", operation: "load dashboard", error });
      setErrorMessage(getErrorMessage(error, "Accounting V3 資料讀取失敗。請先執行 V3 migration，再重新整理。"));
    } finally {
      setIsLoading(false);
    }
  }, [month, yearId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const yearAccounts = accounts.filter((account) => account.isActive);
  const activeCategories = categories.filter((category) => category.isActive);
  const monthEntries = entries.filter((entry) => entry.entryDate >= monthStart && entry.entryDate <= cutoffDate && entry.status !== "voided");
  const yearEntries = entries.filter((entry) => entry.entryDate >= yearStart && entry.entryDate <= cutoffDate && entry.status !== "voided");
  const reportableMonthEntries = monthEntries.filter((entry) => !entry.isPassThrough);
  const reportableYearEntries = yearEntries.filter((entry) => !entry.isPassThrough);
  const monthIncome = sumEntries(reportableMonthEntries, "income");
  const monthExpense = sumEntries(reportableMonthEntries, "expense");
  const yearIncome = sumEntries(reportableYearEntries, "income");
  const yearExpense = sumEntries(reportableYearEntries, "expense");

  const balanceItems = balanceCategories.map((category) => ({
    ...category,
    amount: balanceValues.find((value) => value.categoryId === category.id)?.amount ?? 0,
  }));
  const balanceAssetTotal = sum(balanceItems.filter((item) => item.itemType === "asset").map((item) => item.amount));
  const balanceLiabilityFundTotal = sum(balanceItems.filter((item) => item.itemType !== "asset").map((item) => item.amount));
  const balanceDifference = balanceAssetTotal - balanceLiabilityFundTotal;

  const reconciliationModels = yearAccounts
    .filter((account) => account.accountCategory.startsWith("bank"))
    .map((account) => buildReconciliationModel(account, month, entries, reconciliations));

  const systemOutstanding = duesRecords.reduce((total, record) => total + duesOutstanding(record), 0);
  const pendingPayments = payments.filter((payment) => payment.status === "received");
  const legacyPaidRecords = duesRecords.filter((record) => {
    if (record.paidAmount <= 0) return false;
    return !allocations.some((allocation) => allocation.duesRecordId === record.id);
  });
  const diagnostics = buildDiagnostics({
    snapshot,
    balanceDifference,
    balanceItems,
    reconciliations: reconciliationModels,
    entries: monthEntries,
    yearEntries: reportableYearEntries,
    pendingPayments,
    legacyPaidRecords,
    payments,
    allocations,
    systemOutstanding,
  });
  const completedChecklist = checklistItems.filter(([key]) => checklistRows.some((row) => row.itemKey === key && row.isCompleted)).length;

  const paymentAllocations = useMemo(
    () => buildPaymentAllocationPreview(paymentForm.memberId, number(paymentForm.amount), duesRecords),
    [duesRecords, paymentForm.amount, paymentForm.memberId]
  );
  const unallocatedPaymentAmount = Math.max(
    0,
    number(paymentForm.amount) - sum(paymentAllocations.map((allocation) => allocation.amount))
  );

  async function saveQuickEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (monthClosed) return setErrorMessage("本月份已月結，請先解除月結後再新增收支。");
    const category = activeCategories.find((item) => item.id === quickForm.categoryId);
    if (!category || !quickForm.accountId || number(quickForm.amount) <= 0) {
      return setErrorMessage("請完整選擇會計科目、收付款帳戶並輸入金額。");
    }
    const payload = {
      id: crypto.randomUUID(),
      rotary_year_id: yearId,
      entry_date: quickForm.entryDate,
      entry_type: quickForm.entryType,
      category_id: category.id,
      category: category.name,
      description: quickForm.description.trim(),
      amount: number(quickForm.amount),
      account_id: quickForm.accountId,
      payment_method: quickForm.paymentMethod,
      reference_no: quickForm.referenceNo.trim() || null,
      is_pass_through: false,
      note: quickForm.note.trim() || null,
      source_type: "manual",
      status: "posted",
    };
    const { error } = await supabase.from("accounting_entries").insert(payload);
    if (error) return setErrorMessage("收支儲存失敗：" + error.message);
    setQuickForm((current) => ({ ...current, categoryId: "", description: "", amount: "", referenceNo: "", note: "" }));
    setMessage("收支紀錄已建立。");
    await loadData();
    await onRefresh();
  }

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = number(paymentForm.amount);
    if (!paymentForm.memberId || !paymentForm.accountId || amount <= 0 || paymentAllocations.length === 0) {
      return setErrorMessage("請選擇社友、收款帳戶並輸入可分配的收款金額。");
    }
    const paymentId = crypto.randomUUID();
    const allocationRows = paymentAllocations.map((allocation) => ({
      id: crypto.randomUUID(),
      dues_record_id: allocation.record.id,
      allocated_amount: allocation.amount,
    }));
    const { error: paymentError } = await supabase.rpc("record_dues_payment", {
      p_id: paymentId,
      p_member_id: paymentForm.memberId,
      p_payment_date: paymentForm.paymentDate,
      p_amount: amount,
      p_payment_method: paymentForm.paymentMethod,
      p_account_id: paymentForm.accountId,
      p_reference_no: paymentForm.referenceNo.trim(),
      p_note: paymentForm.note.trim(),
      p_allocations: allocationRows,
      p_apply_to_dues: true,
    });
    if (paymentError) return setErrorMessage("收款與分配建立失敗：" + paymentError.message);
    setPaymentForm((current) => ({ ...current, amount: "", referenceNo: "", note: "" }));
    setMessage(`收款已登記，分配至 ${paymentAllocations.length} 個月份；尚未建立會計收入。`);
    await loadData();
  }

  async function convertLegacyPaidRecord(record: DuesRecord) {
    if (!legacyAccountId) return setErrorMessage("請先選擇舊收款資料的收款帳戶。");
    const paymentId = crypto.randomUUID();
    const paymentResult = await supabase.rpc("record_dues_payment", {
      p_id: paymentId,
      p_member_id: record.memberId,
      p_payment_date: record.paymentDate || `${record.periodMonth}-01`,
      p_amount: record.paidAmount,
      p_payment_method: record.paymentMethod || "轉帳",
      p_account_id: legacyAccountId,
      p_reference_no: "",
      p_note: "由既有 dues_records 已繳金額建立，未變更原社費資料。",
      p_allocations: [{ id: crypto.randomUUID(), dues_record_id: record.id, allocated_amount: record.paidAmount }],
      p_apply_to_dues: false,
    });
    if (paymentResult.error) return setErrorMessage("舊收款轉換失敗：" + paymentResult.error.message);
    setMessage("既有已繳資料已建立為待入帳收款，原社費資料未改動。");
    await loadData();
  }

  async function postPayment(payment: Payment) {
    if (monthClosed && payment.paymentDate.startsWith(month)) return setErrorMessage("本月份已月結，不能入帳。");
    const preview = buildPostingPreview(payment, allocations, duesRecords, lineItems, activeCategories);
    if (preview.errors.length > 0) return setErrorMessage(preview.errors.join(" "));
    if (!window.confirm(`確認將 ${formatCurrency(payment.amount)} 依 ${preview.lines.length} 個會計科目入帳嗎？`)) return;
    setPostingPaymentId(payment.id);
    try {
      const payload = preview.lines.map((line) => ({
        id: crypto.randomUUID(),
        category_id: line.category.id,
        category: line.category.name,
        description: `${getMemberName(payment.memberId, members)} 社費收款｜${line.label}`,
        amount: line.amount,
        dues_record_id: line.duesRecordId || null,
        is_pass_through: line.isPassThrough,
        source_type: line.sourceType,
        source_id: line.allocationId,
      }));
      const { error } = await supabase.rpc("post_dues_payment", {
        p_payment_id: payment.id,
        p_rotary_year_id: yearId,
        p_lines: payload,
      });
      if (error) throw error;
      setMessage("社費收款已依明細完成入帳；代收項目不列入一般收入。");
      await loadData();
      await onRefresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "社費入帳失敗"));
    } finally {
      setPostingPaymentId("");
    }
  }

  async function reversePayment(payment: Payment) {
    if (monthClosed) return setErrorMessage("本月份已月結，請先解除月結後再沖銷。");
    if (!window.confirm(`確定沖銷 ${getMemberName(payment.memberId, members)} ${formatCurrency(payment.amount)} 的收款嗎？原始紀錄會保留。`)) return;
    const paymentAllocations = allocations.filter((allocation) => allocation.paymentId === payment.id);
    try {
      let reversalRows: Array<Record<string, unknown>> = [];
      if (payment.status === "posted") {
        const originalEntries = entries.filter(
          (entry) =>
            (entry.sourceType === "dues_payment_allocation" && paymentAllocations.some((allocation) => allocation.id === entry.sourceId)) ||
            (entry.sourceType === "dues_payment_overpayment" && entry.sourceId === payment.id)
        );
        if (!originalEntries.length) throw new Error("找不到原始會計入帳，請先人工核對來源關聯。");
        reversalRows = originalEntries.map((entry) => ({
          id: crypto.randomUUID(),
          rotary_year_id: entry.rotaryYearId,
          entry_type: entry.entryType,
          category_id: entry.categoryId || null,
          category: entry.category,
          description: `沖銷：${entry.description}`,
          amount: -entry.amount,
          is_pass_through: entry.isPassThrough,
          dues_record_id: entry.duesRecordId || null,
          source_id: entry.id,
          reversal_of_id: entry.id,
        }));
      }
      const paymentResult = await supabase.rpc("void_dues_payment", {
        p_payment_id: payment.id,
        p_reversal_date: cutoffDate,
        p_reversal_lines: reversalRows,
      });
      if (paymentResult.error) throw paymentResult.error;
      setMessage("收款已沖銷，原付款與原會計交易均保留供查核。");
      await loadData();
      await onRefresh();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "收款沖銷失敗"));
    }
  }

  async function saveReconciliation(model: ReturnType<typeof buildReconciliationModel>) {
    const actual = number(actualBalances[model.account.id] ?? model.actualBalance ?? "");
    const payload = {
      rotary_year_id: yearId,
      report_month: month,
      account_id: model.account.id,
      opening_balance: model.openingBalance,
      calculated_balance: model.calculatedBalance,
      actual_balance: actual,
      difference: actual - model.calculatedBalance,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("accounting_reconciliations").upsert(payload, { onConflict: "rotary_year_id,report_month,account_id" });
    if (error) return setErrorMessage("銀行對帳儲存失敗：" + error.message);
    setMessage(`${model.account.name} 實際月底餘額已確認。`);
    await loadData();
  }

  async function toggleChecklist(itemKey: string, isCompleted: boolean) {
    const existing = checklistRows.find((row) => row.itemKey === itemKey);
    const { error } = await supabase.from("accounting_month_checklists").upsert({
      id: existing?.id ?? crypto.randomUUID(),
      rotary_year_id: yearId,
      report_month: month,
      item_key: itemKey,
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null,
    }, { onConflict: "rotary_year_id,report_month,item_key" });
    if (error) return setErrorMessage("月底清單更新失敗：" + error.message);
    setChecklistRows((current) => {
      const next = { id: existing?.id ?? itemKey, itemKey, isCompleted };
      return existing ? current.map((row) => row.itemKey === itemKey ? next : row) : [...current, next];
    });
  }

  const budgetGroups = buildBudgetGroups(activeCategories, reportableYearEntries);
  const jadeReminders = buildJadeReminders({ pendingPayments, legacyPaidRecords, monthEntries, snapshot, monthClosed, diagnostics, budgetGroups });

  return (
    <section className="space-y-5 print:hidden">
      {isLoading ? <Notice tone="info">會計工作台資料讀取中。</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="本月收入" value={formatCurrency(monthIncome)} />
        <MetricCard label="本月支出" value={formatCurrency(monthExpense)} />
        <MetricCard label="本月結餘" value={formatCurrency(monthIncome - monthExpense)} signed />
        <MetricCard label="年度累積結餘" value={formatCurrency(yearIncome - yearExpense)} signed />
      </section>

      {snapshot ? (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <MetricCard label="銀行活存合計" value={formatCurrency(sumBalance(balanceItems, "活存"))} compact />
          <MetricCard label="銀行定存合計" value={formatCurrency(sumBalance(balanceItems, "定存"))} compact />
          <MetricCard label="零用金" value={formatCurrency(sumBalance(balanceItems, "零用金"))} compact />
          <MetricCard label="應收款項" value={formatCurrency(sumBalance(balanceItems, "應收"))} compact />
          <MetricCard label="應付款項" value={formatCurrency(sumBalance(balanceItems, "應付"))} compact />
          <MetricCard label="資產負債差額" value={formatCurrency(balanceDifference)} compact warning={balanceDifference !== 0} />
        </section>
      ) : (
        <Notice tone="warning">本月份尚未建立資產負債表</Notice>
      )}

      <section className="rounded-3xl bg-[#173B73] p-5 text-white">
        <h2 className="text-xl font-bold">Jade 會計提醒</h2>
        <div className="mt-3 space-y-2 text-sm font-semibold">
          {jadeReminders.length ? jadeReminders.map((item) => <p key={item}>- {item}</p>) : <p>目前沒有需要特別提醒的項目。</p>}
        </div>
      </section>

      <SmartVoucherPanel
        yearId={yearId}
        month={month}
        cutoffDate={cutoffDate}
        monthClosed={monthClosed}
        accounts={yearAccounts}
        categories={activeCategories}
        entries={monthEntries}
        onSaved={async () => {
          await loadData();
          await onRefresh();
        }}
      />

      <Collapsible title="快速收支登錄" open={Boolean(openSections.quick)} onToggle={() => toggleSection("quick", setOpenSections)}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
          <form onSubmit={saveQuickEntry} className="grid min-w-0 gap-3 sm:grid-cols-2">
            <Field label="日期"><input type="date" value={quickForm.entryDate} onChange={(event) => setQuickForm({ ...quickForm, entryDate: event.target.value })} className={inputClass} required /></Field>
            <Field label="收入／支出"><select value={quickForm.entryType} onChange={(event) => setQuickForm({ ...quickForm, entryType: event.target.value as EntryType, groupName: "", categoryId: "" })} className={inputClass}><option value="income">收入</option><option value="expense">支出</option></select></Field>
            <Field label="會計大項"><select value={quickForm.groupName} onChange={(event) => setQuickForm({ ...quickForm, groupName: event.target.value, categoryId: "" })} className={inputClass}><option value="">選擇大項</option>{unique(activeCategories.filter((category) => category.entryType === quickForm.entryType).map((category) => category.groupName)).map((group) => <option key={group}>{group}</option>)}</select></Field>
            <Field label="子科目"><select value={quickForm.categoryId} onChange={(event) => setQuickForm({ ...quickForm, categoryId: event.target.value })} className={inputClass}><option value="">選擇子科目</option>{activeCategories.filter((category) => category.entryType === quickForm.entryType && category.groupName === quickForm.groupName).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
            <Field label="摘要"><input value={quickForm.description} onChange={(event) => setQuickForm({ ...quickForm, description: event.target.value })} className={inputClass} required /></Field>
            <Field label="金額"><input type="number" min="1" value={quickForm.amount} onChange={(event) => setQuickForm({ ...quickForm, amount: event.target.value })} className={inputClass} required /></Field>
            <Field label="收付款帳戶"><AccountSelect accounts={yearAccounts} value={quickForm.accountId} onChange={(accountId) => setQuickForm({ ...quickForm, accountId })} /></Field>
            <Field label="付款方式"><select value={quickForm.paymentMethod} onChange={(event) => setQuickForm({ ...quickForm, paymentMethod: event.target.value })} className={inputClass}><option>轉帳</option><option>信用卡扣</option><option>現金</option></select></Field>
            <Field label="憑證編號"><input value={quickForm.referenceNo} onChange={(event) => setQuickForm({ ...quickForm, referenceNo: event.target.value })} className={inputClass} /></Field>
            <Field label="備註"><input value={quickForm.note} onChange={(event) => setQuickForm({ ...quickForm, note: event.target.value })} className={inputClass} /></Field>
            <button disabled={monthClosed} className={`rounded-2xl bg-[#F7C948] px-4 py-3 font-bold text-[#173B73] disabled:opacity-50 sm:col-span-2 ${buttonShadow}`}>儲存收支</button>
          </form>
          <div className="min-w-0">
            <h3 className="font-bold">最近收支</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-[680px] w-full text-sm">
                <thead><tr className="text-left"><th>日期</th><th>類型</th><th>科目</th><th>摘要</th><th className="text-right">金額</th><th>帳戶</th><th>來源</th></tr></thead>
                <tbody>{entries.slice(0, 8).map((entry) => <tr key={entry.id} className="border-t border-[#E5D9BD]"><td className="py-3">{entry.entryDate}</td><td>{entry.entryType === "income" ? "收入" : "支出"}</td><td>{entry.category || "未分類"}</td><td><button type="button" className="text-left font-bold underline" onClick={() => onEditEntry(entry.id)}>{entry.description}</button></td><td className="text-right font-bold">{formatCurrency(entry.amount)}</td><td>{accounts.find((account) => account.id === entry.accountId)?.name || "未指定"}</td><td>{entry.sourceType === "dues_payment_allocation" ? "社費" : "一般"}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>
      </Collapsible>

      <Collapsible title={`社費待入帳（${pendingPayments.length + legacyPaidRecords.length}）`} open={Boolean(openSections.dues)} onToggle={() => toggleSection("dues", setOpenSections)}>
        <form onSubmit={createPayment} className="grid gap-3 rounded-2xl bg-[#F8F3E8] p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="社友"><select value={paymentForm.memberId} onChange={(event) => setPaymentForm({ ...paymentForm, memberId: event.target.value })} className={inputClass}><option value="">選擇社友</option>{members.sort((a, b) => getMemberName(a.id, members).localeCompare(getMemberName(b.id, members), "zh-Hant")).map((member) => <option key={member.id} value={member.id}>{getMemberName(member.id, members)}</option>)}</select></Field>
          <Field label="收款日期"><input type="date" value={paymentForm.paymentDate} onChange={(event) => setPaymentForm({ ...paymentForm, paymentDate: event.target.value })} className={inputClass} /></Field>
          <Field label="實收金額"><input type="number" min="1" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} className={inputClass} /></Field>
          <Field label="收款帳戶"><AccountSelect accounts={yearAccounts} value={paymentForm.accountId} onChange={(accountId) => setPaymentForm({ ...paymentForm, accountId })} /></Field>
          <Field label="付款方式"><select value={paymentForm.paymentMethod} onChange={(event) => setPaymentForm({ ...paymentForm, paymentMethod: event.target.value })} className={inputClass}><option>轉帳</option><option>信用卡扣</option><option>現金</option></select></Field>
          <Field label="憑證編號"><input value={paymentForm.referenceNo} onChange={(event) => setPaymentForm({ ...paymentForm, referenceNo: event.target.value })} className={inputClass} /></Field>
          <Field label="備註"><input value={paymentForm.note} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} className={inputClass} /></Field>
          <div className="flex items-end"><button className={`w-full rounded-2xl bg-[#F7C948] px-4 py-3 font-bold ${buttonShadow}`}>登記收款</button></div>
          {paymentAllocations.length ? <div className="sm:col-span-2 lg:col-span-4 text-sm"><p className="font-bold">分配預覽</p>{paymentAllocations.map((allocation) => <p key={allocation.record.id}>{allocation.record.periodMonth}：{formatCurrency(allocation.amount)}</p>)}{unallocatedPaymentAmount > 0 ? <p className="mt-1 font-bold text-[#A35C00]">溢繳未分配：{formatCurrency(unallocatedPaymentAmount)}，入帳時暫列代收付款。</p> : null}</div> : null}
        </form>

        {legacyPaidRecords.length ? <div className="mt-4 rounded-2xl border border-[#F7C948] p-4"><p className="font-bold">既有已繳資料尚未建立付款歷史</p><p className="mt-1 text-sm">選擇實際收款帳戶後，可轉成待入帳紀錄；不會改變原社費金額。</p><div className="mt-3 max-w-sm"><AccountSelect accounts={yearAccounts} value={legacyAccountId} onChange={setLegacyAccountId} /></div><div className="mt-3 space-y-2">{legacyPaidRecords.map((record) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E5D9BD] py-2"><span>{getMemberName(record.memberId, members)}｜{record.periodMonth}｜{formatCurrency(record.paidAmount)}</span><button type="button" onClick={() => void convertLegacyPaidRecord(record)} className={`rounded-xl bg-white px-3 py-2 text-sm font-bold ${buttonShadow}`}>建立待入帳收款</button></div>)}</div></div> : null}

        <div className="mt-4 space-y-3">
          {pendingPayments.map((payment) => {
            const preview = buildPostingPreview(payment, allocations, duesRecords, lineItems, activeCategories);
            return <article key={payment.id} className="rounded-2xl border border-[#E5D9BD] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{getMemberName(payment.memberId, members)}</p><p className="text-sm">{payment.paymentDate}｜{payment.paymentMethod}｜{accounts.find((account) => account.id === payment.accountId)?.name || "未選帳戶"}</p></div><span className="rounded-full bg-[#F47C6C] px-3 py-1 text-xs font-bold text-white">已收款待入帳</span></div><p className="mt-2 text-lg font-bold">{formatCurrency(payment.amount)}</p><div className="mt-3 rounded-xl bg-[#F8F3E8] p-3 text-sm"><p className="font-bold">借方資產增加：{accounts.find((account) => account.id === payment.accountId)?.name || "未選帳戶"} {formatCurrency(payment.amount)}</p>{preview.lines.map((line) => <p key={`${line.allocationId}-${line.category.id}`}>{line.isPassThrough ? "代收" : "收入"}｜{line.label} {formatCurrency(line.amount)}</p>)}{preview.errors.map((error) => <p key={error} className="font-bold text-red-700">{error}</p>)}</div><button type="button" disabled={postingPaymentId === payment.id || preview.errors.length > 0} onClick={() => void postPayment(payment)} className={`mt-3 w-full rounded-2xl bg-[#F7C948] py-3 font-bold disabled:opacity-50 ${buttonShadow}`}>{postingPaymentId === payment.id ? "入帳中" : "預覽確認後入帳"}</button></article>;
          })}
          {!pendingPayments.length && !legacyPaidRecords.length ? <p className="text-sm font-bold text-[#173B73]/70">目前沒有已收款待入帳社費。</p> : null}
        </div>
        {payments.some((payment) => payment.status === "posted") ? <div className="mt-5 border-t border-[#E5D9BD] pt-4"><h3 className="font-bold">近期已入帳收款</h3><div className="mt-2 space-y-2">{payments.filter((payment) => payment.status === "posted").slice(0, 6).map((payment) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F8F3E8] p-3 text-sm"><span>{getMemberName(payment.memberId, members)}｜{payment.paymentDate}｜{formatCurrency(payment.amount)}</span><button type="button" onClick={() => void reversePayment(payment)} className={`rounded-xl bg-white px-3 py-2 font-bold ${buttonShadow}`}>建立沖銷紀錄</button></div>)}</div></div> : null}
      </Collapsible>

      <Collapsible title="資產負債編列" open={Boolean(openSections.balance)} onToggle={() => toggleSection("balance", setOpenSections)}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl bg-[#F8F3E8] p-4"><h3 className="font-bold">系統建議值</h3><p className="mt-2">本年度累積結餘：{formatCurrency(yearIncome - yearExpense)}</p><p>社友應收款建議值：{formatCurrency(systemOutstanding)}</p><p>代收付款淨額建議值：{formatCurrency(sum(monthEntries.filter((entry) => entry.isPassThrough).map((entry) => entry.entryType === "income" ? entry.amount : -entry.amount)))}</p><p className="mt-2 text-sm font-bold text-[#A35C00]">銀行餘額不會由系統直接寫入，正式快照請採會計確認的實際月底餘額。</p><button type="button" onClick={onOpenBalanceSheet} className={`mt-4 rounded-2xl bg-[#F7C948] px-4 py-3 font-bold ${buttonShadow}`}>開啟完整資產負債表</button></div>
          <div className="rounded-2xl bg-[#F8F3E8] p-4"><h3 className="font-bold">目前快照</h3>{snapshot ? <><p className="mt-2">資產合計：{formatCurrency(balanceAssetTotal)}</p><p>負債及基金合計：{formatCurrency(balanceLiabilityFundTotal)}</p><p className={balanceDifference ? "font-bold text-red-700" : "font-bold text-green-700"}>平衡差額：{formatCurrency(balanceDifference)}</p></> : <p className="mt-2 font-bold text-[#A35C00]">本月份尚未建立資產負債表</p>}</div>
        </div>
        <h3 className="mt-5 text-lg font-bold">銀行對帳</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">{reconciliationModels.map((model) => <article key={model.account.id} className="rounded-2xl border border-[#E5D9BD] p-4"><h4 className="font-bold">{model.account.name}</h4><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><dt>上月底餘額</dt><dd className="text-right">{formatCurrency(model.openingBalance)}</dd><dt>本月收入</dt><dd className="text-right">{formatCurrency(model.income)}</dd><dt>本月支出</dt><dd className="text-right">{formatCurrency(model.expense)}</dd><dt>系統推算月底餘額</dt><dd className="text-right font-bold">{formatCurrency(model.calculatedBalance)}</dd></dl><Field label="銀行實際月底餘額"><input type="number" value={actualBalances[model.account.id] ?? (model.actualBalance ?? "")} onChange={(event) => setActualBalances({ ...actualBalances, [model.account.id]: event.target.value })} className={inputClass} /></Field><p className={`mt-2 text-right font-bold ${(number(actualBalances[model.account.id] ?? model.actualBalance ?? model.calculatedBalance) - model.calculatedBalance) !== 0 ? "text-red-700" : "text-green-700"}`}>差額：{formatCurrency(number(actualBalances[model.account.id] ?? model.actualBalance ?? model.calculatedBalance) - model.calculatedBalance)}</p><button type="button" onClick={() => void saveReconciliation(model)} className={`mt-3 w-full rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}>確認實際餘額</button></article>)}</div>
      </Collapsible>

      <Collapsible title={`月底檢查與月結（${completedChecklist} / ${checklistItems.length}）`} open={Boolean(openSections.close)} onToggle={() => toggleSection("close", setOpenSections)}>
        <div className="grid gap-5 lg:grid-cols-2">
          <section><h3 className="font-bold">月底作帳流程</h3><div className="mt-3 space-y-2">{checklistItems.map(([key, label], index) => { const checked = checklistRows.some((row) => row.itemKey === key && row.isCompleted); return <label key={key} className="flex items-start gap-3 rounded-xl bg-[#F8F3E8] p-3"><input type="checkbox" checked={checked} onChange={(event) => void toggleChecklist(key, event.target.checked)} className="mt-1 size-5" /><span>{index + 1}. {label}</span></label>; })}</div></section>
          <section><h3 className="font-bold">不平衡診斷</h3><div className="mt-3 space-y-2">{diagnostics.map((item) => <div key={item.label} className={`rounded-xl p-3 text-sm ${item.severity === "error" ? "bg-red-50 text-red-800" : item.severity === "warning" ? "bg-[#FFF6D6] text-[#805500]" : "bg-green-50 text-green-800"}`}><p className="font-bold">{item.label}</p><p>{item.detail}</p></div>)}</div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={onOpenMonthlyReport} className={`rounded-2xl bg-white px-4 py-3 font-bold ${buttonShadow}`}>查看月報與匯出</button>{monthClosed ? <span className="rounded-full bg-[#173B73] px-4 py-3 text-sm font-bold text-white">本月已鎖定</span> : <button type="button" onClick={onCloseMonth} className={`rounded-2xl bg-[#F7C948] px-4 py-3 font-bold ${buttonShadow}`}>鎖定本月</button>}</div></section>
        </div>
      </Collapsible>

      <section className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
        <h2 className="text-xl font-bold">年度預算執行</h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-2"><BudgetColumn title="收入達成率" groups={budgetGroups.filter((group) => group.entryType === "income")} /><BudgetColumn title="支出執行率" groups={budgetGroups.filter((group) => group.entryType === "expense")} /></div>
      </section>
    </section>
  );
}

function Collapsible({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return <section className="min-w-0 rounded-3xl bg-white/85 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]"><button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left font-bold"><span>{title}</span><span aria-hidden>{open ? "▼" : "▶"}</span></button>{open ? <div className="min-w-0 border-t border-[#E5D9BD] p-5">{children}</div> : null}</section>;
}

function MetricCard({ label, value, compact, warning }: { label: string; value: string; signed?: boolean; compact?: boolean; warning?: boolean }) {
  return <article className={`min-w-0 rounded-2xl bg-white/90 ${compact ? "p-3" : "p-4"} shadow-[5px_5px_12px_rgba(0,0,0,0.1)]`}><p className="text-xs font-bold text-[#173B73]/65">{label}</p><p className={`mt-1 break-words text-right font-bold ${compact ? "text-base" : "text-xl"} ${warning ? "text-red-700" : "text-[#173B73]"}`}>{value}</p></article>;
}

function Notice({ tone, children }: { tone: "success" | "error" | "warning" | "info"; children: ReactNode }) {
  const colors = tone === "error" ? "border-red-200 bg-red-50 text-red-800" : tone === "warning" ? "border-[#F7C948] bg-[#FFF6D6] text-[#805500]" : tone === "success" ? "border-green-200 bg-green-50 text-green-800" : "border-blue-200 bg-blue-50 text-[#173B73]";
  return <p className={`rounded-2xl border p-4 text-sm font-bold ${colors}`}>{children}</p>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1 block text-sm font-bold">{label}</span>{children}</label>;
}

function AccountSelect({ accounts, value, onChange }: { accounts: Account[]; value: string; onChange: (value: string) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}><option value="">選擇帳戶</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>;
}

function BudgetColumn({ title, groups }: { title: string; groups: ReturnType<typeof buildBudgetGroups> }) {
  return <div><h3 className="font-bold">{title}</h3><div className="mt-2 space-y-2">{groups.map((group) => { const rate = group.budget > 0 ? group.actual / group.budget * 100 : null; const tone = rate === null ? "text-[#173B73]" : group.entryType === "income" ? "text-green-700" : rate > 100 ? "text-red-700" : rate > 90 ? "text-[#A35C00]" : rate >= 70 ? "text-[#805500]" : "text-green-700"; return <div key={`${group.entryType}-${group.groupName}`} className="rounded-xl bg-[#F8F3E8] p-3 text-sm"><div className="flex justify-between gap-3"><span className="font-bold">{group.groupName}</span><span className={`font-bold ${tone}`}>{rate === null ? "—" : `${rate.toFixed(1)}%`}</span></div><div className="mt-1 grid grid-cols-3 gap-2 text-xs"><span>預算 {formatCurrency(group.budget)}</span><span>累計 {formatCurrency(group.actual)}</span><span className="text-right">餘額 {group.budget > 0 ? formatCurrency(group.entryType === "income" ? group.actual - group.budget : group.budget - group.actual) : "—"}</span></div></div>; })}</div></div>;
}

const inputClass = "w-full min-w-0 rounded-2xl border border-[#E5D9BD] bg-white px-3 py-3 text-base";

function toggleSection(key: string, setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>) {
  setter((current) => ({ ...current, [key]: !current[key] }));
}

function buildPaymentAllocationPreview(memberId: string, paymentAmount: number, records: DuesRecord[]) {
  let remaining = paymentAmount;
  return records.filter((record) => record.memberId === memberId && duesOutstanding(record) > 0).sort((a, b) => a.periodMonth.localeCompare(b.periodMonth)).flatMap((record) => {
    if (remaining <= 0) return [];
    const amount = Math.min(remaining, duesOutstanding(record));
    remaining -= amount;
    return [{ record, amount }];
  });
}

function buildPostingPreview(payment: Payment, allocations: Allocation[], records: DuesRecord[], lineItems: DuesLineItem[], categories: Category[]) {
  const errors: string[] = [];
  const lines: Array<{ allocationId: string; duesRecordId: string; category: Category; label: string; amount: number; isPassThrough: boolean; sourceType: string }> = [];
  const paymentAllocations = allocations.filter((allocation) => allocation.paymentId === payment.id);
  if (!payment.accountId) errors.push("請先指定實際收款帳戶。");
  paymentAllocations.forEach((allocation) => {
    const record = records.find((item) => item.id === allocation.duesRecordId);
    const recordItems = lineItems.filter((item) => item.duesRecordId === allocation.duesRecordId && item.amount > 0);
    if (!record) return errors.push("找不到付款分配對應的社費紀錄。");
    if (!recordItems.length) return errors.push(`${record.periodMonth} 為舊資料且缺少社費明細，請先於社費資料補齊明細或使用一般收支手動指定科目。`);
    let remaining = allocation.allocatedAmount;
    const grouped = new Map<string, { category: Category; label: string; amount: number; isPassThrough: boolean }>();
    recordItems.forEach((item) => {
      if (remaining <= 0) return;
      const amount = Math.min(item.amount, remaining);
      remaining -= amount;
      const category = findLineItemCategory(item.itemType, categories);
      if (!category) {
        errors.push(`${lineItemLabels[item.itemType] || item.itemName || item.itemType} 找不到對應會計科目，請先在年度預算建立或啟用對應科目。`);
        return;
      }
      const isPassThrough = item.itemType === "rotary_foundation" || item.itemType === "pass_through";
      const current = grouped.get(category.id);
      grouped.set(category.id, { category, label: lineItemLabels[item.itemType] || item.itemName, amount: (current?.amount ?? 0) + amount, isPassThrough: current?.isPassThrough || isPassThrough });
    });
    if (remaining > 0) errors.push(`${record.periodMonth} 收款超過可辨識社費明細 ${formatCurrency(remaining)}，請先確認明細。`);
    grouped.forEach((line) => lines.push({ allocationId: allocation.id, duesRecordId: allocation.duesRecordId, sourceType: "dues_payment_allocation", ...line }));
  });
  const unallocated = payment.amount - sum(paymentAllocations.map((allocation) => allocation.allocatedAmount));
  if (unallocated > 0) {
    const category = categories.find((item) => item.entryType === "income" && item.isActive && `${item.groupName}${item.name}`.includes("代收"));
    if (!category) errors.push(`溢繳 ${formatCurrency(unallocated)} 找不到「代收」會計科目，請先建立或啟用後再入帳。`);
    else lines.push({ allocationId: payment.id, duesRecordId: "", category, label: "社費溢繳（暫列代收）", amount: unallocated, isPassThrough: true, sourceType: "dues_payment_overpayment" });
  }
  return { lines, errors: unique(errors) };
}

function findLineItemCategory(itemType: string, categories: Category[]) {
  const keywords: Record<string, string[]> = {
    annual_fee: ["常年", "社費"],
    meal: ["餐費"],
    special_donation: ["特別捐", "捐款"],
    red_box: ["紅箱"],
    rotary_foundation: ["代收", "扶輪基金"],
    pass_through: ["代收"],
  };
  const candidates = categories.filter((category) => category.entryType === "income" && category.isActive);
  return candidates.find((category) => (keywords[itemType] ?? []).some((keyword) => `${category.groupName}${category.name}`.includes(keyword)));
}

function buildReconciliationModel(account: Account, month: string, entries: Entry[], reconciliations: Reconciliation[]) {
  const previous = reconciliations.filter((row) => row.accountId === account.id && row.reportMonth < month && row.actualBalance !== null).sort((a, b) => b.reportMonth.localeCompare(a.reportMonth))[0];
  const current = reconciliations.find((row) => row.accountId === account.id && row.reportMonth === month);
  const accountEntries = entries.filter((entry) => entry.accountId === account.id && entry.entryDate.startsWith(month) && entry.status !== "voided");
  const openingBalance = previous?.actualBalance ?? account.openingBalance;
  const income = sumEntries(accountEntries, "income");
  const expense = sumEntries(accountEntries, "expense");
  return { account, openingBalance, income, expense, calculatedBalance: openingBalance + income - expense, actualBalance: current?.actualBalance ?? null, difference: current?.difference ?? null };
}

function buildDiagnostics({ snapshot, balanceDifference, balanceItems, reconciliations, entries, yearEntries, pendingPayments, legacyPaidRecords, payments, allocations, systemOutstanding }: { snapshot: Snapshot | null; balanceDifference: number; balanceItems: Array<BalanceCategory & { amount: number }>; reconciliations: ReturnType<typeof buildReconciliationModel>[]; entries: Entry[]; yearEntries: Entry[]; pendingPayments: Payment[]; legacyPaidRecords: DuesRecord[]; payments: Payment[]; allocations: Allocation[]; systemOutstanding: number }) {
  const diagnostics: Array<{ label: string; detail: string; severity: "ok" | "warning" | "error" }> = [];
  diagnostics.push({ label: "A. 資產負債平衡", detail: snapshot ? `差額 ${formatCurrency(balanceDifference)}` : "本月份尚未建立資產負債表。", severity: !snapshot || balanceDifference !== 0 ? "error" : "ok" });
  const bankDifference = sum(reconciliations.map((row) => row.actualBalance === null ? 0 : row.actualBalance - row.calculatedBalance));
  diagnostics.push({ label: "B. 銀行對帳差額", detail: reconciliations.some((row) => row.actualBalance !== null) ? `合計 ${formatCurrency(bankDifference)}。差額可能來自未登錄收支、帳戶選錯、手續費、利息、跨月或期初餘額。` : "尚未輸入銀行實際月底餘額。", severity: bankDifference !== 0 || reconciliations.every((row) => row.actualBalance === null) ? "warning" : "ok" });
  const receivableSnapshot = sumBalance(balanceItems, "應收");
  diagnostics.push({ label: "C. 社費應收差額", detail: `快照 ${formatCurrency(receivableSnapshot)}；系統未繳社費 ${formatCurrency(systemOutstanding)}；差額 ${formatCurrency(receivableSnapshot - systemOutstanding)}。`, severity: snapshot && receivableSnapshot !== systemOutstanding ? "warning" : "ok" });
  const passThroughNet = sum(entries.filter((entry) => entry.isPassThrough).map((entry) => entry.entryType === "income" ? entry.amount : -entry.amount));
  const passThroughSnapshot = sumBalance(balanceItems, "代收");
  diagnostics.push({ label: "D. 代收付款差額", detail: `快照 ${formatCurrency(passThroughSnapshot)}；交易淨額 ${formatCurrency(passThroughNet)}；差額 ${formatCurrency(passThroughSnapshot - passThroughNet)}。`, severity: snapshot && passThroughSnapshot !== passThroughNet ? "warning" : "ok" });
  const yearBalance = sumEntries(yearEntries, "income") - sumEntries(yearEntries, "expense");
  const yearBalanceSnapshot = sumBalance(balanceItems, "本年度累積結餘");
  diagnostics.push({ label: "E. 本年度累積結餘差額", detail: `快照 ${formatCurrency(yearBalanceSnapshot)}；系統 ${formatCurrency(yearBalance)}；差額 ${formatCurrency(yearBalanceSnapshot - yearBalance)}。`, severity: snapshot && yearBalanceSnapshot !== yearBalance ? "warning" : "ok" });
  const uncategorized = entries.filter((entry) => !entry.categoryId || !entry.category).length;
  diagnostics.push({ label: "F. 未分類交易", detail: `${uncategorized} 筆。`, severity: uncategorized ? "warning" : "ok" });
  const noAccount = entries.filter((entry) => !entry.accountId).length;
  diagnostics.push({ label: "G. 未指定帳戶", detail: `${noAccount} 筆收支未指定實際收付款帳戶。`, severity: noAccount ? "warning" : "ok" });
  diagnostics.push({ label: "H. 已收社費待入帳", detail: `${pendingPayments.length + legacyPaidRecords.length} 筆，金額 ${formatCurrency(sum(pendingPayments.map((item) => item.amount)) + sum(legacyPaidRecords.map((item) => item.paidAmount)))}。`, severity: pendingPayments.length + legacyPaidRecords.length ? "warning" : "ok" });
  const mismatched = payments.filter((payment) => payment.status === "posted" && sum(entries.filter((entry) => (entry.sourceType === "dues_payment_allocation" && allocations.some((allocation) => allocation.paymentId === payment.id && allocation.id === entry.sourceId)) || (entry.sourceType === "dues_payment_overpayment" && entry.sourceId === payment.id)).map((entry) => entry.amount)) !== payment.amount);
  diagnostics.push({ label: "I. 社費入帳金額不一致", detail: `${mismatched.length} 筆。`, severity: mismatched.length ? "error" : "ok" });
  const duplicateKeys = entries.filter((entry) => entry.sourceType === "dues_payment_allocation").map((entry) => `${entry.sourceId}:${entry.categoryId}`);
  const duplicates = duplicateKeys.filter((key, index) => duplicateKeys.indexOf(key) !== index).length;
  diagnostics.push({ label: "J. 重複社費入帳", detail: `${duplicates} 筆可能重複。`, severity: duplicates ? "error" : "ok" });
  return diagnostics;
}

function buildBudgetGroups(categories: Category[], entries: Entry[]) {
  return unique(categories.map((category) => `${category.entryType}|${category.groupName}`)).map((key) => {
    const [entryType, groupName] = key.split("|") as [EntryType, string];
    const groupCategories = categories.filter((category) => category.entryType === entryType && category.groupName === groupName);
    return { entryType, groupName, budget: sum(groupCategories.map((category) => category.annualBudget)), actual: sum(entries.filter((entry) => entry.entryType === entryType && groupCategories.some((category) => category.id === entry.categoryId)).map((entry) => entry.amount)) };
  });
}

function buildJadeReminders({ pendingPayments, legacyPaidRecords, monthEntries, snapshot, monthClosed, diagnostics, budgetGroups }: { pendingPayments: Payment[]; legacyPaidRecords: DuesRecord[]; monthEntries: Entry[]; snapshot: Snapshot | null; monthClosed: boolean; diagnostics: Array<{ label: string; detail: string; severity: string }>; budgetGroups: ReturnType<typeof buildBudgetGroups> }) {
  const reminders: string[] = [];
  const pendingCount = pendingPayments.length + legacyPaidRecords.length;
  if (pendingCount) reminders.push(`本月尚有 ${pendingCount} 筆已收社費未入帳。`);
  const uncategorized = monthEntries.filter((entry) => !entry.categoryId).length;
  if (uncategorized) reminders.push(`本月有 ${uncategorized} 筆交易未選會計科目。`);
  const noAccount = monthEntries.filter((entry) => !entry.accountId).length;
  if (noAccount) reminders.push(`本月有 ${noAccount} 筆交易未指定收付款帳戶。`);
  if (!snapshot) reminders.push("本月份資產負債表尚未建立。");
  if (!monthClosed) reminders.push("本月份尚未完成月結。");
  diagnostics.filter((item) => item.severity === "error").forEach((item) => reminders.push(`${item.label}：${item.detail}`));
  budgetGroups.filter((group) => group.entryType === "expense" && group.budget > 0 && group.actual / group.budget >= 0.9).forEach((group) => reminders.push(`${group.groupName}已使用年度預算 ${(group.actual / group.budget * 100).toFixed(0)}%。`));
  return unique(reminders);
}

function mapAccount(row: Row): Account { return { id: text(row.id), rotaryYearId: text(row.rotary_year_id), name: text(row.name), accountCategory: text(row.account_category) || inferAccountCategory(text(row.name)), openingBalance: number(row.opening_balance), isActive: row.is_active !== false }; }
function mapCategory(row: Row): Category { return { id: text(row.id), rotaryYearId: text(row.rotary_year_id), entryType: text(row.entry_type) as EntryType, groupName: text(row.group_name), name: text(row.name), annualBudget: number(row.annual_budget), sortOrder: number(row.sort_order), isActive: row.is_active !== false }; }
function mapEntry(row: Row): Entry { return { id: text(row.id), rotaryYearId: text(row.rotary_year_id), entryDate: text(row.entry_date), entryType: text(row.entry_type) as EntryType, categoryId: text(row.category_id), category: text(row.category), description: text(row.description), amount: number(row.amount), accountId: text(row.account_id), paymentMethod: text(row.payment_method), referenceNo: text(row.reference_no), isPassThrough: Boolean(row.is_pass_through), duesRecordId: text(row.dues_record_id), sourceType: text(row.source_type), sourceId: text(row.source_id), status: text(row.status) || "posted" }; }
function mapDuesRecord(row: Row): DuesRecord { return { id: text(row.id), memberId: text(row.member_id), periodMonth: text(row.period_month), previousBalance: number(row.previous_balance), currentDue: number(row.current_due), paidAmount: number(row.paid_amount), paymentDate: text(row.payment_date), paymentMethod: text(row.payment_method) }; }
function mapLineItem(row: Row): DuesLineItem { return { id: text(row.id), duesRecordId: text(row.dues_record_id), itemType: text(row.item_type), itemName: text(row.item_name), amount: number(row.amount) }; }
function mapPayment(row: Row): Payment { return { id: text(row.id), memberId: text(row.member_id), paymentDate: text(row.payment_date), amount: number(row.amount), paymentMethod: text(row.payment_method), accountId: text(row.account_id), referenceNo: text(row.reference_no), note: text(row.note), status: text(row.status) as Payment["status"] }; }
function mapAllocation(row: Row): Allocation { return { id: text(row.id), paymentId: text(row.payment_id), duesRecordId: text(row.dues_record_id), allocatedAmount: number(row.allocated_amount) }; }
function mapMember(row: Row): Member { return { id: text(row.id), chineseName: text(row.chinese_name), rotaryName: text(row.rotary_name) }; }
function mapBalanceCategory(row: Row): BalanceCategory { return { id: text(row.id), itemType: text(row.item_type) as BalanceCategory["itemType"], groupName: text(row.group_name), name: normalizeBalanceName(text(row.name)) }; }
function mapReconciliation(row: Row): Reconciliation { return { id: text(row.id), accountId: text(row.account_id), reportMonth: text(row.report_month), openingBalance: number(row.opening_balance), calculatedBalance: number(row.calculated_balance), actualBalance: row.actual_balance === null || row.actual_balance === undefined ? null : number(row.actual_balance), difference: row.difference === null || row.difference === undefined ? null : number(row.difference), status: text(row.status) as Reconciliation["status"] }; }
function mapChecklist(row: Row): ChecklistRow { return { id: text(row.id), itemKey: text(row.item_key), isCompleted: Boolean(row.is_completed) }; }

function inferAccountCategory(name: string) { if (name.includes("活存")) return "bank_current"; if (name.includes("定存")) return "bank_deposit"; if (name.includes("零用金")) return "cash"; return "other"; }
function duesOutstanding(record: DuesRecord) { return Math.max(0, record.previousBalance + record.currentDue - record.paidAmount); }
function sumEntries(entries: Entry[], type: EntryType) { return sum(entries.filter((entry) => entry.entryType === type).map((entry) => entry.amount)); }
function sumBalance(items: Array<{ groupName: string; name: string; amount: number }>, keyword: string) { return sum(items.filter((item) => `${item.groupName}${item.name}`.includes(keyword)).map((item) => item.amount)); }
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function unique<T>(values: T[]) { return [...new Set(values)]; }
function text(value: unknown) { return typeof value === "string" ? value : value == null ? "" : String(value); }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function formatCurrency(value: number) { return `NT$${Math.round(value).toLocaleString("zh-TW")}`; }
function getMemberName(memberId: string, members: Member[]) { const member = members.find((item) => item.id === memberId); return member ? formatMemberName(member) : "未知社友"; }
function normalizeBalanceName(name: string) { return name === "本年度累積餘絀" ? "本年度累積結餘" : name; }
function getErrorMessage(error: unknown, fallback: string) { return error instanceof Error ? `${fallback}：${error.message}` : typeof error === "object" && error && "message" in error ? `${fallback}：${String((error as { message: unknown }).message)}` : fallback; }
