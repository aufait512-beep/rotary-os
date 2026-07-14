
"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { MeetingAttendance } from "@/lib/attendance";
import {
  DuesLineItem,
  DuesRecord,
  emptyDuesRecord,
  getDisplayDuesBalance,
  getDuesPaymentStatus,
  PaymentMethod,
  sortDuesRecords,
} from "@/lib/dues";
import { EventItem } from "@/lib/events";
import { formatMemberName, Member, sortMembersByName } from "@/lib/members";
import {
  deleteDuesRecord,
  fetchDuesRecords,
  fetchEvents,
  fetchMeetingAttendance,
  fetchMembers,
  insertDuesLineItems,
  upsertDuesRecord,
} from "@/lib/supabaseData";

type DuesFormState = Omit<DuesRecord, "id" | "createdAt">;
type NumericDuesField = "previousBalance" | "paidAmount";

type MealImportRow = {
  key: string;
  member: Member;
  eventItem: EventItem;
  attendance: MeetingAttendance;
  duesRecord?: DuesRecord;
  alreadyImported: boolean;
};

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

const paymentMethods: PaymentMethod[] = ["轉帳", "信用卡扣", "現金"];

export default function DuesPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [records, setRecords] = useState<DuesRecord[]>([]);
  const [form, setForm] = useState<DuesFormState>(emptyDuesRecord);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLineItemsOpen, setIsLineItemsOpen] = useState(false);
  const [expandedRecordId, setExpandedRecordId] = useState("");
  const [previewRecordId, setPreviewRecordId] = useState("");
  const [exportingId, setExportingId] = useState("");
  const [mealMonth, setMealMonth] = useState(getCurrentMonth());
  const [mealRows, setMealRows] = useState<MealImportRow[]>([]);
  const [selectedMealKeys, setSelectedMealKeys] = useState<string[]>([]);
  const [editedMealAmounts, setEditedMealAmounts] = useState<Record<string, number>>({});
  const [mealImportMessage, setMealImportMessage] = useState("");
  const [isLoadingMeals, setIsLoadingMeals] = useState(false);
  const [isImportingMeals, setIsImportingMeals] = useState(false);

  const sortedMembers = useMemo(() => sortMembersByName(members), [members]);
  const filteredRecords = useMemo(() => {
    const sortedRecords = sortDuesRecords(records);
    if (!filterMonth) return sortedRecords;
    return sortedRecords.filter((record) => record.periodMonth === filterMonth);
  }, [records, filterMonth]);
  const totalUnpaid = useMemo(
    () => records.reduce((total, record) => total + getDisplayDuesBalance(record), 0),
    [records]
  );
  const currentDue = getCurrentDue(form);
  const currentBalance = Math.max(0, form.previousBalance + currentDue - form.paidAmount);

  async function loadData() {
    try {
      setErrorMessage("");
      const [loadedMembers, loadedRecords] = await Promise.all([
        fetchMembers(),
        fetchDuesRecords(),
      ]);
      setMembers(loadedMembers);
      setRecords(loadedRecords);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "社費資料讀取失敗"));
    }
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  function updateNumericField(field: NumericDuesField, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: Number(value) || 0,
    }));
  }

  function resetForm() {
    setForm(emptyDuesRecord);
    setEditingId(null);
    setIsLineItemsOpen(false);
    setIsFormOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    try {
      if (editingId) {
        const currentRecord = records.find((record) => record.id === editingId);
        const savedRecord = await upsertDuesRecord({
          ...form,
          currentDue,
          id: editingId,
          createdAt: currentRecord?.createdAt ?? new Date().toISOString(),
        });
        setRecords((currentRecords) =>
          currentRecords.map((record) => (record.id === editingId ? savedRecord : record))
        );
      } else {
        const savedRecord = await upsertDuesRecord({
          ...form,
          currentDue,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        });
        setRecords((currentRecords) => [savedRecord, ...currentRecords]);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "社費紀錄儲存失敗"));
      return;
    }

    resetForm();
  }

  function handleEdit(record: DuesRecord) {
    setForm({
      memberId: record.memberId,
      periodMonth: record.periodMonth,
      previousBalance: record.previousBalance,
      currentDue: record.currentDue,
      paidAmount: record.paidAmount,
      discountAmount: record.discountAmount,
      paymentDate: record.paymentDate,
      paymentMethod: record.paymentMethod,
      note: record.note,
      lineItems: record.lineItems,
    });
    setEditingId(record.id);
    setIsFormOpen(true);
    setExpandedRecordId(record.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(recordId: string) {
    const confirmed = window.confirm("確定要刪除這筆社費紀錄嗎？");
    if (!confirmed) return;

    try {
      setErrorMessage("");
      await deleteDuesRecord(recordId);
      setRecords((currentRecords) =>
        currentRecords.filter((record) => record.id !== recordId)
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "社費紀錄刪除失敗"));
      return;
    }

    if (editingId === recordId) resetForm();
    if (expandedRecordId === recordId) setExpandedRecordId("");
    if (previewRecordId === recordId) setPreviewRecordId("");
  }
  function exportCsv() {
    const headers = [
      "社友",
      "月份",
      "前期未繳",
      "本期社費",
      "已繳費用",
      "本期應繳",
      "付款狀態",
      "繳費日期",
      "繳費方式",
      "備註",
      "建立時間",
    ];
    const rows = filteredRecords.map((record) => [
      getMemberName(record.memberId, sortedMembers),
      record.periodMonth,
      String(record.previousBalance),
      String(record.currentDue),
      String(record.paidAmount),
      String(getDisplayDuesBalance(record)),
      getDuesPaymentStatus(record),
      record.paymentDate,
      record.paymentMethod,
      record.note,
      record.createdAt,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filterMonth
      ? `高雄晨光扶輪社_社費紀錄_${filterMonth}.csv`
      : "高雄晨光扶輪社_社費紀錄.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportStatementJpg(record: DuesRecord) {
    const statement = document.getElementById(`dues-statement-${record.id}`);
    if (!statement) {
      setErrorMessage("找不到社費通知單，請先展開該筆紀錄。");
      return;
    }

    const exportElement = createExportElement(statement);

    try {
      setErrorMessage("");
      setExportingId(record.id);
      const html2canvasModule = await import("html2canvas");
      const html2canvas = html2canvasModule.default;
      const canvas = await html2canvas(exportElement, {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.download = buildStatementFilename(record, sortedMembers, "jpg");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "JPG 匯出失敗"));
    } finally {
      exportElement.remove();
      setExportingId("");
    }
  }

  async function loadMonthlyMealRows() {
    if (!mealMonth) {
      setErrorMessage("請先選擇月份。");
      return;
    }

    try {
      setErrorMessage("");
      setMealImportMessage("");
      setIsLoadingMeals(true);
      const [
        loadedMembers,
        loadedEvents,
        loadedAttendance,
        loadedRecords,
      ] = await Promise.all([
        fetchMembers(),
        fetchEvents(),
        fetchMeetingAttendance(),
        fetchDuesRecords(),
      ]);
      setMembers(loadedMembers);
      setRecords(loadedRecords);

      const rows = buildMealImportRows({
        month: mealMonth,
        members: loadedMembers,
        events: loadedEvents,
        attendanceRecords: loadedAttendance,
        duesRecords: loadedRecords,
      });
      setMealRows(rows);
      setSelectedMealKeys(
        rows
          .filter((row) => row.duesRecord && !row.alreadyImported)
          .map((row) => row.key)
      );
      setEditedMealAmounts(
        Object.fromEntries(rows.map((row) => [row.key, row.attendance.mealAmount]))
      );
      setMealImportMessage(`已載入 ${rows.length} 筆本月例會餐費資料。`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "本月餐費資料讀取失敗"));
    } finally {
      setIsLoadingMeals(false);
    }
  }

  async function importMonthlyMealRows() {
    const rowsToImport = mealRows.filter((row) => selectedMealKeys.includes(row.key));
    if (rowsToImport.length === 0) {
      setMealImportMessage("尚未勾選可帶入的餐費資料。");
      return;
    }

    const lineItems: DuesLineItem[] = [];
    let skipped = 0;

    rowsToImport.forEach((row) => {
      if (!row.duesRecord || row.alreadyImported) {
        skipped += 1;
        return;
      }

      const amount = Math.max(0, editedMealAmounts[row.key] ?? row.attendance.mealAmount);
      const note = buildMealLineItemNote(row.eventItem);
      const duplicate = row.duesRecord.lineItems.some(
        (item) =>
          item.itemType === "meal" &&
          item.serviceDate === row.eventItem.date &&
          item.note === note
      );

      if (duplicate) {
        skipped += 1;
        return;
      }

      lineItems.push({
        id: crypto.randomUUID(),
        duesRecordId: row.duesRecord.id,
        itemType: "meal",
        itemName: "例會餐費",
        serviceDate: row.eventItem.date,
        quantity: 1,
        unitAmount: amount,
        amount,
        note,
        createdAt: new Date().toISOString(),
      });
    });

    if (lineItems.length === 0) {
      setMealImportMessage(`沒有可帶入的餐費資料，已略過 ${skipped} 筆。`);
      return;
    }

    const confirmed = window.confirm(
      `確定要帶入 ${lineItems.length} 筆本月例會餐費到社費明細嗎？`
    );
    if (!confirmed) return;

    try {
      setErrorMessage("");
      setIsImportingMeals(true);
      await insertDuesLineItems(lineItems);
      await loadData();
      setMealImportMessage(
        `餐費帶入完成：新增 ${lineItems.length} 筆，略過 ${skipped} 筆。`
      );
      await loadMonthlyMealRows();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "本月餐費帶入失敗"));
    } finally {
      setIsImportingMeals(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <section className="mx-auto max-w-md space-y-6">
        <header className="space-y-3">
          <Link href="/" className="text-sm font-bold text-[#173B73]/75">
            回首頁
          </Link>
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-[#C99700]">
              Rotary OS
            </p>
            <h1 className="mt-2 text-3xl font-bold">社費管理</h1>
          </div>
        </header>

        {errorMessage ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => setIsFormOpen((currentValue) => !currentValue)}
          className={`w-full rounded-2xl bg-[#F7C948] py-4 font-bold ${buttonShadow}`}
        >
          {isFormOpen ? "收合新增社費紀錄" : "新增社費紀錄"}
        </button>

        {isFormOpen ? (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">
                {editingId ? "編輯社費紀錄" : "新增社費紀錄"}
              </h2>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  className={`rounded-2xl bg-white px-4 py-2 text-sm font-bold ${buttonShadow}`}
                >
                  取消
                </button>
              ) : null}
            </div>

            <label className="block">
              <span className="text-sm font-bold">選擇社友</span>
              <select
                required
                value={form.memberId}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    memberId: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              >
                <option value="">請選擇社友</option>
                {sortedMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {formatMemberName(member)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-bold">計費月份</span>
              <input
                required
                type="month"
                value={form.periodMonth}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    periodMonth: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              />
            </label>

            {(
              [
                ["previousBalance", "前期未繳"],
                ["paidAmount", "已繳費用"],
              ] as [NumericDuesField, string][]
            ).map(([field, label]) => (
              <label key={field} className="block">
                <span className="text-sm font-bold">{label}</span>
                <input
                  type="number"
                  value={form[field]}
                  onChange={(event) => updateNumericField(field, event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                />
              </label>
            ))}

            <section className="rounded-2xl bg-[#F8F3E8] p-4">
              <button
                type="button"
                onClick={() => setIsLineItemsOpen((currentValue) => !currentValue)}
                className="w-full text-left font-bold"
              >
                {isLineItemsOpen ? "收合本期社費明細" : "展開本期社費明細"}：
                {formatCurrency(currentDue)}
              </button>

              {isLineItemsOpen ? (
                <DuesLineItemsEditor
                  items={form.lineItems}
                  onChange={(lineItems) =>
                    setForm((currentForm) => ({ ...currentForm, lineItems }))
                  }
                />
              ) : null}
            </section>

            <div className="rounded-2xl bg-[#F8F3E8] p-4 font-bold">
              本期應繳：{formatCurrency(currentBalance)}
            </div>

            <label className="block">
              <span className="text-sm font-bold">繳費日期</span>
              <input
                type="date"
                value={form.paymentDate}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    paymentDate: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold">繳費方式</span>
              <select
                value={form.paymentMethod}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    paymentMethod: event.target.value as PaymentMethod,
                  }))
                }
                className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              >
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-bold">備註</span>
              <textarea
                rows={4}
                value={form.note}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    note: event.target.value,
                  }))
                }
                className="mt-2 w-full resize-none rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              />
            </label>

            <button
              type="submit"
              className={`w-full rounded-2xl bg-[#F7C948] py-4 font-bold ${buttonShadow}`}
            >
              {editingId ? "儲存修改" : "新增紀錄"}
            </button>
          </form>
        ) : null}
        <section className="grid grid-cols-1 gap-3">
          <div className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
            <p className="text-sm font-bold text-[#C99700]">未繳總額</p>
            <p className="mt-1 text-3xl font-bold">{formatCurrency(totalUnpaid)}</p>
          </div>
        </section>

        <section className="space-y-4 rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
          <div>
            <p className="text-sm font-bold text-[#C99700]">例會餐費串接</p>
            <h2 className="mt-1 text-2xl font-bold">本月餐費帶入社費</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="text-sm font-bold">選擇月份</span>
              <input
                type="month"
                value={mealMonth}
                onChange={(event) => setMealMonth(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              />
            </label>
            <button
              type="button"
              onClick={() => void loadMonthlyMealRows()}
              disabled={isLoadingMeals}
              className={`self-end rounded-2xl bg-[#F7C948] px-5 py-3 font-bold disabled:opacity-60 ${buttonShadow}`}
            >
              {isLoadingMeals ? "讀取中" : "產生本月餐費預覽"}
            </button>
          </div>

          {mealImportMessage ? (
            <p className="rounded-2xl bg-[#F8F3E8] p-3 text-sm font-bold">
              {mealImportMessage}
            </p>
          ) : null}

          {mealRows.length > 0 ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-center text-sm font-bold">
                <div className="rounded-2xl bg-[#F8F3E8] p-3">
                  <p className="text-[#173B73]/70">可帶入筆數</p>
                  <p className="mt-1 text-xl">{selectedMealKeys.length}</p>
                </div>
                <div className="rounded-2xl bg-[#F8F3E8] p-3">
                  <p className="text-[#173B73]/70">預計帶入總額</p>
                  <p className="mt-1 text-xl">
                    {formatCurrency(
                      mealRows
                        .filter((row) => selectedMealKeys.includes(row.key))
                        .reduce(
                          (total, row) =>
                            total +
                            Math.max(0, editedMealAmounts[row.key] ?? row.attendance.mealAmount),
                          0
                        )
                    )}
                  </p>
                </div>
              </div>

              {mealRows.map((row) => {
                const selected = selectedMealKeys.includes(row.key);
                const disabled = !row.duesRecord || row.alreadyImported;

                return (
                  <article key={row.key} className="rounded-3xl border border-[#E5D9BD] bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <label className="flex min-w-0 items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={disabled}
                          onChange={(event) =>
                            setSelectedMealKeys((currentKeys) =>
                              event.target.checked
                                ? [...currentKeys, row.key]
                                : currentKeys.filter((key) => key !== row.key)
                            )
                          }
                          className="mt-1 h-5 w-5"
                        />
                        <span className="min-w-0">
                          <span className="block break-words text-base font-bold">
                            {formatMemberName(row.member)}
                          </span>
                          <span className="mt-1 block break-words text-sm font-semibold text-[#173B73]/75">
                            {formatDate(row.eventItem.date)}｜第{row.eventItem.meetingNo || "-"}次例會｜{row.eventItem.title || "例會"}
                          </span>
                        </span>
                      </label>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                          row.alreadyImported
                            ? "bg-[#173B73] text-white"
                            : row.duesRecord
                              ? "bg-[#F7C948] text-[#173B73]"
                              : "bg-[#F47C6C] text-white"
                        }`}
                      >
                        {row.alreadyImported
                          ? "已帶入"
                          : row.duesRecord
                            ? "可帶入"
                            : "尚無社費紀錄"}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-sm font-bold">該場餐費</span>
                        <input
                          type="number"
                          min={0}
                          value={editedMealAmounts[row.key] ?? row.attendance.mealAmount}
                          onChange={(event) =>
                            setEditedMealAmounts((currentAmounts) => ({
                              ...currentAmounts,
                              [row.key]: Number(event.target.value) || 0,
                            }))
                          }
                          disabled={disabled}
                          className="mt-2 w-full rounded-2xl border border-[#E5D9BD] px-3 py-3 disabled:bg-[#F8F3E8]"
                        />
                      </label>
                      <div className="rounded-2xl bg-[#F8F3E8] p-3 text-sm font-bold">
                        <p>用餐：{row.attendance.actualMeal ? "是" : "否"}</p>
                        <p>帶入社費：{row.attendance.includeInDues ? "是" : "否"}</p>
                        {!row.duesRecord ? (
                          <p className="mt-1 text-[#F47C6C]">
                            該社友尚未建立此月份社費紀錄
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}

              <button
                type="button"
                onClick={() => void importMonthlyMealRows()}
                disabled={isImportingMeals}
                className={`w-full rounded-2xl bg-[#173B73] py-4 font-bold text-white disabled:opacity-60 ${buttonShadow}`}
              >
                {isImportingMeals ? "帶入中" : "帶入本月社費"}
              </button>
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-bold">社費紀錄</h2>
            <button
              type="button"
              onClick={exportCsv}
              className={`rounded-2xl bg-[#F7C948] px-4 py-2 text-sm font-bold ${buttonShadow}`}
            >
              匯出 CSV
            </button>
          </div>

          <label className="block">
            <span className="text-sm font-bold">依月份篩選</span>
            <input
              type="month"
              value={filterMonth}
              onChange={(event) => setFilterMonth(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
            />
          </label>

          {filteredRecords.length === 0 ? (
            <div className="rounded-3xl bg-white/75 p-5 text-center font-semibold text-[#173B73]/70 shadow-[6px_6px_16px_rgba(0,0,0,0.1),-6px_-6px_16px_rgba(255,255,255,0.8)]">
              目前沒有社費紀錄
            </div>
          ) : (
            filteredRecords.map((record) => {
              const isExpanded = expandedRecordId === record.id;
              const isPreviewOpen = previewRecordId === record.id;
              const member = sortedMembers.find((memberItem) => memberItem.id === record.memberId);
              const memberName = member
                ? formatMemberName(member)
                : getMemberName(record.memberId, sortedMembers);
              const status = getDuesPaymentStatus(record);

              return (
                <article
                  key={record.id}
                  className="min-w-0 rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedRecordId((currentId) =>
                        currentId === record.id ? "" : record.id
                      )
                    }
                    className="w-full text-left"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#C99700]">
                          {record.periodMonth || "未填月份"}
                        </p>
                        <h3 className="mt-1 break-words text-xl font-bold">
                          {memberName}
                        </h3>
                        <p className="mt-1 text-sm font-semibold">
                          本期應繳：{formatCurrency(getDisplayDuesBalance(record))}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold text-white ${
                          status === "未匯款" ? "bg-[#F47C6C]" : "bg-[#173B73]"
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="mt-4 space-y-4 border-t border-[#E5D9BD] pt-4 text-sm font-semibold text-[#173B73]/80">
                      <div className="space-y-2">
                        <p>前期未繳：{formatCurrency(record.previousBalance)}</p>
                        <p>本期社費：{formatCurrency(record.currentDue)}</p>
                        <p>已繳費用：{formatCurrency(record.paidAmount)}</p>
                        <p>本期應繳：{formatCurrency(getDisplayDuesBalance(record))}</p>
                        <p>繳費方式：{record.paymentMethod}</p>
                        <p>繳費日期：{record.paymentDate || "-"}</p>
                        <details>
                          <summary className="cursor-pointer font-bold">
                            本期社費明細：{formatCurrency(record.currentDue)}
                          </summary>
                          <div className="mt-2 space-y-1">
                            {getStatementLineItems(record).map((item) => (
                              <p key={item.id}>
                                {item.label}
                                {item.description ? ` ${item.description}` : ""}：
                                {formatCurrency(item.amount)}
                              </p>
                            ))}
                          </div>
                        </details>
                        {record.note ? <p>備註：{record.note}</p> : null}
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewRecordId((currentId) =>
                              currentId === record.id ? "" : record.id
                            )
                          }
                          className={`rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}
                        >
                          預覽通知單
                        </button>
                        <button
                          type="button"
                          onClick={() => void exportStatementJpg(record)}
                          disabled={exportingId === record.id}
                          className={`rounded-2xl bg-white py-3 font-bold disabled:opacity-60 ${buttonShadow}`}
                        >
                          🖼️ 匯出 JPG
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(record)}
                          className={`rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(record.id)}
                          className={`rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}
                        >
                          刪除
                        </button>
                      </div>

                      <div
                        className={
                          isPreviewOpen
                            ? "overflow-x-auto rounded-2xl border border-[#E5D9BD] bg-[#F8F3E8] p-3"
                            : "fixed -left-[10000px] top-0"
                        }
                      >
                        <DuesStatement record={record} memberName={memberName} />
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </section>
      </section>
    </main>
  );
}
function DuesStatement({
  record,
  memberName,
}: {
  record: DuesRecord;
  memberName: string;
}) {
  const lineItems = getStatementLineItems(record);

  return (
    <section
      id={`dues-statement-${record.id}`}
      className="box-border min-h-[297mm] w-[210mm] bg-white p-[18mm] text-black"
      style={{
        fontFamily: '"Noto Sans TC", "Microsoft JhengHei", Arial, sans-serif',
      }}
    >
      <div className="border-b-2 border-black pb-5 text-center">
        <p className="text-[20pt] font-bold">高雄晨光扶輪社</p>
        <h2 className="mt-2 text-[26pt] font-bold">社費繳費通知</h2>
        <p className="mt-2 text-[15pt]">{formatStatementMonth(record.periodMonth)}社費繳費通知</p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-x-8 gap-y-3 text-[13pt]">
        <StatementField label="社友姓名／社名" value={memberName || "未指定社友"} />
        <StatementField label="計費月份" value={formatStatementMonth(record.periodMonth)} />
        <StatementField label="前期未繳" value={formatCurrency(record.previousBalance)} />
        <StatementField label="本期社費總計" value={formatCurrency(record.currentDue)} />
        <StatementField label="已繳費用" value={formatCurrency(record.paidAmount)} />
        <StatementField label="本期應繳" value={formatCurrency(getDisplayDuesBalance(record))} />
        <StatementField label="繳費方式" value={record.paymentMethod || "-"} />
        <StatementField label="繳費日期" value={record.paymentDate || "-"} />
      </div>

      <div className="mt-8">
        <h3 className="mb-3 text-[16pt] font-bold">本期社費明細</h3>
        <table className="w-full border-collapse text-[12pt]">
          <thead>
            <tr>
              <th className="border border-black px-3 py-2 text-left">項目</th>
              <th className="border border-black px-3 py-2 text-left">說明</th>
              <th className="border border-black px-3 py-2 text-right">金額</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item) => (
              <tr key={item.id}>
                <td className="border border-black px-3 py-2">{item.label}</td>
                <td className="border border-black px-3 py-2">{item.description || "-"}</td>
                <td className="border border-black px-3 py-2 text-right">
                  {formatCurrency(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 text-[13pt]">
        <p className="font-bold">備註</p>
        <p className="mt-2 min-h-16 whitespace-pre-wrap border border-black p-3">
          {record.note || "-"}
        </p>
      </div>

      <div className="mt-8 text-right text-[11pt]">
        產出日期：{formatTaiwanDate(new Date())}
      </div>
    </section>
  );
}

function StatementField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10pt] text-black/65">{label}</p>
      <p className="mt-1 border-b border-black pb-1 font-bold">{value}</p>
    </div>
  );
}

function getMemberName(memberId: string, members: Member[]) {
  const member = members.find((memberItem) => memberItem.id === memberId);
  return member ? formatMemberName(member) || "未知社友" : "未知社友";
}

function DuesLineItemsEditor({
  items,
  onChange,
}: {
  items: DuesLineItem[];
  onChange: (items: DuesLineItem[]) => void;
}) {
  function addItem(item: Partial<DuesLineItem>) {
    onChange([
      ...items,
      {
        id: crypto.randomUUID(),
        duesRecordId: "",
        itemType: "meal",
        itemName: "",
        serviceDate: "",
        quantity: 1,
        unitAmount: 0,
        amount: 0,
        note: "",
        createdAt: new Date().toISOString(),
        ...item,
      },
    ]);
  }

  function updateItem(itemId: string, patch: Partial<DuesLineItem>) {
    onChange(
      items.map((item) => {
        if (item.id !== itemId) return item;
        const nextItem = { ...item, ...patch };
        if ("quantity" in patch || "unitAmount" in patch) {
          nextItem.amount = nextItem.quantity * nextItem.unitAmount;
        }
        return nextItem;
      })
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <SmallAction onClick={() => addItem({ itemType: "meal", itemName: "餐費" })}>餐費</SmallAction>
        <SmallAction onClick={() => addItem({ itemType: "annual_fee", itemName: "常年費", unitAmount: 1000, amount: 1000 })}>常年費</SmallAction>
        <SmallAction onClick={() => addItem({ itemType: "special_donation", itemName: "特別捐" })}>特別捐</SmallAction>
        <SmallAction onClick={() => addItem({ itemType: "red_box", itemName: "紅箱" })}>紅箱</SmallAction>
        <SmallAction onClick={() => addItem({ itemType: "rotary_foundation", itemName: "扶輪基金（代收）", unitAmount: 270, amount: 270 })}>扶輪基金</SmallAction>
        <SmallAction onClick={() => addItem({ itemType: "pass_through", itemName: "代收付" })}>代收付</SmallAction>
      </div>

      {items.length === 0 ? (
        <p className="text-sm font-semibold text-[#173B73]/70">
          尚未新增明細；若為舊資料，通知單會顯示舊資料總額。
        </p>
      ) : (
        items.map((item) => (
          <div key={item.id} className="space-y-2 rounded-2xl bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold">{formatLineItemType(item.itemType)}</p>
              <button type="button" onClick={() => onChange(items.filter((lineItem) => lineItem.id !== item.id))} className="text-sm font-bold text-red-600">刪除</button>
            </div>
            {item.itemType === "annual_fee" ? (
              <select value={item.amount} onChange={(event) => updateItem(item.id, { unitAmount: Number(event.target.value), amount: Number(event.target.value) })} className="w-full rounded-2xl border border-[#E5D9BD] px-3 py-2">
                <option value={1000}>NT$1,000</option>
                <option value={2000}>NT$2,000</option>
              </select>
            ) : (
              <>
                {item.itemType === "meal" || item.itemType === "red_box" ? (
                  <input type="date" value={item.serviceDate} onChange={(event) => updateItem(item.id, { serviceDate: event.target.value })} className="w-full rounded-2xl border border-[#E5D9BD] px-3 py-2" />
                ) : null}
                {item.itemType === "pass_through" || item.itemType === "special_donation" ? (
                  <input value={item.itemName} onChange={(event) => updateItem(item.id, { itemName: event.target.value })} placeholder="項目名稱 / 說明" className="w-full rounded-2xl border border-[#E5D9BD] px-3 py-2" />
                ) : null}
                <input type="number" value={item.amount} onChange={(event) => updateItem(item.id, { unitAmount: Number(event.target.value) || 0, amount: Number(event.target.value) || 0 })} className="w-full rounded-2xl border border-[#E5D9BD] px-3 py-2" />
              </>
            )}
            <textarea value={item.note} onChange={(event) => updateItem(item.id, { note: event.target.value })} placeholder="備註" className="w-full resize-none rounded-2xl border border-[#E5D9BD] px-3 py-2" />
          </div>
        ))
      )}
    </div>
  );
}
function SmallAction({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-2xl bg-white px-3 py-2 text-sm font-bold ${buttonShadow}`}>
      {children}
    </button>
  );
}

function buildMealImportRows({
  month,
  members,
  events,
  attendanceRecords,
  duesRecords,
}: {
  month: string;
  members: Member[];
  events: EventItem[];
  attendanceRecords: MeetingAttendance[];
  duesRecords: DuesRecord[];
}): MealImportRow[] {
  const eventMap = new Map(events.map((eventItem) => [eventItem.id, eventItem]));
  const memberMap = new Map(members.map((member) => [member.id, member]));
  const rows: MealImportRow[] = [];

  attendanceRecords.forEach((attendance) => {
    const eventItem = eventMap.get(attendance.eventId);
    const member = memberMap.get(attendance.memberId);
    if (
      !eventItem ||
      !member ||
      !attendance.actualMeal ||
      !attendance.includeInDues ||
      !eventItem.date.startsWith(month)
    ) {
      return;
    }

    const duesRecord = duesRecords.find(
      (record) =>
        record.memberId === attendance.memberId && record.periodMonth === month
    );
    const note = buildMealLineItemNote(eventItem);
    const alreadyImported =
      duesRecord?.lineItems.some(
        (item) =>
          item.itemType === "meal" &&
          item.serviceDate === eventItem.date &&
          item.note === note
      ) ?? false;

    rows.push({
      key: `${attendance.eventId}-${attendance.memberId}`,
      member,
      eventItem,
      attendance,
      duesRecord,
      alreadyImported,
    });
  });

  return rows.sort((firstRow, secondRow) =>
      `${firstRow.eventItem.date}-${formatMemberName(firstRow.member)}`.localeCompare(
        `${secondRow.eventItem.date}-${formatMemberName(secondRow.member)}`,
        "zh-Hant"
      )
    );
}

function buildMealLineItemNote(eventItem: EventItem) {
  return `第${eventItem.meetingNo || "-"}次例會／${eventItem.title || "例會"}`;
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentDue(record: Pick<DuesRecord, "currentDue" | "lineItems">) {
  if (record.lineItems.length === 0) return record.currentDue;
  return record.lineItems.reduce((total, item) => total + item.amount, 0);
}

function getStatementLineItems(record: DuesRecord) {
  if (record.lineItems.length === 0) {
    return [{ id: `${record.id}-legacy`, label: "舊資料總額", description: "", amount: record.currentDue }];
  }

  return record.lineItems.map((item) => {
    if (item.itemType === "rotary_foundation") {
      return { id: item.id, label: "扶輪基金（代收）", description: "固定 NT$270", amount: 270 };
    }

    return {
      id: item.id,
      label: formatLineItemType(item.itemType),
      description: formatLineItemDescription(item),
      amount: item.amount,
    };
  });
}

function formatLineItemDescription(item: DuesLineItem) {
  if (item.itemType === "meal" || item.itemType === "red_box") {
    return item.serviceDate ? `參加日期 ${item.serviceDate}` : "";
  }

  if (item.itemType === "special_donation" || item.itemType === "pass_through") {
    return [item.itemName, item.note].filter(Boolean).join(" / ");
  }

  return item.note || item.itemName || "";
}

function formatLineItemType(type: DuesLineItem["itemType"]) {
  const labels: Record<DuesLineItem["itemType"], string> = {
    meal: "餐費",
    annual_fee: "常年費",
    special_donation: "特別捐",
    red_box: "紅箱",
    rotary_foundation: "扶輪基金（代收）",
    pass_through: "代收付",
    legacy: "舊資料總額",
  };
  return labels[type];
}

function buildStatementFilename(record: DuesRecord, members: Member[], extension: "jpg") {
  const memberName = sanitizeFilename(getMemberName(record.memberId, members)).replaceAll("_", "");
  const periodMonth = sanitizeFilename(record.periodMonth || "未填月份");
  return `高雄晨光扶輪社_社費通知_${memberName}_${periodMonth}.${extension}`;
}

function createExportElement(source: HTMLElement) {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.style.position = "fixed";
  clone.style.left = "0";
  clone.style.top = "0";
  clone.style.zIndex = "-1";
  clone.style.width = "210mm";
  clone.style.minHeight = "297mm";
  clone.style.backgroundColor = "#ffffff";
  clone.style.color = "#000000";

  const elements = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];
  elements.forEach((element) => {
    element.style.color = "#000000";
    element.style.borderColor = "#000000";
    if (element.tagName === "SECTION" || element.tagName === "TABLE") {
      element.style.backgroundColor = "#ffffff";
    }
  });

  document.body.appendChild(clone);
  return clone;
}

function sanitizeFilename(value: string) {
  return value.trim().replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "");
}

function formatStatementMonth(periodMonth: string) {
  if (!periodMonth) return "未填月份";
  const [year, month] = periodMonth.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function formatDate(dateValue: string) {
  return dateValue ? dateValue.replaceAll("-", "/") : "未填日期";
}

function formatTaiwanDate(date: Date) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(value);
}

function escapeCsvValue(value: string) {
  const escapedValue = value.replaceAll('"', '""');
  return `"${escapedValue}"`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? `${fallback}：${error.message}` : fallback;
}
