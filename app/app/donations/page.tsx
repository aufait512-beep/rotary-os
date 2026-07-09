"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  DonationCategory,
  DonationPlan,
  DonationRecord,
  DonorType,
  PaymentStatus,
  donationCategories,
  emptyDonationPlan,
  getPlanStats,
  sortDonationPlans,
} from "@/lib/donations";
import { supabase } from "@/src/lib/supabase";

type PlanFormState = Omit<DonationPlan, "id">;
type RecordFormState = Omit<DonationRecord, "id" | "createdAt">;

type DonationPlanRow = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  suggested_amount_text: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  sort_order: number | null;
};

type DonationRecordRow = {
  id: string;
  plan_id: string;
  donor_name: string;
  club_name: string | null;
  donor_type: string;
  amount: number | null;
  transfer_last_five: string | null;
  note: string | null;
  payment_status: string;
  created_at: string;
};

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

export default function DonationsPage() {
  const [plans, setPlans] = useState<DonationPlan[]>([]);
  const [records, setRecords] = useState<DonationRecord[]>([]);
  const [planForm, setPlanForm] = useState<PlanFormState>(emptyDonationPlan);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [isPlanFormOpen, setIsPlanFormOpen] = useState(false);
  const [expandedPlanIds, setExpandedPlanIds] = useState<string[]>([]);
  const [recordForm, setRecordForm] = useState<RecordFormState | null>(null);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const sortedPlans = useMemo(() => sortDonationPlans(plans), [plans]);
  const totalStats = useMemo(
    () => ({
      totalAmount: records.reduce((total, record) => total + record.amount, 0),
      pendingAmount: records
        .filter((record) => record.paymentStatus === "pending")
        .reduce((total, record) => total + record.amount, 0),
      receivedAmount: records
        .filter((record) => record.paymentStatus === "received")
        .reduce((total, record) => total + record.amount, 0),
    }),
    [records]
  );

  async function loadData() {
    setIsLoading(true);
    setErrorMessage("");

    const [{ data: planRows, error: planError }, { data: recordRows, error: recordError }] =
      await Promise.all([
        supabase
          .from("donation_plans")
          .select("*")
          .order("category", { ascending: true })
          .order("sort_order", { ascending: true }),
        supabase
          .from("donation_records")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

    if (planError || recordError) {
      setErrorMessage(
        planError?.message ?? recordError?.message ?? "Supabase 資料讀取失敗。"
      );
      setIsLoading(false);
      return;
    }

    setPlans(sortDonationPlans((planRows ?? []).map(mapPlanRow)));
    setRecords((recordRows ?? []).map(mapRecordRow));
    setIsLoading(false);
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  function resetPlanForm(category: DonationCategory = "社內計畫") {
    setPlanForm({ ...emptyDonationPlan, category });
    setEditingPlanId(null);
    setIsPlanFormOpen(false);
  }

  async function handlePlanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const plan: DonationPlan = {
      ...planForm,
      id: editingPlanId ?? crypto.randomUUID(),
    };
    const { data, error } = await supabase
      .from("donation_plans")
      .upsert(toPlanRow(plan), { onConflict: "id" })
      .select()
      .single();

    if (error) {
      setErrorMessage(`計畫儲存失敗：${error.message}`);
      return;
    }

    const savedPlan = mapPlanRow(data);
    setPlans((currentPlans) =>
      sortDonationPlans(
        editingPlanId
          ? currentPlans.map((item) => (item.id === savedPlan.id ? savedPlan : item))
          : [savedPlan, ...currentPlans]
      )
    );
    resetPlanForm(planForm.category);
  }

  function editPlan(plan: DonationPlan) {
    setPlanForm({
      category: plan.category,
      title: plan.title,
      description: plan.description,
      suggestedAmountText: plan.suggestedAmountText,
      startDate: plan.startDate,
      endDate: plan.endDate,
      status: plan.status,
      sortOrder: plan.sortOrder,
    });
    setEditingPlanId(plan.id);
    setIsPlanFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deletePlan(planId: string) {
    const confirmed = window.confirm(
      "確定要刪除此捐獻計畫嗎？相關捐獻紀錄也會一起刪除。"
    );
    if (!confirmed) {
      return;
    }

    setErrorMessage("");
    const recordDelete = await supabase
      .from("donation_records")
      .delete()
      .eq("plan_id", planId);
    if (recordDelete.error) {
      setErrorMessage(`捐獻紀錄刪除失敗：${recordDelete.error.message}`);
      return;
    }

    const planDelete = await supabase.from("donation_plans").delete().eq("id", planId);
    if (planDelete.error) {
      setErrorMessage(`計畫刪除失敗：${planDelete.error.message}`);
      return;
    }

    setPlans((currentPlans) => currentPlans.filter((plan) => plan.id !== planId));
    setRecords((currentRecords) =>
      currentRecords.filter((record) => record.planId !== planId)
    );
    setExpandedPlanIds((currentIds) => currentIds.filter((id) => id !== planId));
    if (editingPlanId === planId) {
      resetPlanForm();
    }
  }

  async function movePlan(plan: DonationPlan, direction: -1 | 1) {
    const categoryPlans = sortDonationPlans(
      plans.filter((item) => item.category === plan.category)
    );
    const currentIndex = categoryPlans.findIndex((item) => item.id === plan.id);
    const targetPlan = categoryPlans[currentIndex + direction];
    if (!targetPlan) {
      return;
    }

    setErrorMessage("");
    const movedPlan = { ...plan, sortOrder: targetPlan.sortOrder };
    const movedTarget = { ...targetPlan, sortOrder: plan.sortOrder };
    const { error } = await supabase
      .from("donation_plans")
      .upsert([toPlanRow(movedPlan), toPlanRow(movedTarget)], { onConflict: "id" });

    if (error) {
      setErrorMessage(`排序更新失敗：${error.message}`);
      return;
    }

    setPlans((currentPlans) =>
      sortDonationPlans(
        currentPlans.map((item) => {
          if (item.id === movedPlan.id) return movedPlan;
          if (item.id === movedTarget.id) return movedTarget;
          return item;
        })
      )
    );
  }

  function togglePlanRecords(planId: string) {
    setExpandedPlanIds((currentIds) =>
      currentIds.includes(planId)
        ? currentIds.filter((id) => id !== planId)
        : [...currentIds, planId]
    );
  }

  function editRecord(record: DonationRecord) {
    setRecordForm({
      planId: record.planId,
      donorName: record.donorName,
      clubName: record.clubName,
      donorType: record.donorType,
      amount: record.amount,
      transferLastFive: record.transferLastFive,
      note: record.note,
      paymentStatus: record.paymentStatus,
    });
    setEditingRecordId(record.id);
  }

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recordForm || !editingRecordId) return;

    const currentRecord = records.find((record) => record.id === editingRecordId);
    if (!currentRecord) return;

    setErrorMessage("");
    const nextRecord: DonationRecord = {
      ...recordForm,
      id: editingRecordId,
      createdAt: currentRecord.createdAt,
    };
    const { data, error } = await supabase
      .from("donation_records")
      .upsert(toRecordRow(nextRecord), { onConflict: "id" })
      .select()
      .single();

    if (error) {
      setErrorMessage(`捐獻紀錄儲存失敗：${error.message}`);
      return;
    }

    const savedRecord = mapRecordRow(data);
    setRecords((currentRecords) =>
      currentRecords.map((record) =>
        record.id === savedRecord.id ? savedRecord : record
      )
    );
    setRecordForm(null);
    setEditingRecordId(null);
  }

  async function deleteRecord(recordId: string) {
    const confirmed = window.confirm("確定要刪除此筆捐獻紀錄嗎？");
    if (!confirmed) return;

    setErrorMessage("");
    const { error } = await supabase.from("donation_records").delete().eq("id", recordId);
    if (error) {
      setErrorMessage(`捐獻紀錄刪除失敗：${error.message}`);
      return;
    }

    setRecords((currentRecords) =>
      currentRecords.filter((record) => record.id !== recordId)
    );
    if (editingRecordId === recordId) {
      setRecordForm(null);
      setEditingRecordId(null);
    }
  }

  function exportCsv() {
    const headers = [
      "捐獻分類",
      "捐獻計畫",
      "捐獻人",
      "社別",
      "身分類型",
      "捐獻金額",
      "匯款後五碼",
      "付款狀態",
      "建立時間",
      "備註",
    ];
    const rows = records.map((record) => {
      const plan = plans.find((item) => item.id === record.planId);
      return [
        plan?.category ?? "",
        plan?.title ?? "",
        record.donorName,
        record.clubName,
        record.donorType,
        String(record.amount),
        record.transferLastFive,
        formatPaymentStatus(record.paymentStatus),
        record.createdAt,
        record.note,
      ];
    });
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "高雄晨光扶輪社_年度捐獻紀錄.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <section className="mx-auto max-w-md space-y-6">
        <header className="space-y-3">
          <Link href="/" className="text-sm font-bold text-[#173B73]/75">
            返回首頁
          </Link>
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-[#C99700]">
              高雄晨光扶輪社
            </p>
            <h1 className="mt-2 text-3xl font-bold">年度捐獻計畫管理</h1>
          </div>
        </header>

        {errorMessage ? <ErrorNotice message={errorMessage} /> : null}
        {isLoading ? (
          <p className="rounded-2xl bg-white/80 p-4 text-center font-bold">
            正在讀取 Supabase 資料...
          </p>
        ) : null}

        <section className="grid grid-cols-3 gap-3">
          <StatCard label="總金額" value={formatCurrency(totalStats.totalAmount)} />
          <StatCard
            label="待確認"
            value={formatCurrency(totalStats.pendingAmount)}
          />
          <StatCard
            label="已收款"
            value={formatCurrency(totalStats.receivedAmount)}
          />
        </section>

        <section className="space-y-3">
          <button
            type="button"
            onClick={() => {
              if (isPlanFormOpen) resetPlanForm();
              else setIsPlanFormOpen(true);
            }}
            className={`w-full rounded-2xl bg-[#F7C948] py-4 font-bold ${buttonShadow}`}
          >
            {isPlanFormOpen ? "收合新增表單" : "➕ 新增子計畫"}
          </button>

          {isPlanFormOpen ? (
            <PlanEditor
              form={planForm}
              editingPlanId={editingPlanId}
              onSubmit={handlePlanSubmit}
              onCancel={() => resetPlanForm()}
              onChange={setPlanForm}
            />
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-bold">捐獻紀錄</h2>
            <button
              type="button"
              onClick={exportCsv}
              className={`rounded-2xl bg-[#F7C948] px-4 py-2 text-sm font-bold ${buttonShadow}`}
            >
              匯出 CSV
            </button>
          </div>
        </section>

        <section className="space-y-5">
          {donationCategories.map((category) => {
            const categoryPlans = sortedPlans.filter(
              (plan) => plan.category === category
            );

            return (
              <section key={category} className="space-y-3">
                <h2 className="text-2xl font-bold">{category}</h2>
                {categoryPlans.length === 0 ? (
                  <div className="rounded-3xl bg-white/75 p-5 text-center font-semibold text-[#173B73]/70">
                    目前尚無子計畫。
                  </div>
                ) : (
                  categoryPlans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      records={records}
                      plans={plans}
                      isExpanded={expandedPlanIds.includes(plan.id)}
                      editingRecordId={editingRecordId}
                      recordForm={recordForm}
                      onToggleRecords={togglePlanRecords}
                      onEditPlan={editPlan}
                      onDeletePlan={deletePlan}
                      onMovePlan={movePlan}
                      onEditRecord={editRecord}
                      onDeleteRecord={deleteRecord}
                      onSaveRecord={saveRecord}
                      onChangeRecord={setRecordForm}
                      onCancelRecord={() => {
                        setRecordForm(null);
                        setEditingRecordId(null);
                      }}
                    />
                  ))
                )}
              </section>
            );
          })}
        </section>
      </section>
    </main>
  );
}

function PlanEditor({
  form,
  editingPlanId,
  onSubmit,
  onCancel,
  onChange,
}: {
  form: PlanFormState;
  editingPlanId: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onChange: (form: PlanFormState) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 overflow-hidden rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)] transition-all"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">
          {editingPlanId ? "編輯子計畫" : "新增子計畫"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          className={`rounded-2xl bg-white px-4 py-2 text-sm font-bold ${buttonShadow}`}
        >
          取消
        </button>
      </div>

      <label className="block">
        <span className="text-sm font-bold">分類</span>
        <select
          value={form.category}
          onChange={(event) =>
            onChange({
              ...form,
              category: event.target.value as DonationCategory,
            })
          }
          className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
        >
          {donationCategories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>

      <TextInput
        label="計畫名稱"
        value={form.title}
        onChange={(value) => onChange({ ...form, title: value })}
        required
      />

      <label className="block">
        <span className="text-sm font-bold">計畫內容</span>
        <textarea
          value={form.description}
          onChange={(event) =>
            onChange({ ...form, description: event.target.value })
          }
          rows={4}
          className="mt-2 w-full resize-none rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
        />
      </label>

      <label className="block">
        <span className="text-sm font-bold">建議捐獻說明</span>
        <textarea
          value={form.suggestedAmountText}
          onChange={(event) =>
            onChange({ ...form, suggestedAmountText: event.target.value })
          }
          rows={3}
          placeholder="例如：捐獻美金 1,000 元，可獲頒 Paul Harris Fellow"
          className="mt-2 w-full resize-none rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <TextInput
          label="開始日期"
          type="date"
          value={form.startDate}
          onChange={(value) => onChange({ ...form, startDate: value })}
        />
        <TextInput
          label="截止日期"
          type="date"
          value={form.endDate}
          onChange={(value) => onChange({ ...form, endDate: value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextInput
          label="排序"
          type="number"
          value={String(form.sortOrder)}
          onChange={(value) =>
            onChange({ ...form, sortOrder: Number(value) || 1 })
          }
        />
        <label className="block">
          <span className="text-sm font-bold">狀態</span>
          <select
            value={form.status}
            onChange={(event) =>
              onChange({
                ...form,
                status: event.target.value === "closed" ? "closed" : "open",
              })
            }
            className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
          >
            <option value="open">open 開放</option>
            <option value="closed">closed 關閉</option>
          </select>
        </label>
      </div>

      <button
        type="submit"
        className={`w-full rounded-2xl bg-[#F7C948] py-4 font-bold ${buttonShadow}`}
      >
        {editingPlanId ? "儲存修改" : "新增子計畫"}
      </button>
    </form>
  );
}

function PlanCard({
  plan,
  records,
  plans,
  isExpanded,
  editingRecordId,
  recordForm,
  onToggleRecords,
  onEditPlan,
  onDeletePlan,
  onMovePlan,
  onEditRecord,
  onDeleteRecord,
  onSaveRecord,
  onChangeRecord,
  onCancelRecord,
}: {
  plan: DonationPlan;
  records: DonationRecord[];
  plans: DonationPlan[];
  isExpanded: boolean;
  editingRecordId: string | null;
  recordForm: RecordFormState | null;
  onToggleRecords: (planId: string) => void;
  onEditPlan: (plan: DonationPlan) => void;
  onDeletePlan: (planId: string) => void;
  onMovePlan: (plan: DonationPlan, direction: -1 | 1) => void;
  onEditRecord: (record: DonationRecord) => void;
  onDeleteRecord: (recordId: string) => void;
  onSaveRecord: (event: FormEvent<HTMLFormElement>) => void;
  onChangeRecord: (form: RecordFormState) => void;
  onCancelRecord: () => void;
}) {
  const stats = getPlanStats(plan, records);

  return (
    <article className="space-y-4 rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
      <div>
        <p className="text-sm font-bold text-[#C99700]">{plan.category}</p>
        <h3 className="mt-1 text-xl font-bold">{plan.title}</h3>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm font-bold">
        <StatCard label="已捐獻" value={`${stats.records.length} 人`} />
        <StatCard label="已收款" value={formatCurrency(stats.receivedAmount)} />
        <StatCard label="待確認" value={formatCurrency(stats.pendingAmount)} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <SmallButton onClick={() => onMovePlan(plan, -1)}>上移</SmallButton>
        <SmallButton onClick={() => onMovePlan(plan, 1)}>下移</SmallButton>
        <SmallButton onClick={() => onEditPlan(plan)} gold>
          編輯
        </SmallButton>
        <SmallButton onClick={() => onDeletePlan(plan.id)}>刪除</SmallButton>
      </div>

      <button
        type="button"
        onClick={() => onToggleRecords(plan.id)}
        className={`w-full rounded-2xl bg-white py-3 text-left font-bold ${buttonShadow}`}
      >
        <span className="px-4">
          {isExpanded ? "▼ 收合捐獻紀錄" : "▶ 查看捐獻紀錄"}（
          {stats.records.length}）
        </span>
      </button>

      {isExpanded ? (
        <div className="space-y-3 overflow-hidden transition-all duration-200">
          {stats.records.length === 0 ? (
            <p className="rounded-2xl bg-[#F8F3E8] p-4 text-center text-sm font-semibold text-[#173B73]/70">
              目前沒有捐獻紀錄。
            </p>
          ) : (
            stats.records.map((record) => (
              <RecordCard
                key={record.id}
                record={record}
                plans={plans}
                isEditing={editingRecordId === record.id}
                recordForm={recordForm}
                onEdit={onEditRecord}
                onDelete={onDeleteRecord}
                onSave={onSaveRecord}
                onChange={onChangeRecord}
                onCancel={onCancelRecord}
              />
            ))
          )}
        </div>
      ) : null}
    </article>
  );
}

function RecordCard({
  record,
  plans,
  isEditing,
  recordForm,
  onEdit,
  onDelete,
  onSave,
  onChange,
  onCancel,
}: {
  record: DonationRecord;
  plans: DonationPlan[];
  isEditing: boolean;
  recordForm: RecordFormState | null;
  onEdit: (record: DonationRecord) => void;
  onDelete: (recordId: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onChange: (form: RecordFormState) => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#E5D9BD] bg-white p-4">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1">
          <p className="font-bold">{record.donorName || "未填姓名"}</p>
          <p className="text-sm font-bold">{formatCurrency(record.amount)}</p>
          <p className="text-sm font-semibold text-[#173B73]/75">
            {formatPaymentStatus(record.paymentStatus)}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onEdit(record)}
            className={`rounded-2xl bg-[#F7C948] px-3 py-2 text-sm font-bold ${buttonShadow}`}
          >
            編輯
          </button>
          <button
            type="button"
            onClick={() => onDelete(record.id)}
            className={`rounded-2xl bg-white px-3 py-2 text-sm font-bold ${buttonShadow}`}
          >
            刪除
          </button>
        </div>
      </div>

      {isEditing && recordForm ? (
        <RecordEditor
          form={recordForm}
          plans={plans}
          createdAt={record.createdAt}
          onChange={onChange}
          onSubmit={onSave}
          onCancel={onCancel}
        />
      ) : null}
    </div>
  );
}

function RecordEditor({
  form,
  plans,
  createdAt,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: RecordFormState;
  plans: DonationPlan[];
  createdAt: string;
  onChange: (form: RecordFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 space-y-3 rounded-2xl bg-[#F8F3E8] p-4"
    >
      <p className="font-bold">完整資料</p>
      <label className="block">
        <span className="text-sm font-bold">捐獻計畫</span>
        <select
          value={form.planId}
          onChange={(event) => onChange({ ...form, planId: event.target.value })}
          className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
        >
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.category} / {plan.title}
            </option>
          ))}
        </select>
      </label>
      <TextInput
        label="捐獻人"
        value={form.donorName}
        onChange={(value) => onChange({ ...form, donorName: value })}
        required
      />
      <TextInput
        label="捐獻金額"
        type="number"
        value={String(form.amount)}
        onChange={(value) => onChange({ ...form, amount: Number(value) || 0 })}
      />
      <TextInput
        label="社別"
        value={form.clubName}
        onChange={(value) => onChange({ ...form, clubName: value })}
      />
      <label className="block">
        <span className="text-sm font-bold">身分類型</span>
        <select
          value={form.donorType}
          onChange={(event) =>
            onChange({ ...form, donorType: event.target.value as DonorType })
          }
          className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
        >
          <option value="晨光社友">晨光社友</option>
          <option value="友社">友社</option>
          <option value="其他">其他</option>
        </select>
      </label>
      <TextInput
        label="匯款後五碼"
        value={form.transferLastFive}
        onChange={(value) => onChange({ ...form, transferLastFive: value })}
      />
      <label className="block">
        <span className="text-sm font-bold">付款狀態</span>
        <select
          value={form.paymentStatus}
          onChange={(event) =>
            onChange({
              ...form,
              paymentStatus: event.target.value as PaymentStatus,
            })
          }
          className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
        >
          <option value="pending">pending 待確認</option>
          <option value="received">received 已收款</option>
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-bold">備註</span>
        <textarea
          rows={3}
          value={form.note}
          onChange={(event) => onChange({ ...form, note: event.target.value })}
          className="mt-2 w-full resize-none rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
        />
      </label>
      <p className="text-sm font-semibold text-[#173B73]/70">
        建立時間：{formatDateTime(createdAt)}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="submit"
          className={`rounded-2xl bg-[#F7C948] py-3 font-bold ${buttonShadow}`}
        >
          儲存紀錄
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}
        >
          取消
        </button>
      </div>
    </form>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold">{label}</span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
      />
    </label>
  );
}

function SmallButton({
  children,
  onClick,
  gold,
}: {
  children: ReactNode;
  onClick: () => void;
  gold?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl ${gold ? "bg-[#F7C948]" : "bg-white"} py-2 text-sm font-bold ${buttonShadow}`}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/85 p-4 shadow-[6px_6px_16px_rgba(0,0,0,0.1),-6px_-6px_16px_rgba(255,255,255,0.8)]">
      <p className="text-xs font-bold text-[#173B73]/70">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
      {message}
    </div>
  );
}

function mapPlanRow(row: DonationPlanRow): DonationPlan {
  return {
    id: row.id,
    category: normalizeCategory(row.category),
    title: row.title ?? "",
    description: row.description ?? "",
    suggestedAmountText: row.suggested_amount_text ?? "",
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    status: row.status === "closed" ? "closed" : "open",
    sortOrder: Number(row.sort_order) || 1,
  };
}

function mapRecordRow(row: DonationRecordRow): DonationRecord {
  return {
    id: row.id,
    planId: row.plan_id,
    donorName: row.donor_name ?? "",
    clubName: row.club_name ?? "",
    donorType: normalizeDonorType(row.donor_type),
    amount: Number(row.amount) || 0,
    transferLastFive: row.transfer_last_five ?? "",
    note: row.note ?? "",
    paymentStatus: row.payment_status === "received" ? "received" : "pending",
    createdAt: row.created_at,
  };
}

function toPlanRow(plan: DonationPlan) {
  return {
    id: plan.id,
    category: plan.category,
    title: plan.title,
    description: plan.description,
    suggested_amount_text: plan.suggestedAmountText,
    start_date: plan.startDate || null,
    end_date: plan.endDate || null,
    status: plan.status,
    sort_order: plan.sortOrder,
  };
}

function toRecordRow(record: DonationRecord) {
  return {
    id: record.id,
    plan_id: record.planId,
    donor_name: record.donorName,
    club_name: record.clubName,
    donor_type: record.donorType,
    amount: record.amount,
    transfer_last_five: record.transferLastFive,
    note: record.note,
    payment_status: record.paymentStatus,
    created_at: record.createdAt,
  };
}

function normalizeCategory(category: string): DonationCategory {
  if (category === "全球計畫" || category === "global") return "全球計畫";
  if (category === "地區計畫" || category === "district") return "地區計畫";
  return "社內計畫";
}

function normalizeDonorType(donorType: string): DonorType {
  if (donorType === "友社" || donorType === "其他") return donorType;
  return "晨光社友";
}

function formatPaymentStatus(status: PaymentStatus) {
  return status === "received" ? "已收款" : "待確認";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-TW", { hour12: false });
}

function escapeCsvValue(value: string) {
  const escapedValue = value.replaceAll('"', '""');
  return `"${escapedValue}"`;
}
