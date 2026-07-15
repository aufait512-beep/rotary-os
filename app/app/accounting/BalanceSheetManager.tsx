"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RotaryYear } from "@/lib/events";
import { supabase } from "@/src/lib/supabase";

type EntryType = "income" | "expense";
type BalanceItemType = "asset" | "liability" | "fund";

type AccountingEntryLike = {
  rotaryYearId: string;
  entryDate: string;
  entryType: EntryType;
  amount: number;
};

type MonthCloseLike = {
  rotaryYearId: string;
  reportMonth: string;
  status: "draft" | "closed";
};

type BalanceCategory = {
  id: string;
  rotaryYearId: string;
  itemType: BalanceItemType;
  groupName: string;
  name: string;
  sortOrder: number;
  isSystem: boolean;
  isActive: boolean;
};

type BalanceSnapshot = {
  id: string;
  rotaryYearId: string;
  reportMonth: string;
  reportDate: string;
  status: "draft" | "closed";
  imbalanceReason: string;
};

type BalanceValue = {
  id: string;
  snapshotId: string;
  categoryId: string;
  amount: number;
  systemCalculatedAmount: number | null;
  manualAdjustment: number;
  adjustmentReason: string;
};

type CategoryForm = {
  itemType: BalanceItemType;
  groupName: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

const emptyCategoryForm: CategoryForm = {
  itemType: "asset",
  groupName: "銀行活存",
  name: "",
  sortOrder: 1000,
  isActive: true,
};

const groupOptions: Record<BalanceItemType, string[]> = {
  asset: ["銀行活存", "零用金", "銀行定存", "應收款項", "其他資產"],
  liability: ["應付款項", "代收付款", "其他負債"],
  fund: ["基金／累積結餘"],
};

export default function BalanceSheetManager({
  years,
  yearId,
  month,
  cutoffDate,
  entries,
  monthCloses,
  onSaved,
}: {
  years: RotaryYear[];
  yearId: string;
  month: string;
  cutoffDate: string;
  entries: AccountingEntryLike[];
  monthCloses: MonthCloseLike[];
  onSaved?: () => void;
}) {
  const [categories, setCategories] = useState<BalanceCategory[]>([]);
  const [snapshot, setSnapshot] = useState<BalanceSnapshot | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [manualAdjustment, setManualAdjustment] = useState("0");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [allowAdjustment, setAllowAdjustment] = useState(false);
  const [reportDate, setReportDate] = useState(cutoffDate);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategoryForm);
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const selectedYear = years.find((year) => year.id === yearId);
  const reportMonth = month ? `${month}-01` : "";
  const isClosed = monthCloses.some(
    (close) =>
      close.rotaryYearId === yearId &&
      close.reportMonth === month &&
      close.status === "closed"
  );
  const yearStart = selectedYear?.startDate ?? `${month.slice(0, 4)}-07-01`;
  const yearEntries = entries.filter(
    (entry) =>
      entry.rotaryYearId === yearId &&
      entry.entryDate >= yearStart &&
      entry.entryDate <= reportDate
  );
  const yearIncome = sumEntries(yearEntries, "income");
  const yearExpense = sumEntries(yearEntries, "expense");
  const systemYearBalance = yearIncome - yearExpense;
  const finalYearBalance = systemYearBalance + toNumber(manualAdjustment);

  const displayCategories = useMemo(
    () =>
      categories
        .filter((category) => category.isActive || values[category.id] !== undefined)
        .sort((first, second) => first.sortOrder - second.sortOrder),
    [categories, values]
  );
  const assetCategories = displayCategories.filter((category) => category.itemType === "asset");
  const liabilityFundCategories = displayCategories.filter((category) => category.itemType !== "asset");
  const assetTotal = sumCategoryValues(assetCategories, values, finalYearBalance);
  const liabilityFundTotal = sumCategoryValues(liabilityFundCategories, values, finalYearBalance);
  const balanceDifference = assetTotal - liabilityFundTotal;

  const loadBalanceSheet = useCallback(async () => {
    if (!yearId || !reportMonth) return;
    setIsLoading(true);
    setErrorMessage("");
    try {
      const categoryResult = await supabase
        .from("accounting_balance_categories")
        .select("*")
        .eq("rotary_year_id", yearId)
        .order("sort_order", { ascending: true });
      if (categoryResult.error) throw categoryResult.error;
      const loadedCategories = (categoryResult.data ?? []).map(mapCategory);
      setCategories(loadedCategories);

      const snapshotResult = await supabase
        .from("accounting_balance_snapshots")
        .select("*")
        .eq("rotary_year_id", yearId)
        .eq("report_month", reportMonth)
        .maybeSingle();
      if (snapshotResult.error) throw snapshotResult.error;

      if (!snapshotResult.data) {
        setSnapshot(null);
        setValues({});
        setManualAdjustment("0");
        setAdjustmentReason("");
        setAllowAdjustment(false);
        setReportDate(cutoffDate);
        return;
      }

      const loadedSnapshot = mapSnapshot(snapshotResult.data);
      setSnapshot(loadedSnapshot);
      setReportDate(loadedSnapshot.reportDate);

      const valueResult = await supabase
        .from("accounting_balance_values")
        .select("*")
        .eq("snapshot_id", loadedSnapshot.id);
      if (valueResult.error) throw valueResult.error;
      const loadedValues = (valueResult.data ?? []).map(mapValue);
      const valueMap: Record<string, string> = {};
      loadedValues.forEach((value) => {
        const category = loadedCategories.find((item) => item.id === value.categoryId);
        if (isSystemYearBalance(category)) {
          setManualAdjustment(String(value.manualAdjustment || 0));
          setAdjustmentReason(value.adjustmentReason || "");
          setAllowAdjustment(Boolean(value.manualAdjustment || value.adjustmentReason));
        } else {
          valueMap[value.categoryId] = String(value.amount || 0);
        }
      });
      setValues(valueMap);
    } catch (error) {
      console.error(error);
      setErrorMessage(getErrorMessage(error, "資產負債表資料讀取失敗，請確認是否已執行 migration"));
    } finally {
      setIsLoading(false);
    }
  }, [cutoffDate, reportMonth, yearId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadBalanceSheet();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [loadBalanceSheet]);

  function updateValue(categoryId: string, value: string) {
    setValues((currentValues) => ({ ...currentValues, [categoryId]: value }));
  }

  async function saveSnapshot() {
    if (!yearId || !reportMonth) {
      setErrorMessage("請先選擇年度與月份。");
      return;
    }
    if (isClosed) {
      setErrorMessage("本月份已完成月結，請先解除月結後再修改。");
      return;
    }
    if (allowAdjustment && !adjustmentReason.trim() && toNumber(manualAdjustment) !== 0) {
      setErrorMessage("人工調整本年度累積結餘時，必須填寫調整原因。");
      return;
    }

    setErrorMessage("");
    const snapshotPayload = {
      id: snapshot?.id ?? crypto.randomUUID(),
      rotary_year_id: yearId,
      report_month: reportMonth,
      report_date: reportDate,
      status: "draft",
      imbalance_reason: snapshot?.imbalanceReason || null,
    };

    const snapshotResult = await supabase
      .from("accounting_balance_snapshots")
      .upsert(snapshotPayload, { onConflict: "rotary_year_id,report_month" })
      .select()
      .single();
    if (snapshotResult.error) {
      setErrorMessage(getErrorMessage(snapshotResult.error, "資產負債快照儲存失敗"));
      return;
    }

    const savedSnapshot = mapSnapshot(snapshotResult.data);
    const valuePayloads = displayCategories.map((category) => {
      const isYearBalance = isSystemYearBalance(category);
      const adjustment = allowAdjustment ? toNumber(manualAdjustment) : 0;
      const amount = isYearBalance
        ? systemYearBalance + adjustment
        : toNumber(values[category.id]);

      return {
        id: crypto.randomUUID(),
        snapshot_id: savedSnapshot.id,
        category_id: category.id,
        amount,
        system_calculated_amount: isYearBalance ? systemYearBalance : null,
        manual_adjustment: isYearBalance ? adjustment : 0,
        adjustment_reason: isYearBalance ? adjustmentReason.trim() || null : null,
      };
    });

    const valueResult = await supabase
      .from("accounting_balance_values")
      .upsert(valuePayloads, { onConflict: "snapshot_id,category_id" });
    if (valueResult.error) {
      setErrorMessage(getErrorMessage(valueResult.error, "資產負債金額儲存失敗"));
      return;
    }

    setSnapshot(savedSnapshot);
    setMessage("資產負債表草稿已儲存。");
    await loadBalanceSheet();
    onSaved?.();
  }

  async function carryPreviousMonth() {
    if (isClosed) {
      setErrorMessage("本月份已完成月結，不能帶入上月資料。");
      return;
    }
    const previousSnapshotResult = await supabase
      .from("accounting_balance_snapshots")
      .select("*")
      .eq("rotary_year_id", yearId)
      .lt("report_month", reportMonth)
      .order("report_month", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousSnapshotResult.error) {
      setErrorMessage(getErrorMessage(previousSnapshotResult.error, "上月快照讀取失敗"));
      return;
    }
    if (!previousSnapshotResult.data) {
      setErrorMessage("找不到上月資產負債快照。");
      return;
    }
    const valueResult = await supabase
      .from("accounting_balance_values")
      .select("*")
      .eq("snapshot_id", text(previousSnapshotResult.data.id));
    if (valueResult.error) {
      setErrorMessage(getErrorMessage(valueResult.error, "上月金額讀取失敗"));
      return;
    }
    const previousValues = (valueResult.data ?? []).map(mapValue);
    const nextValues: Record<string, string> = {};
    previousValues.forEach((value) => {
      const category = categories.find((item) => item.id === value.categoryId);
      if (category && !isSystemYearBalance(category)) {
        nextValues[category.id] = String(value.amount || 0);
      }
    });
    setValues(nextValues);
    setMessage("已帶入上月資產負債資料，請確認後儲存。");
  }

  async function carryPreviousYearBalance() {
    const currentYear = selectedYear;
    if (!currentYear) return;
    const previousYear = [...years]
      .filter((year) => year.endDate < currentYear.startDate)
      .sort((first, second) => second.endDate.localeCompare(first.endDate))[0];
    if (!previousYear) {
      setErrorMessage("找不到上一扶輪年度。");
      return;
    }
    const previousSnapshotResult = await supabase
      .from("accounting_balance_snapshots")
      .select("*")
      .eq("rotary_year_id", previousYear.id)
      .order("report_month", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousSnapshotResult.error || !previousSnapshotResult.data) {
      setErrorMessage("找不到上一年度期末資產負債表。");
      return;
    }
    const [previousCategoriesResult, previousValuesResult] = await Promise.all([
      supabase.from("accounting_balance_categories").select("*").eq("rotary_year_id", previousYear.id),
      supabase.from("accounting_balance_values").select("*").eq("snapshot_id", text(previousSnapshotResult.data.id)),
    ]);
    if (previousCategoriesResult.error) {
      setErrorMessage(getErrorMessage(previousCategoriesResult.error, "上一年度科目讀取失敗"));
      return;
    }
    if (previousValuesResult.error) {
      setErrorMessage(getErrorMessage(previousValuesResult.error, "上一年度金額讀取失敗"));
      return;
    }
    const previousCategories = (previousCategoriesResult.data ?? []).map(mapCategory);
    const previousValues = (previousValuesResult.data ?? []).map(mapValue);
    const accumulated = findAmount(previousCategories, previousValues, "歷屆累計餘絀");
    const yearBalance = findAmount(previousCategories, previousValues, "本年度累積結餘");
    const suggested = accumulated + yearBalance;
    const confirmed = window.confirm(
      `上一年度歷屆累計餘絀 ${formatCurrency(accumulated)} + 本年度累積結餘 ${formatCurrency(yearBalance)} = ${formatCurrency(suggested)}。是否帶入？`
    );
    if (!confirmed) return;
    const target = categories.find((category) => category.name === "歷屆累計餘絀");
    if (!target) {
      setErrorMessage("本年度尚未建立「歷屆累計餘絀」科目。");
      return;
    }
    updateValue(target.id, String(suggested));
  }

  async function saveCategory() {
    if (!yearId) return;
    if (!categoryForm.groupName.trim() || !categoryForm.name.trim()) {
      setErrorMessage("大項與科目名稱不可空白。");
      return;
    }
    const payload = {
      id: editingCategoryId || crypto.randomUUID(),
      rotary_year_id: yearId,
      item_type: categoryForm.itemType,
      group_name: categoryForm.groupName.trim(),
      name: categoryForm.name.trim(),
      sort_order: categoryForm.sortOrder,
      is_system: editingCategoryId
        ? categories.find((category) => category.id === editingCategoryId)?.isSystem ?? false
        : false,
      is_active: categoryForm.isActive,
    };
    const { error } = await supabase
      .from("accounting_balance_categories")
      .upsert(payload, { onConflict: "id" });
    if (error) {
      setErrorMessage(getErrorMessage(error, "資產負債科目儲存失敗"));
      return;
    }
    setCategoryForm(emptyCategoryForm);
    setEditingCategoryId("");
    setMessage("資產負債科目已儲存。");
    await loadBalanceSheet();
  }

  async function deleteCategory(category: BalanceCategory) {
    if (category.isSystem) {
      setErrorMessage("系統基本科目不可刪除，可改為停用。");
      return;
    }
    if (!window.confirm(`確定要刪除 ${category.groupName} / ${category.name} 嗎？`)) return;
    if (!window.confirm("再次確認：刪除後無法復原。")) return;
    const valueCount = await supabase
      .from("accounting_balance_values")
      .select("id", { count: "exact", head: true })
      .eq("category_id", category.id);
    if (valueCount.error) {
      setErrorMessage(getErrorMessage(valueCount.error, "科目歷史資料檢查失敗"));
      return;
    }
    if ((valueCount.count ?? 0) > 0) {
      const { error } = await supabase
        .from("accounting_balance_categories")
        .update({ is_active: false })
        .eq("id", category.id);
      if (error) {
        setErrorMessage(getErrorMessage(error, "科目停用失敗"));
        return;
      }
      setMessage("此科目已有歷史資料，已改為停用。");
      await loadBalanceSheet();
      return;
    }
    const { error } = await supabase
      .from("accounting_balance_categories")
      .delete()
      .eq("id", category.id);
    if (error) {
      setErrorMessage(getErrorMessage(error, "科目刪除失敗"));
      return;
    }
    await loadBalanceSheet();
  }

  function startEditCategory(category: BalanceCategory) {
    setEditingCategoryId(category.id);
    setCategoryForm({
      itemType: category.itemType,
      groupName: category.groupName,
      name: category.name,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
    });
  }

  return (
    <section className="space-y-5">
      {message ? <Notice tone="success">{message}</Notice> : null}
      {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}
      {isClosed ? (
        <Notice tone="warning">本月份已完成月結，資產負債表僅可檢視，請先解除月結後再修改。</Notice>
      ) : null}

      <section className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className="text-sm font-bold">資產負債月份</span>
            <input value={month} readOnly className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-[#F8F3E8] px-4 py-3 font-bold" />
          </label>
          <label>
            <span className="text-sm font-bold">統計日期</span>
            <input
              type="date"
              value={reportDate}
              disabled={isClosed}
              onChange={(event) => setReportDate(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 font-bold disabled:bg-[#F8F3E8]"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={saveSnapshot}
              disabled={isClosed || isLoading}
              className={`w-full rounded-2xl bg-[#F7C948] px-4 py-3 font-bold disabled:opacity-50 ${buttonShadow}`}
            >
              儲存月底餘額
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={isClosed} onClick={carryPreviousMonth} className={`rounded-2xl bg-white px-4 py-2 text-sm font-bold disabled:opacity-50 ${buttonShadow}`}>
            帶入上月資料
          </button>
          <button type="button" disabled={isClosed} onClick={carryPreviousYearBalance} className={`rounded-2xl bg-white px-4 py-2 text-sm font-bold disabled:opacity-50 ${buttonShadow}`}>
            由上一年度期末帶入歷屆累計餘絀
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SummaryBox label="本年度累積收入" value={yearIncome} />
          <SummaryBox label="本年度累積支出" value={yearExpense} />
          <SummaryBox label="本年度累積結餘" value={finalYearBalance} />
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            checked={allowAdjustment}
            disabled={isClosed}
            onChange={(event) => setAllowAdjustment(event.target.checked)}
          />
          允許人工調整本年度累積結餘
        </label>
        {allowAdjustment ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
            <Input
              label="人工調整金額"
              type="number"
              value={manualAdjustment}
              onChange={setManualAdjustment}
              disabled={isClosed}
            />
            <Input
              label="調整原因"
              value={adjustmentReason}
              onChange={setAdjustmentReason}
              disabled={isClosed}
            />
          </div>
        ) : null}
      </section>

      <section id="accounting-balance-sheet-v2" className="rounded-3xl bg-white p-5 text-black">
        <div className="text-center">
          <p className="text-lg font-bold">高雄晨光扶輪社</p>
          <h2 className="mt-1 text-2xl font-bold">資產負債表</h2>
          <p className="mt-1 text-sm">統計日期：{formatDate(reportDate)}</p>
        </div>
        <BalanceStatus difference={balanceDifference} />
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <BalanceColumn
            title="資產"
            categories={assetCategories}
            values={values}
            finalYearBalance={finalYearBalance}
            disabled={isClosed}
            onChange={updateValue}
            total={assetTotal}
          />
          <BalanceColumn
            title="負債及基金"
            categories={liabilityFundCategories}
            values={values}
            finalYearBalance={finalYearBalance}
            disabled={isClosed}
            onChange={updateValue}
            total={liabilityFundTotal}
          />
        </div>
        <p className="mt-5 text-center font-bold">
          平衡差額：<span className={balanceDifference === 0 ? "text-green-700" : "text-[#F47C6C]"}>{formatCurrency(balanceDifference)}</span>
        </p>
      </section>

      <section className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)] print:hidden">
        <h2 className="text-xl font-bold">資產負債科目管理</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          <label>
            <span className="text-sm font-bold">類型</span>
            <select
              value={categoryForm.itemType}
              onChange={(event) => {
                const itemType = event.target.value as BalanceItemType;
                setCategoryForm((current) => ({
                  ...current,
                  itemType,
                  groupName: groupOptions[itemType][0],
                }));
              }}
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-3 py-3"
            >
              <option value="asset">資產</option>
              <option value="liability">負債</option>
              <option value="fund">基金／累積結餘</option>
            </select>
          </label>
          <label>
            <span className="text-sm font-bold">大項</span>
            <select
              value={categoryForm.groupName}
              onChange={(event) => setCategoryForm((current) => ({ ...current, groupName: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-3 py-3"
            >
              {groupOptions[categoryForm.itemType].map((group) => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          </label>
          <Input label="科目名稱" value={categoryForm.name} onChange={(value) => setCategoryForm((current) => ({ ...current, name: value }))} />
          <Input label="排序" type="number" value={String(categoryForm.sortOrder)} onChange={(value) => setCategoryForm((current) => ({ ...current, sortOrder: Number(value) || 0 }))} />
          <div className="flex items-end">
            <button type="button" onClick={saveCategory} className={`w-full rounded-2xl bg-[#F7C948] px-4 py-3 font-bold ${buttonShadow}`}>
              {editingCategoryId ? "儲存科目" : "新增科目"}
            </button>
          </div>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm font-bold">
          <input
            type="checkbox"
            checked={categoryForm.isActive}
            onChange={(event) => setCategoryForm((current) => ({ ...current, isActive: event.target.checked }))}
          />
          啟用
        </label>
        <div className="mt-5 space-y-2">
          {categories.map((category) => (
            <article key={category.id} className="grid gap-2 rounded-2xl bg-[#F8F3E8] p-3 text-sm font-bold sm:grid-cols-[1fr_auto]">
              <div>
                <p>{typeLabel(category.itemType)}｜{category.groupName} / {category.name}</p>
                <p className="text-[#173B73]/65">排序 {category.sortOrder}｜{category.isSystem ? "系統科目" : "自訂科目"}｜{category.isActive ? "啟用" : "停用"}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => startEditCategory(category)} className={`rounded-2xl bg-white px-3 py-2 ${buttonShadow}`}>編輯</button>
                <button type="button" onClick={() => deleteCategory(category)} className={`rounded-2xl bg-white px-3 py-2 ${buttonShadow}`}>刪除/停用</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function BalanceColumn({
  title,
  categories,
  values,
  finalYearBalance,
  disabled,
  onChange,
  total,
}: {
  title: string;
  categories: BalanceCategory[];
  values: Record<string, string>;
  finalYearBalance: number;
  disabled: boolean;
  onChange: (categoryId: string, value: string) => void;
  total: number;
}) {
  const groups = Array.from(new Set(categories.map((category) => category.groupName)));
  return (
    <section className="rounded-2xl border border-black/20 p-4">
      <h3 className="text-lg font-bold">{title}</h3>
      <div className="mt-3 space-y-4">
        {groups.map((groupName) => {
          const groupCategories = categories.filter((category) => category.groupName === groupName);
          const groupTotal = sumCategoryValues(groupCategories, values, finalYearBalance);
          return (
            <div key={groupName}>
              <p className="font-bold">{groupName}</p>
              <div className="mt-2 space-y-2">
                {groupCategories.map((category) => {
                  const isYearBalance = isSystemYearBalance(category);
                  const amount = isYearBalance ? finalYearBalance : toNumber(values[category.id]);
                  return (
                    <label key={category.id} className="grid grid-cols-[1fr_150px] items-center gap-3 text-sm">
                      <span className="min-w-0 break-words">{category.name}</span>
                      {isYearBalance ? (
                        <span className="text-right font-bold">{formatCurrency(amount)}</span>
                      ) : (
                        <input
                          type="number"
                          value={values[category.id] ?? "0"}
                          disabled={disabled}
                          onChange={(event) => onChange(category.id, event.target.value)}
                          className="w-full rounded-xl border border-[#E5D9BD] px-3 py-2 text-right disabled:bg-[#F8F3E8]"
                        />
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 flex justify-between border-t pt-2 font-bold">
                <span>{groupName}小計</span>
                <span>{formatCurrency(groupTotal)}</span>
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-4 flex justify-between border-t-2 border-black pt-3 text-lg font-bold">
        <span>{title}合計</span>
        <span>{formatCurrency(total)}</span>
      </p>
    </section>
  );
}

function BalanceStatus({ difference }: { difference: number }) {
  if (difference === 0) {
    return <p className="mt-4 rounded-2xl bg-green-50 p-3 text-center font-bold text-green-700">資產負債已平衡</p>;
  }

  return (
    <p className="mt-4 rounded-2xl bg-[#FFF1EE] p-3 text-center font-bold text-[#F47C6C]">
      資產負債尚未平衡，差額 {formatCurrency(difference)}
    </p>
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

function Notice({ tone, children }: { tone: "success" | "error" | "warning"; children: React.ReactNode }) {
  const className =
    tone === "success"
      ? "border-green-200 bg-green-50 text-green-700"
      : tone === "warning"
        ? "border-yellow-200 bg-yellow-50 text-[#173B73]"
        : "border-red-200 bg-red-50 text-red-700";
  return <p className={`rounded-2xl border p-4 text-sm font-bold print:hidden ${className}`}>{children}</p>;
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 disabled:bg-[#F8F3E8]"
      />
    </label>
  );
}

function sumEntries(entries: AccountingEntryLike[], type: EntryType) {
  return entries
    .filter((entry) => entry.entryType === type)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function sumCategoryValues(categories: BalanceCategory[], values: Record<string, string>, finalYearBalance: number) {
  return categories.reduce(
    (sum, category) => sum + (isSystemYearBalance(category) ? finalYearBalance : toNumber(values[category.id])),
    0
  );
}

function isSystemYearBalance(category: BalanceCategory | undefined) {
  return category?.name === "本年度累積結餘";
}

function findAmount(categories: BalanceCategory[], values: BalanceValue[], name: string) {
  const category = categories.find((item) => item.name === name);
  if (!category) return 0;
  return values.find((value) => value.categoryId === category.id)?.amount ?? 0;
}

function typeLabel(type: BalanceItemType) {
  if (type === "asset") return "資產";
  if (type === "liability") return "負債";
  return "基金／累積結餘";
}

function mapCategory(row: Record<string, unknown>): BalanceCategory {
  return {
    id: text(row.id),
    rotaryYearId: text(row.rotary_year_id),
    itemType: normalizeItemType(text(row.item_type)),
    groupName: text(row.group_name),
    name: text(row.name),
    sortOrder: number(row.sort_order),
    isSystem: row.is_system === true,
    isActive: row.is_active !== false,
  };
}

function mapSnapshot(row: Record<string, unknown>): BalanceSnapshot {
  return {
    id: text(row.id),
    rotaryYearId: text(row.rotary_year_id),
    reportMonth: text(row.report_month),
    reportDate: text(row.report_date),
    status: text(row.status) === "closed" ? "closed" : "draft",
    imbalanceReason: text(row.imbalance_reason),
  };
}

function mapValue(row: Record<string, unknown>): BalanceValue {
  return {
    id: text(row.id),
    snapshotId: text(row.snapshot_id),
    categoryId: text(row.category_id),
    amount: number(row.amount),
    systemCalculatedAmount: row.system_calculated_amount === null ? null : number(row.system_calculated_amount),
    manualAdjustment: number(row.manual_adjustment),
    adjustmentReason: text(row.adjustment_reason),
  };
}

function normalizeItemType(value: string): BalanceItemType {
  if (value === "liability" || value === "fund") return value;
  return "asset";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  if (!value) return "-";
  return value.replaceAll("-", "/");
}

function toNumber(value: unknown) {
  return Number(value) || 0;
}

function text(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function number(value: unknown) {
  return Number(value) || 0;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? `${fallback}：${error.message}` : fallback;
}
