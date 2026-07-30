"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  defaultDonationPlans,
  DonationCategory,
  DonationPlan,
  isPlanOpen,
  sortDonationPlans,
} from "@/lib/donations";

type DonationPlanRow = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  suggested_amount_text: string | null;
  unit_amount?: number | null;
  currency?: string | null;
  target_units?: number | null;
  source_label?: string | null;
  source_url?: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  sort_order: number | null;
};

type DonationRecordRow = {
  id: string;
  plan_id: string;
  member_id?: string | null;
  donor_name: string | null;
  amount: number | null;
  quantity?: number | null;
  unit_amount?: number | null;
  billing_month?: string | null;
  payment_status: string | null;
  created_at: string;
};

type BoardMember = {
  id: string;
  displayName: string;
};

type BoardRecord = {
  id: string;
  planId: string;
  memberId: string;
  donorName: string;
  amount: number;
  quantity: number;
  unitAmount: number;
  billingMonth: string;
  paymentStatus: "pending" | "received";
};

type PublicBoardResponse = {
  members?: Array<{ id?: string | null; display_name?: string | null }>;
  records?: DonationRecordRow[];
};

type EditingCell = {
  member: BoardMember;
  plan: DonationPlan;
  quantity: number;
};

const buttonShadow =
  "shadow-[5px_5px_12px_rgba(0,0,0,0.14),-4px_-4px_10px_rgba(255,255,255,0.9)] active:translate-y-0.5 active:shadow-inner";
const MEMBER_ONLY_PLAN_IDS = new Set([
  "53b8147c-643e-4e73-b394-81be1639d298", // 小鄉社造志業聯盟－相機捐贈
]);
const currentMonth = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
}).format(new Date());

