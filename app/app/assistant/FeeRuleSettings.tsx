"use client";

import { useEffect, useState } from "react";
import { RotaryYear } from "@/lib/events";
import {
  feeConditionLabel,
  feeTypeLabel,
  FeeType,
  MemberFeeRule,
  memberRoleOptions,
  MemberRoleType,
} from "@/lib/memberFeeRules";
import { fetchMemberFeeRules, upsertMemberFeeRule } from "@/lib/supabaseData";

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

export default function FeeRuleSettings({
  years,
  onRulesChanged,
}: {
  years: RotaryYear[];
  onRulesChanged: () => void;
}) {
  const activeYear = years.find((year) => year.isActive) ?? years[0];
  const [selectedYearId, setSelectedYearId] = useState("");
  const [rules, setRules] = useState<MemberFeeRule[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [newFeeType, setNewFeeType] = useState<FeeType>("special_donation");
  const [newRoleType, setNewRoleType] = useState<MemberRoleType>("other");
  const [newAmount, setNewAmount] = useState(0);
  const [newPriority, setNewPriority] = useState(70);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const yearId = selectedYearId || activeYear?.id || "";

  useEffect(() => {
    if (!yearId || !isOpen) return;
    async function loadRules() {
      setErrorMessage("");
      try {
        setRules(await fetchMemberFeeRules(yearId));
      } catch (error) {
        setErrorMessage(`費率規則讀取失敗：${getErrorMessage(error)}`);
      }
    }
    void loadRules();
  }, [isOpen, yearId]);

  function updateRule(id: string, patch: Partial<MemberFeeRule>) {
    setRules((current) => current.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  }

  async function saveRule(rule: MemberFeeRule) {
    setMessage("");
    setErrorMessage("");
    if (!Number.isInteger(rule.amount) || rule.amount < 0) {
      setErrorMessage("費率金額只可輸入 0 以上整數。");
      return;
    }
    try {
      const saved = await upsertMemberFeeRule(rule);
      setRules((current) => current.map((item) => item.id === saved.id ? saved : item));
      setMessage(`${feeTypeLabel(saved.feeType)}費率已儲存。`);
      onRulesChanged();
    } catch (error) {
      setErrorMessage(`費率規則儲存失敗：${getErrorMessage(error)}`);
    }
  }

  async function addRoleRule() {
    setMessage("");
    setErrorMessage("");
    if (!yearId) {
      setErrorMessage("請先選擇扶輪年度。");
      return;
    }
    if (newRoleType === "other") {
      setErrorMessage("請選擇可套用費率的職務。");
      return;
    }
    if (rules.some((rule) =>
      rule.feeType === newFeeType &&
      rule.conditionType === "role" &&
      rule.conditionValue === newRoleType
    )) {
      setErrorMessage("此年度、費用類型及職務的規則已存在。");
      return;
    }
    try {
      const now = new Date().toISOString();
      const saved = await upsertMemberFeeRule({
        id: "",
        rotaryYearId: yearId,
        feeType: newFeeType,
        conditionType: "role",
        conditionValue: newRoleType,
        amount: Math.max(0, Math.trunc(newAmount)),
        priority: Math.max(0, Math.trunc(newPriority)),
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      setRules((current) => [...current, saved].sort((a, b) => a.priority - b.priority));
      setMessage("職務費率規則已新增。");
      onRulesChanged();
    } catch (error) {
      setErrorMessage(`費率規則新增失敗：${getErrorMessage(error)}`);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-[#173B73]/15 bg-white p-4">
      <button type="button" onClick={() => setIsOpen((value) => !value)}
        className={`w-full rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}>
        {isOpen ? "收合社費費率規則" : "社費費率規則設定"}
      </button>
      {isOpen ? (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-[#173B73]/70">
            每月批次依計費月份 1 日的長假、資深與職務狀態，按優先順序套用費率。
          </p>
          <label className="block">
            <span className="text-sm font-bold">扶輪年度</span>
            <select value={yearId} onChange={(event) => setSelectedYearId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#E5D9BD] bg-white px-3 py-3">
              {years.map((year) => <option key={year.id} value={year.id}>{year.displayName || year.name}</option>)}
            </select>
          </label>
          {errorMessage ? <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{errorMessage}</p> : null}
          {message ? <p className="rounded-xl bg-green-50 p-3 text-sm font-bold text-green-700">{message}</p> : null}
          <div className="space-y-3">
            {rules.map((rule) => (
              <article key={rule.id} className="rounded-xl bg-[#F8F3E8] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{feeTypeLabel(rule.feeType)} · {feeConditionLabel(rule)}</p>
                  <label className="flex items-center gap-2 text-xs font-bold">
                    <input type="checkbox" checked={rule.isActive}
                      onChange={(event) => updateRule(rule.id, { isActive: event.target.checked })} />
                    啟用
                  </label>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-xs font-bold">
                    金額
                    <input type="number" min="0" step="1" value={rule.amount}
                      onChange={(event) => updateRule(rule.id, { amount: Number(event.target.value) || 0 })}
                      className="mt-1 w-full rounded-xl border border-[#E5D9BD] bg-white px-3 py-2 text-base" />
                  </label>
                  <label className="text-xs font-bold">
                    優先順序
                    <input type="number" min="0" step="1" value={rule.priority}
                      onChange={(event) => updateRule(rule.id, { priority: Number(event.target.value) || 0 })}
                      className="mt-1 w-full rounded-xl border border-[#E5D9BD] bg-white px-3 py-2 text-base" />
                  </label>
                </div>
                <button type="button" onClick={() => saveRule(rule)}
                  className={`mt-3 w-full rounded-xl bg-[#F7C948] py-2 text-sm font-bold ${buttonShadow}`}>
                  儲存此規則
                </button>
              </article>
            ))}
          </div>
          <div className="space-y-3 rounded-xl border border-[#173B73]/15 p-3">
            <h3 className="font-bold">新增職務費率</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select value={newFeeType} onChange={(event) => setNewFeeType(event.target.value as FeeType)}
                className="rounded-xl border border-[#E5D9BD] bg-white px-3 py-3">
                <option value="annual_fee">常年費</option>
                <option value="special_donation">特別捐</option>
              </select>
              <select value={newRoleType} onChange={(event) => setNewRoleType(event.target.value as MemberRoleType)}
                className="rounded-xl border border-[#E5D9BD] bg-white px-3 py-3">
                {memberRoleOptions.filter((item) => !["senior_member"].includes(item.value))
                  .map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <input aria-label="新增費率金額" type="number" min="0" step="1" value={newAmount}
                onChange={(event) => setNewAmount(Number(event.target.value) || 0)}
                className="rounded-xl border border-[#E5D9BD] bg-white px-3 py-3" />
              <input aria-label="新增費率優先順序" type="number" min="0" step="1" value={newPriority}
                onChange={(event) => setNewPriority(Number(event.target.value) || 0)}
                className="rounded-xl border border-[#E5D9BD] bg-white px-3 py-3" />
            </div>
            <button type="button" onClick={addRoleRule}
              className={`w-full rounded-xl bg-[#F7C948] py-3 text-sm font-bold ${buttonShadow}`}>
              新增費率規則
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) return String(error.message);
  return "未知錯誤";
}
