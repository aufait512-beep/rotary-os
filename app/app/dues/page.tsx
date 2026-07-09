"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  calculateDuesBalance,
  DuesRecord,
  emptyDuesRecord,
  PaymentMethod,
  sortDuesRecords,
} from "@/lib/dues";
import {
  formatMemberName,
  Member,
  sortMembersByName,
} from "@/lib/members";
import {
  deleteDuesRecord,
  fetchDuesRecords,
  fetchMembers,
  upsertDuesRecord,
} from "@/lib/supabaseData";

type DuesFormState = Omit<DuesRecord, "id" | "createdAt">;
type NumericDuesField =
  | "previousBalance"
  | "currentDue"
  | "paidAmount"
  | "discountAmount";

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

const paymentMethods: PaymentMethod[] = ["未付款", "現金", "轉帳", "其他"];

export default function DuesPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [records, setRecords] = useState<DuesRecord[]>([]);
  const [form, setForm] = useState<DuesFormState>(emptyDuesRecord);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterMonth, setFilterMonth] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const sortedMembers = useMemo(() => sortMembersByName(members), [members]);
  const filteredRecords = useMemo(() => {
    const sortedRecords = sortDuesRecords(records);
    if (!filterMonth) {
      return sortedRecords;
    }

    return sortedRecords.filter((record) => record.periodMonth === filterMonth);
  }, [records, filterMonth]);
  const totalUnpaid = useMemo(
    () =>
      records.reduce(
        (total, record) => total + Math.max(0, calculateDuesBalance(record)),
        0
      ),
    [records]
  );
  const memberBalances = useMemo(
    () =>
      sortedMembers
        .map((member) => ({
          member,
          balance: records
            .filter((record) => record.memberId === member.id)
            .reduce((total, record) => total + calculateDuesBalance(record), 0),
        }))
        .filter((item) => item.balance !== 0),
    [records, sortedMembers]
  );
  const currentBalance =
    form.previousBalance +
    form.currentDue -
    form.paidAmount -
    form.discountAmount;

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
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    try {
      if (editingId) {
        const currentRecord = records.find((record) => record.id === editingId);
        const savedRecord = await upsertDuesRecord({
          ...form,
          id: editingId,
          createdAt: currentRecord?.createdAt ?? new Date().toISOString(),
        });
        setRecords((currentRecords) =>
          currentRecords.map((record) =>
            record.id === editingId ? savedRecord : record
          )
        );
      } else {
        const savedRecord = await upsertDuesRecord({
          ...form,
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
    });
    setEditingId(record.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(recordId: string) {
    const confirmed = window.confirm("確定要刪除這筆社費紀錄嗎？");
    if (!confirmed) {
      return;
    }

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
    if (editingId === recordId) {
      resetForm();
    }
  }

  function exportCsv() {
    const headers = [
      "社員",
      "月份",
      "前期餘額",
      "本期社費",
      "已繳金額",
      "折扣金額",
      "結餘",
      "付款日期",
      "付款方式",
      "備註",
      "建立時間",
    ];
    const rows = filteredRecords.map((record) => [
      getMemberName(record.memberId, sortedMembers),
      record.periodMonth,
      String(record.previousBalance),
      String(record.currentDue),
      String(record.paidAmount),
      String(record.discountAmount),
      String(calculateDuesBalance(record)),
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
      ? `高雄晨光扶輪社_社費_${filterMonth}.csv`
      : "高雄晨光扶輪社_社費紀錄.csv";
    link.click();
    URL.revokeObjectURL(url);
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
              高雄晨光扶輪社
            </p>
            <h1 className="mt-2 text-3xl font-bold">社費管理</h1>
          </div>
        </header>
        {errorMessage ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage}
          </p>
        ) : null}

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
            <span className="text-sm font-bold">選擇社員</span>
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
              <option value="">請選擇社員</option>
              {sortedMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {formatMemberName(member)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-bold">月份</span>
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
              ["previousBalance", "前期餘額"],
              ["currentDue", "本期社費"],
              ["paidAmount", "已繳金額"],
              ["discountAmount", "折扣金額"],
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

          <div className="rounded-2xl bg-[#F8F3E8] p-4 font-bold">
            系統自動計算結餘：{formatCurrency(currentBalance)}
          </div>

          <label className="block">
            <span className="text-sm font-bold">付款日期</span>
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
            <span className="text-sm font-bold">付款方式</span>
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

        <section className="grid grid-cols-1 gap-3">
          <div className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
            <p className="text-sm font-bold text-[#C99700]">未繳總額</p>
            <p className="mt-1 text-3xl font-bold">{formatCurrency(totalUnpaid)}</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">每位社員目前欠款</h2>
          {memberBalances.length === 0 ? (
            <div className="rounded-3xl bg-white/75 p-5 text-center font-semibold text-[#173B73]/70 shadow-[6px_6px_16px_rgba(0,0,0,0.1),-6px_-6px_16px_rgba(255,255,255,0.8)]">
              目前沒有欠款
            </div>
          ) : (
            memberBalances.map(({ member, balance }) => (
              <div
                key={member.id}
                className="flex items-center justify-between rounded-3xl bg-white/85 p-5 font-bold shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]"
              >
                <span>{formatMemberName(member)}</span>
                <span>{formatCurrency(balance)}</span>
              </div>
            ))
          )}
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
            filteredRecords.map((record) => (
              <article
                key={record.id}
                className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[#C99700]">
                      {record.periodMonth || "未填月份"}
                    </p>
                    <h3 className="mt-1 text-xl font-bold">
                      {getMemberName(record.memberId, sortedMembers)}
                    </h3>
                    <p className="mt-1 text-sm font-semibold">
                      結餘：{formatCurrency(calculateDuesBalance(record))}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#173B73] px-3 py-1 text-xs font-bold text-white">
                    {record.paymentMethod}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-sm font-semibold text-[#173B73]/80">
                  <p>前期餘額：{formatCurrency(record.previousBalance)}</p>
                  <p>本期社費：{formatCurrency(record.currentDue)}</p>
                  <p>已繳金額：{formatCurrency(record.paidAmount)}</p>
                  <p>折扣金額：{formatCurrency(record.discountAmount)}</p>
                  <p>付款日期：{record.paymentDate || "-"}</p>
                  {record.note ? <p>備註：{record.note}</p> : null}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleEdit(record)}
                    className={`rounded-2xl bg-[#F7C948] py-3 font-bold ${buttonShadow}`}
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
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}

function getMemberName(memberId: string, members: Member[]) {
  const member = members.find((memberItem) => memberItem.id === memberId);
  return member ? formatMemberName(member) || "未知社員" : "未知社員";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function escapeCsvValue(value: string) {
  const escapedValue = value.replaceAll('"', '""');
  return `"${escapedValue}"`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? `${fallback}：${error.message}` : fallback;
}