export default function DonatePage() {
  const [plans, setPlans] = useState<DonationPlan[]>([]);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [records, setRecords] = useState<BoardRecord[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<DonationPlan | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingPlanId, setSavingPlanId] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadData = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
      setErrorMessage("");
    }

    let payload: { plans?: DonationPlanRow[]; board?: PublicBoardResponse } = {};
    try {
      const response = await fetch("/api/donations/board", { cache: "no-store" });
      if (!response.ok) throw new Error("board unavailable");
      payload = (await response.json()) as typeof payload;
    } catch {
      if (!silent) {
        setPlans(sortDonationPlans(defaultDonationPlans.filter(isPlanOpen)));
        setMembers([]);
        setRecords([]);
      }
      setErrorMessage("雲端總表暫時無法讀取，請稍後重新整理。");
      setIsLoading(false);
      return;
    }

    const nextPlans = (payload.plans ?? []).map(mapPlanRow);
    const board = payload.board ?? {};
    const allRecords = Array.isArray(board.records)
      ? board.records.map(mapRecordRow)
      : [];
    const nextRecords = allRecords.filter(
      (record) => !MEMBER_ONLY_PLAN_IDS.has(record.planId) || Boolean(record.memberId)
    );
    const nextMembers: BoardMember[] = Array.isArray(board.members)
      ? board.members.map((row) => ({
          id: String(row.id ?? ""),
          displayName: String(row.display_name ?? "").trim(),
        }))
      : [];
    const knownNames = new Set(nextMembers.map((member) => member.displayName));
    nextRecords.forEach((record) => {
      if (!record.memberId && record.donorName && !knownNames.has(record.donorName)) {
        nextMembers.push({
          id: `legacy-${record.donorName}`,
          displayName: record.donorName,
        });
        knownNames.add(record.donorName);
      }
    });

    setPlans(sortDonationPlans(nextPlans.filter(isPlanOpen)));
    setRecords(nextRecords);
    setMembers(
      nextMembers
        .filter((member) => member.id && member.displayName)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "zh-Hant"))
    );

    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
    const intervalId = window.setInterval(() => void loadData(true), 10000);
    return () => window.clearInterval(intervalId);
  }, [loadData]);

  const planStats = useMemo(
    () =>
      Object.fromEntries(
        plans.map((plan) => {
          const planRecords = records.filter((record) => record.planId === plan.id);
          return [
            plan.id,
            {
              amount: sum(planRecords.map((record) => record.amount)),
              units: sum(
                planRecords.map((record) =>
                  record.quantity || inferQuantity(record.amount, plan.unitAmount)
                )
              ),
              donors: new Set(
                planRecords.map((record) => record.memberId || record.donorName)
              ).size,
            },
          ];
        })
      ),
    [plans, records]
  );

  const visiblePlanIds = new Set(plans.map((plan) => plan.id));
  const visibleRecords = records.filter((record) => visiblePlanIds.has(record.planId));
  const twdTotal = sum(
    visibleRecords
      .filter((record) => plans.find((plan) => plan.id === record.planId)?.currency !== "USD")
      .map((record) => record.amount)
  );
  const usdTotal = sum(
    visibleRecords
      .filter((record) => plans.find((plan) => plan.id === record.planId)?.currency === "USD")
      .map((record) => record.amount)
  );
  const participatingMembers = new Set(
    visibleRecords.map((record) => record.memberId || record.donorName).filter(Boolean)
  ).size;

  async function updateQuantity(member: BoardMember, plan: DonationPlan, quantity: number) {
    if (plan.unitAmount <= 0) {
      setErrorMessage("此計畫尚未設定每單位金額，請聯絡執行秘書。");
      return;
    }
    setSavingPlanId(plan.id);
    setMessage("");
    setErrorMessage("");
    const response = await fetch("/api/donations/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberPublicKey: member.id,
        planId: plan.id,
        quantity,
        billingMonth: currentMonth,
      }),
    });
    setSavingPlanId("");

    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      setErrorMessage(result.error ?? "捐獻單位儲存失敗，請稍後再試。");
      return;
    }

    setMessage(
      quantity > 0
        ? plan.currency === "TWD"
          ? `已儲存 ${member.displayName} 的「${plan.title}」${quantity} 單位，並以代收款列入 ${currentMonth} 社費。`
          : `已儲存 ${member.displayName} 的「${plan.title}」${quantity} 單位認捐。`
        : `已取消 ${member.displayName} 的「${plan.title}」本月份認捐。`
    );
    setEditingCell(null);
    await loadData();
  }

  return (
    <main className="min-h-screen bg-[#F8F3E8] px-3 py-5 text-[17px] text-[#173B73] sm:px-6 sm:text-lg lg:px-10 lg:py-8">
      <section className="mx-auto w-full max-w-[1800px] space-y-5">
        <header className="rounded-[28px] bg-white px-5 py-6 shadow-[8px_8px_22px_rgba(0,0,0,0.1),-8px_-8px_22px_rgba(255,255,255,0.9)] sm:px-8 lg:flex lg:items-end lg:justify-between lg:gap-8">
          <div>
            <p className="text-sm font-extrabold tracking-[0.16em] text-[#A46D00]">
              高雄晨光扶輪社
            </p>
            <h1 className="mt-2 text-2xl font-black leading-tight sm:text-3xl lg:text-4xl">
              年度捐獻總表
            </h1>
            <p className="mt-3 max-w-3xl font-semibold leading-7 text-[#173B73]/75">
              一眼查看每位社友捐了什麼。要填寫或修改，直接點自己的姓名與計畫交叉格。
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2 lg:mt-0">
            <Link
              href="/"
              className={`rounded-2xl bg-white px-4 py-3 font-bold ${buttonShadow}`}
            >
              返回首頁
            </Link>
            <button
              type="button"
              onClick={() => void loadData()}
              className={`rounded-2xl bg-[#F7C948] px-4 py-3 font-bold ${buttonShadow}`}
            >
              重新整理
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="台幣累積捐獻" value={formatTwd(twdTotal)} />
          <Metric label="美元累積認捐" value={`US$ ${usdTotal.toLocaleString("zh-TW")}`} />
          <Metric label="參與社友" value={`${participatingMembers} 人`} />
          <Metric label="開放計畫" value={`${plans.length} 項`} />
        </section>

        <div className="rounded-2xl border border-[#F7C948] bg-[#FFF7D6] px-4 py-3 text-center font-bold leading-7">
          不需登入，所有社友共用同一張雲端總表。資料每 10 秒自動更新。
        </div>
        {message ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 p-4 font-bold text-green-800">
            {message}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 font-bold text-red-800">
            {errorMessage}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-[28px] bg-white shadow-[8px_8px_22px_rgba(0,0,0,0.1),-8px_-8px_22px_rgba(255,255,255,0.9)]">
          <div className="border-b border-[#E5D9BD] bg-[#FFF7D6] px-4 py-3 text-sm font-bold sm:hidden">
            ← 左右滑動查看所有捐獻計畫 →
          </div>
          <div className="max-h-[72vh] overflow-auto overscroll-contain">
            <table className="w-max min-w-full border-separate border-spacing-0 text-[15px] sm:text-base">
              <thead className="sticky top-0 z-30">
                <tr>
                  <th className="sticky left-0 z-40 w-[128px] min-w-[128px] border-b border-r border-[#D8C899] bg-[#173B73] px-3 py-4 text-left text-white sm:w-[190px] sm:min-w-[190px]">
                    社友姓名
                    <span className="mt-1 block text-xs font-semibold text-white/70">
                      {members.length} 人
                    </span>
                  </th>
                  {plans.map((plan) => {
                    const stats = planStats[plan.id] ?? { amount: 0, units: 0, donors: 0 };
                    return (
                      <th
                        key={plan.id}
                        className={`w-[126px] min-w-[126px] border-b border-r border-[#D8C899] px-2 py-1.5 align-top sm:w-[145px] sm:min-w-[145px] ${
                          stats.donors === 0 ? "bg-[#FFE1DC]" : "bg-[#F7C948]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedPlan(plan)}
                          className="min-h-9 w-full rounded-lg px-1 py-1 text-left text-sm font-black leading-5 underline decoration-2 underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[#173B73] sm:text-base"
                        >
                          {plan.title}
                        </button>
                        <span className="block text-xs font-bold text-[#173B73]/70">
                          {stats.donors === 0 ? "尚無人參與" : `${stats.donors} 人參與`}
                        </span>
                      </th>
                    );
                  })}
                  <th className="sticky right-0 z-40 w-[130px] min-w-[130px] border-b border-l border-[#D8C899] bg-[#173B73] px-3 py-4 text-right text-white sm:w-[160px] sm:min-w-[160px]">
                    社友合計
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={plans.length + 2}
                      className="px-5 py-12 text-center text-lg font-bold"
                    >
                      正在讀取捐獻總表…
                    </td>
                  </tr>
                ) : members.length === 0 ? (
                  <tr>
                    <td
                      colSpan={plans.length + 2}
                      className="px-5 py-12 text-center font-bold"
                    >
                      尚未取得社友名單，請稍後重新整理。
                    </td>
                  </tr>
                ) : (
                  members.map((member, memberIndex) => {
                    const memberRecords = visibleRecords.filter((record) =>
                      record.memberId
                        ? record.memberId === member.id
                        : record.donorName === member.displayName
                    );
                    const memberTwdTotal = sum(
                      memberRecords
                        .filter((record) => plans.find((plan) => plan.id === record.planId)?.currency !== "USD")
                        .map((record) => record.amount)
                    );
                    const memberUsdTotal = sum(
                      memberRecords
                        .filter((record) => plans.find((plan) => plan.id === record.planId)?.currency === "USD")
                        .map((record) => record.amount)
                    );

                    return (
                      <tr key={member.id} className={memberIndex % 2 ? "bg-[#FFFCF4]" : "bg-white"}>
                        <th
                          scope="row"
                          className={`sticky left-0 z-20 border-b border-r border-[#E5D9BD] px-3 py-3 text-left font-extrabold leading-6 ${
                            memberIndex % 2 ? "bg-[#FFFCF4]" : "bg-white"
                          }`}
                        >
                          {member.displayName}
                        </th>
                        {plans.map((plan) => {
                          const cellRecords = memberRecords.filter(
                            (record) => record.planId === plan.id
                          );
                          const cellAmount = sum(cellRecords.map((record) => record.amount));
                          const totalQuantity = sum(
                            cellRecords.map((record) =>
                              record.quantity || inferQuantity(record.amount, plan.unitAmount)
                            )
                          );
                          const currentQuantity = sum(
                            cellRecords
                              .filter((record) => record.billingMonth === currentMonth)
                              .map((record) => record.quantity)
                          );

                          return (
                            <td
                              key={plan.id}
                              className="border-b border-r border-[#E5D9BD] p-1 text-center"
                            >
                              <button
                                type="button"
                                disabled={savingPlanId === plan.id || plan.unitAmount <= 0}
                                onClick={() =>
                                  setEditingCell({ member, plan, quantity: currentQuantity })
                                }
                                className={`min-h-14 w-full rounded-lg px-1 py-1 font-extrabold leading-5 disabled:cursor-not-allowed disabled:opacity-50 ${
                                  cellAmount > 0
                                    ? "bg-[#FFF1A8] text-[#A35C00]"
                                    : "bg-white text-[#173B73]/35"
                                }`}
                                aria-label={`修改${member.displayName}的${plan.title}`}
                              >
                                {cellAmount > 0 ? (
                                  <>
                                    {totalQuantity > 0 ? (
                                      <span className="block">{totalQuantity} 單位</span>
                                    ) : null}
                                    <span className="block text-xs">
                                      {formatPlanAmount(plan, cellAmount)}
                                    </span>
                                  </>
                                ) : (
                                  <span>—<span className="block text-xs">點選填寫</span></span>
                                )}
                              </button>
                            </td>
                          );
                        })}
                        <td
                          className={`sticky right-0 z-20 border-b border-l border-[#E5D9BD] px-3 py-3 text-right font-black ${
                            memberIndex % 2 ? "bg-[#FFFCF4]" : "bg-white"
                          }`}
                        >
                          <span className="block">{formatTwd(memberTwdTotal)}</span>
                          {memberUsdTotal > 0 ? (
                            <span className="block text-xs">US$ {memberUsdTotal.toLocaleString("zh-TW")}</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="sticky bottom-0 z-30">
                <tr>
                  <th className="sticky left-0 z-40 border-r border-t border-[#D8C899] bg-[#173B73] px-3 py-4 text-left text-white">
                    計畫累積
                  </th>
                  {plans.map((plan) => {
                    const stats = planStats[plan.id] ?? { amount: 0, units: 0, donors: 0 };
                    return (
                      <td
                        key={plan.id}
                        className="border-r border-t border-[#D8C899] bg-[#FFF3B5] px-2 py-3 text-center font-black leading-6"
                      >
                        <span className="block">{stats.units} 單位</span>
                        <span className="block text-[#A35C00]">
                          {formatPlanAmount(plan, stats.amount)}
                        </span>
                      </td>
                    );
                  })}
                  <td className="sticky right-0 z-40 border-l border-t border-[#D8C899] bg-[#173B73] px-3 py-4 text-right font-black text-white">
                    <span className="block">{formatTwd(twdTotal)}</span>
                    <span className="block text-xs">US$ {usdTotal.toLocaleString("zh-TW")}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      </section>

      {editingCell ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#0D2447]/65 p-0 sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setEditingCell(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-donation-title"
            className="w-full rounded-t-[28px] bg-white p-6 shadow-2xl sm:max-w-lg sm:rounded-[28px]"
          >
            <p className="text-sm font-black tracking-[0.14em] text-[#A35C00]">填寫認捐</p>
            <h2 id="edit-donation-title" className="mt-2 text-3xl font-black">
              {editingCell.member.displayName}
            </h2>
            <p className="mt-2 text-xl font-bold">{editingCell.plan.title}</p>
            <div className="mt-5 rounded-2xl bg-[#FFF7D6] p-4 text-center">
              <p className="font-bold">1 單位</p>
              <p className="mt-1 text-3xl font-black">
                {formatPlanAmount(editingCell.plan, editingCell.plan.unitAmount)}
              </p>
            </div>
            <label className="mt-5 block">
              <span className="block text-lg font-black">請選擇認捐單位</span>
              <select
                value={editingCell.quantity}
                onChange={(event) =>
                  setEditingCell({
                    ...editingCell,
                    quantity: Number(event.target.value),
                  })
                }
                className="mt-2 min-h-14 w-full rounded-2xl border-2 border-[#A46D00] bg-white px-4 text-xl font-black"
              >
                {Array.from({ length: 11 }, (_, quantity) => (
                  <option key={quantity} value={quantity}>
                    {quantity === 0 ? "0 單位（取消本月認捐）" : `${quantity} 單位`}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#173B73]/70">
              {editingCell.plan.currency === "TWD"
                ? `儲存後會以「代收款」列入 ${currentMonth} 當月社費。`
                : "外幣認捐只登錄在捐獻總表，不會換算成台幣社費。"}
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setEditingCell(null)}
                className={`min-h-14 rounded-2xl bg-[#F8F3E8] font-black ${buttonShadow}`}
              >
                取消
              </button>
              <button
                type="button"
                disabled={savingPlanId === editingCell.plan.id}
                onClick={() =>
                  void updateQuantity(
                    editingCell.member,
                    editingCell.plan,
                    editingCell.quantity
                  )
                }
                className={`min-h-14 rounded-2xl bg-[#F7C948] text-xl font-black disabled:opacity-50 ${buttonShadow}`}
              >
                {savingPlanId === editingCell.plan.id ? "儲存中…" : "確認儲存"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {selectedPlan ? (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#0D2447]/60 p-0 sm:items-center sm:p-5"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSelectedPlan(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-detail-title"
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-[28px] sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-extrabold text-[#A46D00]">
                  {selectedPlan.category}
                </p>
                <h2 id="plan-detail-title" className="mt-1 text-2xl font-black leading-9">
                  {selectedPlan.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlan(null)}
                className={`shrink-0 rounded-2xl bg-[#F8F3E8] px-4 py-3 font-black ${buttonShadow}`}
              >
                關閉
              </button>
            </div>
            <div className="mt-5 rounded-2xl bg-[#FFF7D6] p-5">
              <p className="text-sm font-extrabold text-[#A46D00]">每 1 單位</p>
              <p className="mt-1 text-3xl font-black">
                {selectedPlan.unitAmount > 0
                  ? formatPlanAmount(selectedPlan, selectedPlan.unitAmount)
                  : "尚未設定"}
              </p>
              {selectedPlan.unitAmount <= 0 ? (
                <p className="mt-2 font-semibold leading-7 text-[#173B73]/75">
                  執行秘書設定單位金額後，社友才能選擇單位並以代收款加入當月社費。
                </p>
              ) : null}
            </div>
            <div className="mt-5">
              <h3 className="text-lg font-black">計畫簡介</h3>
              <p className="mt-2 whitespace-pre-wrap font-semibold leading-8 text-[#173B73]/80">
                {selectedPlan.description || "尚未提供計畫簡介。"}
              </p>
            </div>
            {selectedPlan.sourceUrl ? (
              <a
                href={selectedPlan.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex min-h-12 items-center rounded-2xl bg-[#F8F3E8] px-5 font-black text-[#173B73] underline underline-offset-4"
              >
                {selectedPlan.sourceLabel || "查看官方資料來源"}
              </a>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Metric({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl p-4 shadow-[5px_5px_14px_rgba(0,0,0,0.08),-4px_-4px_12px_rgba(255,255,255,0.9)] sm:p-5 ${
        warning ? "bg-[#FFE1DC]" : "bg-white"
      }`}
    >
      <p className="text-sm font-bold text-[#173B73]/65">{label}</p>
      <p className="mt-1 text-xl font-black sm:text-2xl">{value}</p>
    </article>
  );
}

function mapPlanRow(row: DonationPlanRow): DonationPlan {
  return {
    id: row.id,
    category: normalizeCategory(row.category),
    title: row.title ?? "",
    description: row.description ?? "",
    suggestedAmountText: row.suggested_amount_text ?? "",
    unitAmount: Number(row.unit_amount) || 0,
    currency: row.currency || "TWD",
    targetUnits: Number(row.target_units) || 0,
    sourceLabel: row.source_label ?? "",
    sourceUrl: row.source_url ?? "",
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    status: row.status === "closed" ? "closed" : "open",
    sortOrder: Number(row.sort_order) || 1,
  };
}

function mapRecordRow(row: DonationRecordRow): BoardRecord {
  return {
    id: row.id,
    planId: row.plan_id,
    memberId: row.member_id ?? "",
    donorName: row.donor_name?.trim() ?? "",
    amount: Number(row.amount) || 0,
    quantity: Number(row.quantity) || 0,
    unitAmount: Number(row.unit_amount) || 0,
    billingMonth: row.billing_month ?? "",
    paymentStatus: row.payment_status === "received" ? "received" : "pending",
  };
}

function normalizeCategory(category: string): DonationCategory {
  if (category === "全球計畫" || category === "global") return "全球計畫";
  if (category === "地區計畫" || category === "district") return "地區計畫";
  return "社內計畫";
}

function inferQuantity(amount: number, unitAmount: number) {
  if (unitAmount <= 0 || amount <= 0 || amount % unitAmount !== 0) return 0;
  return amount / unitAmount;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function formatTwd(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPlanAmount(plan: DonationPlan, value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: plan.currency === "USD" ? "USD" : "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

