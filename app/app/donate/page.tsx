"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  DonationCategory,
  DonationPlan,
  DonorType,
  donationCategories,
  emptyDonationRecord,
  isPlanOpen,
  sortDonationPlans,
} from "@/lib/donations";
import {
  formatMemberName,
  sortMembersByName,
} from "@/lib/members";
import { supabase } from "@/src/lib/supabase";
import { fetchMembers } from "@/lib/supabaseData";

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

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.16),-4px_-4px_10px_rgba(255,255,255,0.9)] active:translate-y-1 active:shadow-inner";

export default function DonatePage() {
  const [plans, setPlans] = useState<DonationPlan[]>([]);
  const [members, setMembers] = useState(() => sortMembersByName([]));
  const [selectedCategory, setSelectedCategory] =
    useState<DonationCategory>("全球計畫");
  const [form, setForm] = useState(emptyDonationRecord);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const memberOptions = useMemo(
    () =>
      members
        .map(formatMemberName)
        .filter((memberName) => memberName !== ""),
    [members]
  );
  const hasMemberOptions = memberOptions.length > 0;
  const shouldUseMemberSelect =
    form.donorType === "晨光社友" && hasMemberOptions;

  const openPlans = useMemo(
    () => sortDonationPlans(plans.filter(isPlanOpen)),
    [plans]
  );
  const categoryPlans = openPlans.filter(
    (plan) => plan.category === selectedCategory
  );
  const selectedPlan = openPlans.find((plan) => plan.id === form.planId);

  useEffect(() => {
    async function loadPlans() {
      setIsLoading(true);
      setErrorMessage("");
      const { data, error } = await supabase
        .from("donation_plans")
        .select("*")
        .eq("status", "open")
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true });

      if (error) {
        setErrorMessage(`捐獻計畫讀取失敗：${error.message}`);
        setIsLoading(false);
        return;
      }

      setPlans(sortDonationPlans((data ?? []).map(mapPlanRow)));
      try {
        setMembers(await fetchMembers());
      } catch (memberError) {
        setErrorMessage(
          memberError instanceof Error
            ? `社友名單讀取失敗：${memberError.message}`
            : "社友名單讀取失敗"
        );
      }
      setIsLoading(false);
    }

    void loadPlans();
  }, []);

  function handleCategoryChange(category: DonationCategory) {
    setSelectedCategory(category);
    setForm((currentForm) => ({ ...currentForm, planId: "" }));
  }

  function handleDonorTypeChange(donorType: DonorType) {
    setForm((currentForm) => ({
      ...currentForm,
      donorType,
      donorName:
        donorType === "晨光社友" && hasMemberOptions
          ? memberOptions[0]
          : "",
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPlan || form.amount <= 0) {
      return;
    }

    const newRecord = {
      ...form,
      id: crypto.randomUUID(),
      amount: Number(form.amount) || 0,
      paymentStatus: "pending" as const,
      createdAt: new Date().toISOString(),
    };
    setErrorMessage("");
    const { error } = await supabase.from("donation_records").insert({
      id: newRecord.id,
      plan_id: newRecord.planId,
      donor_name: newRecord.donorName,
      club_name: newRecord.clubName,
      donor_type: newRecord.donorType,
      amount: newRecord.amount,
      transfer_last_five: newRecord.transferLastFive,
      note: newRecord.note,
      payment_status: newRecord.paymentStatus,
      created_at: newRecord.createdAt,
    });

    if (error) {
      setErrorMessage(`捐獻紀錄送出失敗：${error.message}`);
      return;
    }

    setForm(emptyDonationRecord);
    setSubmitted(true);
  }

  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <section className="mx-auto max-w-md space-y-6">
        <header className="rounded-3xl bg-white px-5 py-7 text-center shadow-[8px_8px_20px_rgba(0,0,0,0.1),-8px_-8px_20px_rgba(255,255,255,0.9)]">
          <p className="text-sm font-bold tracking-[0.18em] text-[#C99700]">
            高雄晨光扶輪社
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight">
            高雄晨光扶輪社年度捐獻計畫
          </h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-[#173B73]/75">
            敬邀各位社友踴躍參與贊助計畫，成就美好。
          </p>
        </header>

        {submitted ? (
          <div className="rounded-3xl bg-white p-6 text-center shadow-[8px_8px_20px_rgba(0,0,0,0.1),-8px_-8px_20px_rgba(255,255,255,0.9)]">
            <p className="text-lg font-bold leading-8">
              感謝您的捐獻登記，我們將由秘書確認後完成紀錄。
            </p>
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className={`mt-5 rounded-2xl bg-[#F7C948] px-5 py-3 font-bold ${buttonShadow}`}
            >
              繼續登記
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-5 rounded-3xl bg-white p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.1),-8px_-8px_20px_rgba(255,255,255,0.9)]"
          >
            {errorMessage ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                {errorMessage}
              </div>
            ) : null}
            {isLoading ? (
              <p className="rounded-2xl bg-[#F8F3E8] p-4 text-center font-bold">
                正在讀取捐獻計畫...
              </p>
            ) : null}
            <div>
              <span className="text-sm font-bold">1. 選擇分類</span>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {donationCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => handleCategoryChange(category)}
                    className={`rounded-2xl px-2 py-3 text-sm font-bold ${buttonShadow} ${
                      selectedCategory === category
                        ? "bg-[#F7C948]"
                        : "bg-[#F8F3E8]"
                    }`}
                  >
                    {category.replace("計畫", "")}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-bold">2. 選擇捐獻計畫</span>
              <select
                required
                value={form.planId}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    planId: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              >
                <option value="">請選擇{selectedCategory}</option>
                {categoryPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.title}
                  </option>
                ))}
              </select>
            </label>

            {selectedPlan ? (
              <section className="space-y-3 rounded-2xl bg-[#F8F3E8] p-4">
                <div>
                  <p className="text-sm font-bold text-[#C99700]">計畫內容</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-[#173B73]/80">
                    {selectedPlan.description || "尚無計畫內容"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-bold text-[#C99700]">
                    建議捐獻說明
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-bold leading-6">
                    {selectedPlan.suggestedAmountText || "歡迎自由捐獻"}
                  </p>
                </div>
              </section>
            ) : null}

            <label className="block">
              <span className="text-sm font-bold">7. 身分類型</span>
              <select
                value={form.donorType}
                onChange={(event) =>
                  handleDonorTypeChange(event.target.value as DonorType)
                }
                className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              >
                <option value="晨光社友">晨光社友</option>
                <option value="友社">友社</option>
                <option value="其他">其他</option>
              </select>
            </label>

            {shouldUseMemberSelect ? (
              <label className="block">
                <span className="text-sm font-bold">5. 姓名 / 社名</span>
                <select
                  required
                  value={form.donorName}
                  onChange={(event) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      donorName: event.target.value,
                    }))
                  }
                  className="mt-2 min-h-12 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                >
                  <option value="">請選擇社友</option>
                  {memberOptions.map((memberName) => (
                    <option key={memberName} value={memberName}>
                      {memberName}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                {form.donorType === "晨光社友" ? (
                  <p className="rounded-2xl bg-[#F8F3E8] p-3 text-sm font-bold leading-6 text-[#173B73]/75">
                    尚未匯入社友名單，請手動輸入
                  </p>
                ) : null}
                <TextInput
                  label="5. 姓名 / 社名"
                  value={form.donorName}
                  onChange={(value) =>
                    setForm((currentForm) => ({
                      ...currentForm,
                      donorName: value,
                    }))
                  }
                  required
                />
              </>
            )}

            <TextInput
              label="6. 社別"
              value={form.clubName}
              onChange={(value) =>
                setForm((currentForm) => ({ ...currentForm, clubName: value }))
              }
            />

            <TextInput
              label="8. 捐獻金額"
              type="number"
              value={String(form.amount || "")}
              onChange={(value) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  amount: Number(value) || 0,
                }))
              }
              required
            />

            <label className="block">
              <span className="text-sm font-bold">9. 匯款帳號後五碼</span>
              <input
                value={form.transferLastFive}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    transferLastFive: event.target.value,
                  }))
                }
                inputMode="numeric"
                maxLength={5}
                className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              />
              <span className="mt-2 block text-xs font-semibold leading-5 text-[#173B73]/65">
                若已匯款，請填寫帳號後五碼，方便秘書對帳。
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-bold">10. 備註</span>
              <textarea
                rows={4}
                value={form.note}
                onChange={(event) =>
                  setForm((currentForm) => ({
                    ...currentForm,
                    note: event.target.value,
                  }))
                }
                className="mt-2 w-full resize-none rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              />
            </label>

            <button
              type="submit"
              disabled={!selectedPlan}
              className={`w-full rounded-2xl bg-[#F7C948] py-4 font-bold disabled:opacity-50 ${buttonShadow}`}
            >
              11. 送出
            </button>
          </form>
        )}
      </section>
    </main>
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
        min={type === "number" ? 1 : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
      />
    </label>
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

function normalizeCategory(category: string): DonationCategory {
  if (category === "全球計畫" || category === "global") return "全球計畫";
  if (category === "地區計畫" || category === "district") return "地區計畫";
  return "社內計畫";
}
