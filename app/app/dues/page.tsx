"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  calculateDuesBalance,
  DuesLineItem,
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
  | "paidAmount"
  | "discountAmount";

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
  const currentDue = calculateLineItemsTotal(form.lineItems);
  const currentBalance =
    form.previousBalance +
    currentDue -
    form.paidAmount;

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
          currentRecords.map((record) =>
            record.id === editingId ? savedRecord : record
          )
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

        <button
          type="button"
          onClick={() => setIsFormOpen((currentValue) => !currentValue)}
          className={`w-full rounded-2xl bg-[#F7C948] py-4 font-bold ${buttonShadow}`}
        >
          {isFormOpen ? "收合新增社費紀錄" : "➕ 新增社費紀錄"}
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
              ["paidAmount", "已繳金額"],
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
              {isLineItemsOpen ? "▼ 收合明細" : "▶ 展開明細"}｜本期社費：
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
            尚欠金額：{formatCurrency(currentBalance)}
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
        ) : null}

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
                  <p>前期未繳：{formatCurrency(record.previousBalance)}</p>
                  <p>本期社費：{formatCurrency(record.currentDue)}</p>
                  <p>已繳金額：{formatCurrency(record.paidAmount)}</p>
                  <p>尚欠金額：{formatCurrency(calculateDuesBalance(record))}</p>
                  <p>繳費方式：{record.paymentMethod}</p>
                  <p>付款日期：{record.paymentDate || "-"}</p>
                  <details>
                    <summary className="cursor-pointer font-bold">
                      明細：本期社費 {formatCurrency(record.currentDue)}
                    </summary>
                    <div className="mt-2 space-y-1">
                      {record.lineItems.map((item) => (
                        <p key={item.id}>
                          {formatLineItemType(item.itemType)} {item.serviceDate}
                          {item.itemName ? ` ${item.itemName}` : ""}：
                          {formatCurrency(item.amount)}
                        </p>
                      ))}
                    </div>
                  </details>
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
        <SmallAction onClick={() => addItem({ itemType: "meal", itemName: "餐費" })}>
          餐費
        </SmallAction>
        <SmallAction
          onClick={() =>
            addItem({
              itemType: "annual_fee",
              itemName: "常年費",
              unitAmount: 1000,
              amount: 1000,
            })
          }
        >
          常年費
        </SmallAction>
        <SmallAction
          onClick={() =>
            addItem({ itemType: "special_donation", itemName: "特別捐" })
          }
        >
          特別捐
        </SmallAction>
        <SmallAction onClick={() => addItem({ itemType: "red_box", itemName: "紅箱" })}>
          紅箱
        </SmallAction>
        <SmallAction
          onClick={() =>
            addItem({
              itemType: "rotary_foundation",
              itemName: "扶輪基金（代收）",
              unitAmount: 270,
              amount: 270,
            })
          }
        >
          扶輪基金
        </SmallAction>
        <SmallAction
          onClick={() => addItem({ itemType: "pass_through", itemName: "代收付" })}
        >
          代收付
        </SmallAction>
      </div>

      {items.length === 0 ? (
        <p className="text-sm font-semibold text-[#173B73]/70">
          尚未新增明細。舊資料會以「舊資料總額」顯示。
        </p>
      ) : (
        items.map((item) => (
          <div key={item.id} className="space-y-2 rounded-2xl bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold">{formatLineItemType(item.itemType)}</p>
              <button
                type="button"
                onClick={() => onChange(items.filter((lineItem) => lineItem.id !== item.id))}
                className="text-sm font-bold text-red-600"
              >
                刪除
              </button>
            </div>
            {item.itemType === "annual_fee" ? (
              <select
                value={item.amount}
                onChange={(event) =>
                  updateItem(item.id, {
                    unitAmount: Number(event.target.value),
                    amount: Number(event.target.value),
                  })
                }
                className="w-full rounded-2xl border border-[#E5D9BD] px-3 py-2"
              >
                <option value={1000}>NT$1,000</option>
                <option value={2000}>NT$2,000</option>
              </select>
            ) : (
              <>
                {(item.itemType === "meal" || item.itemType === "red_box") ? (
                  <input
                    type="date"
                    value={item.serviceDate}
                    onChange={(event) =>
                      updateItem(item.id, { serviceDate: event.target.value })
                    }
                    className="w-full rounded-2xl border border-[#E5D9BD] px-3 py-2"
                  />
                ) : null}
                {(item.itemType === "pass_through" || item.itemType === "special_donation") ? (
                  <input
                    value={item.itemName}
                    onChange={(event) => updateItem(item.id, { itemName: event.target.value })}
                    placeholder="項目名稱 / 說明"
                    className="w-full rounded-2xl border border-[#E5D9BD] px-3 py-2"
                  />
                ) : null}
                <input
                  type="number"
                  value={item.amount}
                  onChange={(event) =>
                    updateItem(item.id, {
                      unitAmount: Number(event.target.value) || 0,
                      amount: Number(event.target.value) || 0,
                    })
                  }
                  className="w-full rounded-2xl border border-[#E5D9BD] px-3 py-2"
                />
              </>
            )}
            <textarea
              value={item.note}
              onChange={(event) => updateItem(item.id, { note: event.target.value })}
              placeholder="備註"
              className="w-full resize-none rounded-2xl border border-[#E5D9BD] px-3 py-2"
            />
          </div>
        ))
      )}
    </div>
  );
}

function SmallAction({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl bg-white px-3 py-2 text-sm font-bold ${buttonShadow}`}
    >
      {children}
    </button>
  );
}

function calculateLineItemsTotal(items: DuesLineItem[]) {
  return items.reduce((total, item) => total + item.amount, 0);
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
