"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  DuesLineItem,
  DuesRecord,
  emptyDuesRecord,
  getDisplayDuesBalance,
  PaymentMethod,
} from "@/lib/dues";
import { defaultEventTimes, emptyEventItem, EventItem, RotaryYear } from "@/lib/events";
import {
  isMemberOnLeaveDuringMonth,
  MemberLeavePeriod,
} from "@/lib/memberLeave";
import { formatMemberName, Member } from "@/lib/members";
import {
  fetchDuesRecords,
  fetchEvents,
  fetchMemberLeavePeriods,
  fetchMembers,
  fetchRotaryYears,
  upsertDuesRecord,
  upsertEvent,
} from "@/lib/supabaseData";

type ParsedEvent = {
  event_type: string;
  event_name: string;
  meeting_no: string;
  date: string;
  dinner_time: string;
  meeting_time: string;
  end_time: string;
  location: string;
  speaker: string;
  topic: string;
  fellowship_chair: string;
  sergeant_at_arms: string;
  description: string;
  note: string;
  warnings: string[];
};

type AssistantField =
  | "rotaryYearId"
  | "eventType"
  | "title"
  | "meetingNo"
  | "date"
  | "dinnerTime"
  | "meetingTime"
  | "endTime"
  | "location"
  | "speaker"
  | "topic"
  | "fellowshipChair"
  | "sergeantAtArms"
  | "description"
  | "note";

type OpenSection = "event" | "unpaid" | "memberDues" | "batch" | "";

type UnpaidRow = {
  record: DuesRecord;
  member: Member | undefined;
  balance: number;
};

type BatchRow = {
  member: Member;
  selected: boolean;
  exists: boolean;
  previousBalance: number;
  meal: number;
  annualFee: number;
  specialDonation: number;
  redBox: number;
  rotaryFoundation: number;
  passThrough: number;
  leavePeriod?: MemberLeavePeriod;
};

type BatchMoneyField =
  | "previousBalance"
  | "meal"
  | "annualFee"
  | "specialDonation"
  | "redBox"
  | "rotaryFoundation"
  | "passThrough";

type SummaryRow = {
  record: DuesRecord;
  member: Member | undefined;
  meal: number;
  annualFee: number;
  specialDonation: number;
  redBox: number;
  rotaryFoundation: number;
  passThrough: number;
  currentDue: number;
  balance: number;
};

type MemberDuesFilter = "all" | "unpaid" | "paid";

type MemberDuesRangeBundle = {
  member: Member;
  rows: SummaryRow[];
};

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

const sampleText = `7/22 第426次例會，主講人王大明，主題 AI 與產業趨勢
餐敘 18:30
開會 19:15
結束 20:10
地點：翰品酒店 B1`;

export default function AssistantPage() {
  const defaultMonth = useMemo(() => getPreviousMonth(), []);
  const [openSection, setOpenSection] = useState<OpenSection>("");
  const [years, setYears] = useState<RotaryYear[]>([]);
  const [inputText, setInputText] = useState("");
  const [form, setForm] = useState<Omit<EventItem, "id">>({
    ...emptyEventItem,
    ...defaultEventTimes,
  });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const currentMonth = useMemo(() => getCurrentMonth(), []);
  const [members, setMembers] = useState<Member[]>([]);
  const [unpaidMonth, setUnpaidMonth] = useState(defaultMonth);
  const [unpaidRows, setUnpaidRows] = useState<UnpaidRow[]>([]);

  const [batchMonth, setBatchMonth] = useState(defaultMonth);
  const [summaryMonth, setSummaryMonth] = useState(defaultMonth);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [memberDuesStartMonth, setMemberDuesStartMonth] = useState("");
  const [memberDuesEndMonth, setMemberDuesEndMonth] = useState(currentMonth);
  const [memberDuesFilter, setMemberDuesFilter] = useState<MemberDuesFilter>("all");
  const [memberDuesRows, setMemberDuesRows] = useState<SummaryRow[]>([]);
  const [expandedMemberDuesMonths, setExpandedMemberDuesMonths] = useState<string[]>([]);
  const [batchExportStartMonth, setBatchExportStartMonth] = useState("");
  const [batchExportEndMonth, setBatchExportEndMonth] = useState(currentMonth);
  const [includeNoRecordMembers, setIncludeNoRecordMembers] = useState(false);
  const [batchExportBundles, setBatchExportBundles] = useState<MemberDuesRangeBundle[]>([]);
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);
  const [summaryRows, setSummaryRows] = useState<SummaryRow[]>([]);
  const [batchMessage, setBatchMessage] = useState("");
  const [batchProgress, setBatchProgress] = useState("");

  const activeYear = useMemo(
    () => years.find((year) => year.isActive) ?? years[0],
    [years]
  );

  const unpaidTotal = unpaidRows.reduce((total, row) => total + row.balance, 0);
  const summaryTotals = calculateSummaryTotals(summaryRows);

  const searchedMembers = useMemo(() => {
    const keyword = memberSearch.trim().toLowerCase();
    if (!keyword) return members;
    return members.filter((member) =>
      [member.chineseName, member.rotaryName]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(keyword))
    );
  }, [memberSearch, members]);

  const filteredMemberDuesRows = useMemo(() => {
    if (memberDuesFilter === "unpaid") {
      return memberDuesRows.filter((row) => row.balance > 0);
    }
    if (memberDuesFilter === "paid") {
      return memberDuesRows.filter((row) => row.balance <= 0);
    }
    return memberDuesRows;
  }, [memberDuesFilter, memberDuesRows]);

  const memberDuesTotals = useMemo(
    () => calculateSummaryTotals(filteredMemberDuesRows),
    [filteredMemberDuesRows]
  );

  useEffect(() => {
    async function loadYears() {
      try {
        const [loadedYears, loadedMembers] = await Promise.all([
          fetchRotaryYears(),
          fetchMembers(),
        ]);
        setYears(loadedYears);
        setMembers(loadedMembers);
        const active = loadedYears.find((year) => year.isActive) ?? loadedYears[0];
        if (active) {
          setForm((currentForm) => ({ ...currentForm, rotaryYearId: active.id }));
          const startMonth = getRotaryYearStartMonth(active, currentMonth);
          setMemberDuesStartMonth(startMonth);
          setBatchExportStartMonth(startMonth);
        }
      } catch (error) {
        console.error(error);
        setErrorMessage(
          error instanceof Error ? `年度與社友資料讀取失敗：${error.message}` : "年度與社友資料讀取失敗"
        );
      }
    }

    void loadYears();
  }, [currentMonth]);

  function toggleSection(section: OpenSection) {
    setOpenSection((currentSection) => (currentSection === section ? "" : section));
  }

  function updateField(field: AssistantField, value: string) {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  }

  async function handleParse() {
    setErrorMessage("");
    setMessage("");
    setIsParsing(true);

    try {
      const response = await fetch("/api/assistant/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputText,
          activeYear: activeYear
            ? {
                name: activeYear.name,
                displayName: activeYear.displayName,
                startDate: activeYear.startDate,
                endDate: activeYear.endDate,
              }
            : undefined,
        }),
      });
      const result = (await response.json()) as { event?: ParsedEvent; error?: string };
      if (!response.ok || !result.event) {
        throw new Error(result.error || "AI 解析失敗");
      }

      const parsed = result.event;
      const nextForm = {
        ...emptyEventItem,
        ...defaultEventTimes,
        rotaryYearId: activeYear?.id || "",
        eventType: parsed.event_type || "靘?",
        title: parsed.event_name,
        meetingNo: parsed.meeting_no,
        date: parsed.date,
        dinnerTime: parsed.dinner_time || defaultEventTimes.dinnerTime,
        meetingTime: parsed.meeting_time || defaultEventTimes.meetingTime,
        endTime: parsed.end_time || defaultEventTimes.endTime,
        location: parsed.location,
        speaker: parsed.speaker,
        topic: parsed.topic,
        fellowshipChair: parsed.fellowship_chair,
        sergeantAtArms: parsed.sergeant_at_arms,
        description: parsed.description,
        note: parsed.note,
      };
      setForm(nextForm);
      setWarnings(buildWarnings(nextForm, parsed.warnings));
      setMessage("AI 已整理活動資訊，請確認後再儲存。");
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "AI 解析失敗");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setMessage("");
    const requiredWarnings = buildRequiredWarnings(form);
    setWarnings(mergeWarnings(warnings, requiredWarnings));
    if (requiredWarnings.length > 0) {
      setErrorMessage("請先補齊必要欄位，再儲存活動。");
      return;
    }

    try {
      setIsSaving(true);
      const events = await fetchEvents();
      const duplicatedEvent = events.find(
        (eventItem) =>
          eventItem.date === form.date &&
          eventItem.meetingNo &&
          form.meetingNo &&
          eventItem.meetingNo === form.meetingNo
      );
      if (duplicatedEvent) {
        setErrorMessage(`同日期同例會次數已存在活動：${duplicatedEvent.title}`);
        return;
      }

      await upsertEvent({ ...form, id: crypto.randomUUID() });
      setMessage("活動已儲存。");
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? `活動儲存失敗：${error.message}` : "活動儲存失敗");
    } finally {
      setIsSaving(false);
    }
  }

  async function queryUnpaidRecords() {
    setErrorMessage("");
    setMessage("");

    try {
      const [members, records] = await Promise.all([fetchMembers(), fetchDuesRecords()]);
      const rows = records
        .filter((record) => record.periodMonth === unpaidMonth)
        .map((record) => ({
          record,
          member: members.find((member) => member.id === record.memberId),
          balance: getDisplayDuesBalance(record),
        }))
        .filter((row) => row.balance > 0)
        .sort((firstRow, secondRow) => secondRow.balance - firstRow.balance);
      setUnpaidRows(rows);
      setMessage(`已查詢 ${unpaidMonth} 未匯款社費。`);
    } catch (error) {
      console.error(error);
      setErrorMessage(getErrorMessage(error, "未匯款社費查詢失敗"));
    }
  }

  async function queryMemberDuesRange() {
    setErrorMessage("");
    setMessage("");

    if (!selectedMemberId) {
      setErrorMessage("請先選擇社友。");
      return;
    }
    if (!memberDuesStartMonth || !memberDuesEndMonth) {
      setErrorMessage("請選擇起始月份與結束月份。");
      return;
    }
    if (memberDuesStartMonth > memberDuesEndMonth) {
      setErrorMessage("起始月份不可晚於結束月份。");
      return;
    }

    try {
      const [loadedMembers, records] = await Promise.all([
        members.length > 0 ? Promise.resolve(members) : fetchMembers(),
        fetchDuesRecords(),
      ]);
      if (members.length === 0) setMembers(loadedMembers);
      const member = loadedMembers.find((item) => item.id === selectedMemberId);
      const rows = buildMemberDuesRows(
        records,
        loadedMembers,
        selectedMemberId,
        memberDuesStartMonth,
        memberDuesEndMonth
      );
      setMemberDuesRows(rows);
      setExpandedMemberDuesMonths([]);
      setMessage(
        `已查詢 ${member ? formatMemberName(member) : "社友"} ${memberDuesStartMonth} 至 ${memberDuesEndMonth} 社費明細。`
      );
    } catch (error) {
      console.error(error);
      setErrorMessage(getErrorMessage(error, "社友個人社費明細查詢失敗"));
    }
  }

  function toggleMemberDuesMonth(recordId: string) {
    setExpandedMemberDuesMonths((currentIds) =>
      currentIds.includes(recordId)
        ? currentIds.filter((id) => id !== recordId)
        : [...currentIds, recordId]
    );
  }

  async function exportMemberDuesRangeJpg() {
    if (!selectedMemberId) {
      setErrorMessage("請先選擇社友。");
      return;
    }
    if (filteredMemberDuesRows.length === 0) {
      setErrorMessage("目前沒有可匯出的社費明細。");
      return;
    }

    const member = members.find((item) => item.id === selectedMemberId);
    const memberName = member ? formatMemberName(member) : "未知社友";
    const element = createMemberRangeExportElement(
      memberName,
      memberDuesStartMonth,
      memberDuesEndMonth,
      filteredMemberDuesRows
    );
    try {
      await downloadMemberRangeJpg(
        element,
        `高雄晨光扶輪社_社費明細_${sanitizeFilename(memberName).replaceAll("_", "")}_${memberDuesStartMonth}至${memberDuesEndMonth}.jpg`
      );
    } catch (error) {
      console.error(error);
      setErrorMessage(getErrorMessage(error, "區間社費明細 JPG 匯出失敗"));
    } finally {
      element.remove();
    }
  }

  async function buildBatchPreview() {
    setErrorMessage("");
    setBatchMessage("");
    setBatchProgress("");

    try {
      const [members, records, leavePeriods] = await Promise.all([
        fetchMembers(),
        fetchDuesRecords(),
        fetchMemberLeavePeriods(),
      ]);
      const activeMembers = members.filter((member) => member.status !== "inactive");
      const rows = activeMembers.map((member) => {
        const existingRecord = records.some(
          (record) => record.memberId === member.id && record.periodMonth === batchMonth
        );
        const leaveStatus = isMemberOnLeaveDuringMonth(
          member.id,
          batchMonth,
          leavePeriods
        );
        return {
          member,
          selected: !existingRecord,
          exists: existingRecord,
          previousBalance: findPreviousBalance(member.id, batchMonth, records),
          meal: 0,
          annualFee: leaveStatus.isOnLeave
            ? leaveStatus.annualFeeAmount || 1000
            : 0,
          specialDonation: 0,
          redBox: 0,
          rotaryFoundation: 270,
          passThrough: 0,
          leavePeriod: leaveStatus.leavePeriod,
        };
      });
      setBatchRows(rows);
      setBatchMessage(`已產生 ${batchMonth} 批次預覽，請確認後再建立。`);
    } catch (error) {
      console.error(error);
      setErrorMessage(getErrorMessage(error, "批次預覽建立失敗"));
    }
  }

  function updateBatchRow(memberId: string, patch: Partial<BatchRow>) {
    setBatchRows((currentRows) =>
      currentRows.map((row) => (row.member.id === memberId ? { ...row, ...patch } : row))
    );
  }

  function updateBatchMoney(memberId: string, field: BatchMoneyField, value: string) {
    updateBatchRow(memberId, { [field]: Number(value) || 0 } as Partial<BatchRow>);
  }

  async function confirmCreateBatch() {
    const confirmedRows = batchRows.filter((row) => row.selected && !row.exists);
    if (confirmedRows.length === 0) {
      setErrorMessage("沒有可建立的社費紀錄。");
      return;
    }

    const confirmed = window.confirm(`即將建立 ${confirmedRows.length} 位社友的 ${batchMonth} 社費紀錄。`);
    if (!confirmed) return;

    setErrorMessage("");
    setBatchMessage("");
    setBatchProgress("");

    let successCount = 0;
    let skippedCount = batchRows.filter((row) => row.exists).length;
    let failedCount = 0;
    const latestRecords = await fetchDuesRecords();
    const nextRecords = [...latestRecords];

    for (const [index, row] of confirmedRows.entries()) {
      setBatchProgress(`正在建立 ${index + 1} / ${confirmedRows.length}`);
      const alreadyExists = nextRecords.some(
        (record) => record.memberId === row.member.id && record.periodMonth === batchMonth
      );
      if (alreadyExists) {
        skippedCount += 1;
        continue;
      }

      try {
        const record = buildDuesRecordFromBatchRow(row, batchMonth);
        const savedRecord = await upsertDuesRecord(record, record.lineItems);
        nextRecords.push(savedRecord);
        successCount += 1;
      } catch (error) {
        console.error(error);
        failedCount += 1;
      }
    }

    setBatchRows((currentRows) =>
      currentRows.map((row) =>
        row.selected && !row.exists ? { ...row, selected: false, exists: true } : row
      )
    );
    setBatchProgress("");
    setBatchMessage(
      `批次建立完成：新增 ${successCount} 筆，已存在略過 ${skippedCount} 筆，失敗 ${failedCount} 筆。`
    );
  }

  async function loadMonthlySummary() {
    setErrorMessage("");
    setBatchMessage("");

    try {
      const [members, records] = await Promise.all([fetchMembers(), fetchDuesRecords()]);
      const rows = records
        .filter((record) => record.periodMonth === summaryMonth)
        .map((record) => ({
          record,
          member: members.find((member) => member.id === record.memberId),
          meal: sumLineItemType(record, "meal"),
          annualFee: sumLineItemType(record, "annual_fee"),
          specialDonation: sumLineItemType(record, "special_donation"),
          redBox: sumLineItemType(record, "red_box"),
          rotaryFoundation: sumLineItemType(record, "rotary_foundation"),
          passThrough: sumLineItemType(record, "pass_through"),
          currentDue: record.currentDue,
          balance: getDisplayDuesBalance(record),
        }));
      setSummaryRows(rows);
      setBatchMessage(`已載入 ${summaryMonth} 全體社友本期應繳費用總表。`);
    } catch (error) {
      console.error(error);
      setErrorMessage(getErrorMessage(error, "本期應繳費用總表讀取失敗"));
    }
  }

  function clearAll() {
    setInputText("");
    setForm({ ...emptyEventItem, ...defaultEventTimes, rotaryYearId: activeYear?.id || "" });
    setWarnings([]);
    setMessage("");
    setErrorMessage("");
  }

  async function loadBatchExportMembers() {
    setErrorMessage("");
    setBatchMessage("");
    setBatchProgress("");

    if (!batchExportStartMonth || !batchExportEndMonth) {
      setErrorMessage("請選擇批次匯出的起始月份與結束月份。");
      return [];
    }
    if (batchExportStartMonth > batchExportEndMonth) {
      setErrorMessage("批次匯出起始月份不可晚於結束月份。");
      return [];
    }

    try {
      const [loadedMembers, records] = await Promise.all([
        members.length > 0 ? Promise.resolve(members) : fetchMembers(),
        fetchDuesRecords(),
      ]);
      if (members.length === 0) setMembers(loadedMembers);
      const bundles = buildMemberDuesBundles(
        loadedMembers,
        records,
        batchExportStartMonth,
        batchExportEndMonth,
        includeNoRecordMembers
      );
      setBatchExportBundles(bundles);
      setBatchMessage(`已載入 ${bundles.length} 位社友可匯出區間社費明細。`);
      return bundles;
    } catch (error) {
      console.error(error);
      setErrorMessage(getErrorMessage(error, "批次匯出名單載入失敗"));
      return [];
    }
  }

  async function exportBatchJpg() {
    const bundles =
      batchExportBundles.length > 0 ? batchExportBundles : await loadBatchExportMembers();
    if (bundles.length === 0) {
      setErrorMessage("目前沒有可匯出的社費明細。");
      return;
    }

    const confirmed = window.confirm(
      `即將逐張下載 ${bundles.length} 位社友的區間社費明細 JPG。若瀏覽器阻擋多檔下載，請允許本網站下載多個檔案。`
    );
    if (!confirmed) return;

    setBatchMessage("開始逐張產出 JPG。若瀏覽器跳出多檔下載提醒，請選擇允許。");

    for (const [index, bundle] of bundles.entries()) {
      setBatchProgress(`正在產出 ${index + 1} / ${bundles.length}`);
      const memberName = formatMemberName(bundle.member);
      const element = createMemberRangeExportElement(
        memberName,
        batchExportStartMonth,
        batchExportEndMonth,
        bundle.rows
      );
      try {
        await downloadMemberRangeJpg(
          element,
          `高雄晨光扶輪社_社費明細_${sanitizeFilename(memberName).replaceAll("_", "")}_${batchExportStartMonth}至${batchExportEndMonth}.jpg`
        );
      } catch (error) {
        console.error(error);
        setErrorMessage(getErrorMessage(error, "批次 JPG 匯出失敗"));
      } finally {
        element.remove();
      }
      await waitForBrowser();
    }

    setBatchProgress("");
    setBatchMessage(`已完成 ${bundles.length} 位社友區間社費明細 JPG 匯出。`);
  }

  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #monthly-dues-summary,
          #monthly-dues-summary * {
            visibility: visible;
          }
          #monthly-dues-summary {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
      <section className="mx-auto max-w-md space-y-6">
        <header className="space-y-3">
          <Link href="/" className="text-sm font-bold text-[#173B73]/75">
            回首頁
          </Link>
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-[#C99700]">
              Rotary OS
            </p>
            <h1 className="mt-2 text-3xl font-bold">Jade AI 助理</h1>
            <p className="mt-2 text-sm font-semibold text-[#173B73]/70">
              貼上活動文字、查詢社費、建立每月社費批次，並匯出社友個人社費明細。
            </p>
          </div>
        </header>

        {message ? (
          <p className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-700">
            {message}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <AssistantSection
          title="智慧建立活動"
          isOpen={openSection === "event"}
          onToggle={() => toggleSection("event")}
        >
          <section className="space-y-4">
            <label className="block">
              <span className="text-sm font-bold">活動文字貼上區</span>
              <textarea
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                placeholder={sampleText}
                rows={9}
                className="mt-2 w-full resize-none rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base text-[#173B73] outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleParse}
                disabled={isParsing || inputText.trim() === ""}
                className={`rounded-2xl bg-[#F7C948] py-4 font-bold disabled:opacity-60 ${buttonShadow}`}
              >
                {isParsing ? "AI 整理中..." : "AI 整理活動"}
              </button>
              <button
                type="button"
                onClick={clearAll}
                className={`rounded-2xl bg-white py-4 font-bold ${buttonShadow}`}
              >
                清除
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <p className="text-sm font-bold text-[#C99700]">活動整理結果</p>
                <h2 className="mt-1 text-2xl font-bold">AI 整理欄位</h2>
              </div>

              {warnings.length > 0 ? (
                <div className="rounded-2xl bg-[#FFF6D6] p-4 text-sm font-bold text-[#173B73]">
                  {warnings.map((warning) => (
                    <p key={warning}>- {warning}</p>
                  ))}
                </div>
              ) : null}

              <label className="block">
                <span className="text-sm font-bold">年度</span>
                <select
                  value={form.rotaryYearId}
                  onChange={(event) => updateField("rotaryYearId", event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                >
                  <option value="">請選擇年度</option>
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>
                      {year.displayName || year.name}
                    </option>
                  ))}
                </select>
              </label>

              <AssistantInput label="活動類型" value={form.eventType} onChange={(value) => updateField("eventType", value)} />
              <AssistantInput label="活動名稱" value={form.title} onChange={(value) => updateField("title", value)} />
              <AssistantInput label="例會次數" value={form.meetingNo} onChange={(value) => updateField("meetingNo", value)} inputMode="numeric" />
              <AssistantInput label="日期" value={form.date} onChange={(value) => updateField("date", value)} type="date" />
              <div className="grid grid-cols-3 gap-2">
                <AssistantInput label="餐敘" value={form.dinnerTime} onChange={(value) => updateField("dinnerTime", value)} type="time" />
                <AssistantInput label="開會" value={form.meetingTime} onChange={(value) => updateField("meetingTime", value)} type="time" />
                <AssistantInput label="結束" value={form.endTime} onChange={(value) => updateField("endTime", value)} type="time" />
              </div>
              <AssistantInput label="地點" value={form.location} onChange={(value) => updateField("location", value)} />
              <AssistantInput label="主講人" value={form.speaker} onChange={(value) => updateField("speaker", value)} />
              <AssistantInput label="主題" value={form.topic} onChange={(value) => updateField("topic", value)} />
              <AssistantInput label="聯誼長" value={form.fellowshipChair} onChange={(value) => updateField("fellowshipChair", value)} />
              <AssistantInput label="糾察長" value={form.sergeantAtArms} onChange={(value) => updateField("sergeantAtArms", value)} />
              <AssistantTextarea label="活動說明" value={form.description} onChange={(value) => updateField("description", value)} />
              <AssistantTextarea label="備註" value={form.note} onChange={(value) => updateField("note", value)} />

              <button
                type="submit"
                disabled={isSaving}
                className={`w-full rounded-2xl bg-[#F7C948] py-4 font-bold disabled:opacity-60 ${buttonShadow}`}
              >
                {isSaving ? "儲存中..." : "儲存活動"}
              </button>
            </form>
          </section>
        </AssistantSection>

        <AssistantSection
          title="未繳社費查詢"
          isOpen={openSection === "unpaid"}
          onToggle={() => toggleSection("unpaid")}
        >
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-bold">查詢月份</span>
              <input
                type="month"
                value={unpaidMonth}
                onChange={(event) => setUnpaidMonth(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={queryUnpaidRecords} className={`rounded-2xl bg-[#F7C948] py-3 font-bold ${buttonShadow}`}>
                查詢
              </button>
              <button type="button" onClick={() => exportUnpaidCsv(unpaidMonth, unpaidRows)} className={`rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}>
                匯出 CSV
              </button>
            </div>
            <div className="rounded-2xl bg-[#F8F3E8] p-4 font-bold">
              <p>查詢月份：{unpaidMonth || "-"}</p>
              <p>未匯款社友人數：{unpaidRows.length}</p>
              <p>本期應繳總額：{formatCurrency(unpaidTotal)}</p>
            </div>
            <div className="space-y-3">
              {unpaidRows.map((row) => (
                <article key={row.record.id} className="rounded-2xl bg-white p-4 text-sm font-semibold">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-lg font-bold">
                        {row.member?.chineseName || "未知社友"} {row.member?.rotaryName || ""}
                      </p>
                      <p>前期未繳：{formatCurrency(row.record.previousBalance)}</p>
                      <p>本期應繳：{formatCurrency(row.record.currentDue)}</p>
                      <p>已繳費用：{formatCurrency(row.record.paidAmount)}</p>
                      <p>繳費方式：{row.record.paymentMethod}</p>
                      <p>繳費日期：{row.record.paymentDate || "-"}</p>
                    </div>
                    <p className="shrink-0 rounded-full bg-[#F47C6C] px-3 py-1 font-bold text-white">
                      {formatCurrency(row.balance)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </AssistantSection>

        <AssistantSection
          title="社友個人社費明細"
          isOpen={openSection === "memberDues"}
          onToggle={() => toggleSection("memberDues")}
        >
          <div className="space-y-4">
            <div className="space-y-3 rounded-2xl bg-[#F8F3E8] p-4">
              <label className="block">
                <span className="text-sm font-bold">搜尋社友</span>
                <input
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  placeholder="輸入中文姓名或社名"
                  className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold">社友</span>
                <select
                  value={selectedMemberId}
                  onChange={(event) => setSelectedMemberId(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                >
                  <option value="">請選擇社友</option>
                  {searchedMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {formatMemberName(member)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-bold">起始月份</span>
                  <input
                    type="month"
                    value={memberDuesStartMonth}
                    onChange={(event) => setMemberDuesStartMonth(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold">結束月份</span>
                  <input
                    type="month"
                    value={memberDuesEndMonth}
                    onChange={(event) => setMemberDuesEndMonth(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-sm font-bold">結果篩選</span>
                <select
                  value={memberDuesFilter}
                  onChange={(event) => setMemberDuesFilter(event.target.value as MemberDuesFilter)}
                  className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                >
                  <option value="all">全部月份</option>
                  <option value="unpaid">未匯款月份</option>
                  <option value="paid">已繳清月份</option>
                </select>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button type="button" onClick={queryMemberDuesRange} className={`rounded-2xl bg-[#F7C948] py-3 font-bold ${buttonShadow}`}>
                  查詢社費明細
                </button>
                <button type="button" onClick={() => void exportMemberDuesRangeJpg()} className={`rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}>
                  匯出區間社費明細 JPG
                </button>
              </div>
            </div>

            {memberDuesRows.length > 0 ? (
              <div className="rounded-2xl bg-white p-4 text-sm font-bold">
                <p>查詢月份數：{filteredMemberDuesRows.length}</p>
                <p>前期未繳合計：{formatCurrency(memberDuesTotals.previousBalance)}</p>
                <p>餐費合計：{formatCurrency(memberDuesTotals.meal)}</p>
                <p>常年費合計：{formatCurrency(memberDuesTotals.annualFee)}</p>
                <p>特別捐合計：{formatCurrency(memberDuesTotals.specialDonation)}</p>
                <p>紅箱合計：{formatCurrency(memberDuesTotals.redBox)}</p>
                <p>扶輪基金合計：{formatCurrency(memberDuesTotals.rotaryFoundation)}</p>
                <p>代收付合計：{formatCurrency(memberDuesTotals.passThrough)}</p>
                <p>本期應繳合計：{formatCurrency(memberDuesTotals.currentDue)}</p>
                <p>已繳費用合計：{formatCurrency(memberDuesTotals.paidAmount)}</p>
                <p>尚未繳清合計：{formatCurrency(memberDuesTotals.balance)}</p>
              </div>
            ) : null}

            <div className="space-y-3">
              {filteredMemberDuesRows.map((row) => {
                const isExpanded = expandedMemberDuesMonths.includes(row.record.id);
                const status = row.balance > 0 ? "未匯款" : "已繳清";
                return (
                  <article key={row.record.id} className="rounded-2xl bg-white p-4 text-sm">
                    <button
                      type="button"
                      onClick={() => toggleMemberDuesMonth(row.record.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 font-bold">
                          <p className="text-lg">{row.record.periodMonth}</p>
                          <p>本期應繳：{formatCurrency(row.currentDue)}</p>
                          <p>已繳費用：{formatCurrency(row.record.paidAmount)}</p>
                          <p>本期應繳餘額：{formatCurrency(row.balance)}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold text-white ${row.balance > 0 ? "bg-[#F47C6C]" : "bg-[#173B73]"}`}>
                          {status}
                        </span>
                      </div>
                    </button>
                    {isExpanded ? (
                      <div className="mt-3 space-y-3 border-t border-[#E5D9BD] pt-3 font-semibold">
                        <div className="grid grid-cols-2 gap-2">
                          <p>前期未繳：{formatCurrency(row.record.previousBalance)}</p>
                          <p>餐費：{formatCurrency(row.meal)}</p>
                          <p>常年費：{formatCurrency(row.annualFee)}</p>
                          <p>特別捐：{formatCurrency(row.specialDonation)}</p>
                          <p>紅箱：{formatCurrency(row.redBox)}</p>
                          <p>扶輪基金：{formatCurrency(row.rotaryFoundation)}</p>
                          <p>代收付：{formatCurrency(row.passThrough)}</p>
                          <p>繳費方式：{row.record.paymentMethod}</p>
                          <p>繳費日期：{row.record.paymentDate || "-"}</p>
                        </div>
                        <div className="space-y-2">
                          <p className="font-bold">本期社費明細</p>
                          {getStatementLineItems(row.record).map((item) => (
                            <div key={item.id} className="rounded-xl bg-[#F8F3E8] p-3">
                              <p>{item.label}：{formatCurrency(item.amount)}</p>
                              <p className="text-xs text-[#173B73]/75">{item.description || "舊資料總額"}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        </AssistantSection>
        <AssistantSection
          title="每月社費批次作業"
          isOpen={openSection === "batch"}
          onToggle={() => toggleSection("batch")}
        >
          <div className="space-y-5">
            {batchMessage ? (
              <p className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-bold text-green-700">
                {batchMessage}
              </p>
            ) : null}
            {batchProgress ? (
              <p className="rounded-2xl bg-[#FFF6D6] p-4 text-sm font-bold">
                {batchProgress}
              </p>
            ) : null}

            <section className="space-y-3 rounded-2xl bg-[#F8F3E8] p-4">
              <h2 className="text-xl font-bold">建立全體社友社費</h2>
              <label className="block">
                <span className="text-sm font-bold">批次月份</span>
                <input
                  type="month"
                  value={batchMonth}
                  onChange={(event) => setBatchMonth(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                />
              </label>
              <button type="button" onClick={buildBatchPreview} className={`w-full rounded-2xl bg-[#F7C948] py-3 font-bold ${buttonShadow}`}>
                建立全體社友社費
              </button>
              {batchRows.length > 0 ? (
                <div className="space-y-3">
                  {batchRows.map((row) => {
                    const currentDue = getBatchCurrentDue(row);
                    const expectedBalance = Math.max(0, row.previousBalance + currentDue);
                    return (
                      <article key={row.member.id} className="rounded-2xl bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex min-w-0 items-start gap-2 font-bold">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              disabled={row.exists}
                              onChange={(event) =>
                                updateBatchRow(row.member.id, { selected: event.target.checked })
                              }
                              className="mt-1"
                            />
                            <span className="break-words">{formatMemberName(row.member)}</span>
                          </label>
                          <div className="flex shrink-0 flex-col items-end gap-2">
                            {row.exists ? (
                              <span className="rounded-full bg-[#173B73] px-3 py-1 text-xs font-bold text-white">
                                已存在
                              </span>
                            ) : null}
                            {row.leavePeriod ? (
                              <span className="rounded-full bg-[#F47C6C] px-3 py-1 text-xs font-bold text-white">
                                長假常年費 {formatCurrency(row.annualFee)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                          <MoneyInput label="前期未繳" value={row.previousBalance} onChange={(value) => updateBatchMoney(row.member.id, "previousBalance", value)} />
                          <MoneyInput label="餐費" value={row.meal} onChange={(value) => updateBatchMoney(row.member.id, "meal", value)} />
                          <MoneyInput label="常年費" value={row.annualFee} onChange={(value) => updateBatchMoney(row.member.id, "annualFee", value)} />
                          <MoneyInput label="特別捐" value={row.specialDonation} onChange={(value) => updateBatchMoney(row.member.id, "specialDonation", value)} />
                          <MoneyInput label="紅箱" value={row.redBox} onChange={(value) => updateBatchMoney(row.member.id, "redBox", value)} />
                          <MoneyInput label="扶輪基金" value={row.rotaryFoundation} onChange={(value) => updateBatchMoney(row.member.id, "rotaryFoundation", value)} />
                          <MoneyInput label="代收付" value={row.passThrough} onChange={(value) => updateBatchMoney(row.member.id, "passThrough", value)} />
                          <div className="rounded-2xl bg-[#F8F3E8] px-3 py-2 font-bold">
                            <p>本期社費總計</p>
                            <p>{formatCurrency(currentDue)}</p>
                          </div>
                          <div className="rounded-2xl bg-[#F8F3E8] px-3 py-2 font-bold">
                            <p>預計本期應繳</p>
                            <p>{formatCurrency(expectedBalance)}</p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                  <button type="button" onClick={confirmCreateBatch} className={`w-full rounded-2xl bg-[#F7C948] py-4 font-bold ${buttonShadow}`}>
                    確認建立全體社費
                  </button>
                </div>
              ) : null}
            </section>

            <section className="space-y-3 rounded-2xl bg-[#F8F3E8] p-4">
              <h2 className="text-xl font-bold">全體社友本期應繳費用總表</h2>
              <label className="block">
                <span className="text-sm font-bold">總表月份</span>
                <input
                  type="month"
                  value={summaryMonth}
                  onChange={(event) => setSummaryMonth(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={loadMonthlySummary} className={`rounded-2xl bg-[#F7C948] py-3 font-bold ${buttonShadow}`}>
                  ?汗
                </button>
                <button type="button" onClick={() => exportSummaryCsv(summaryMonth, summaryRows)} className={`rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}>
                  ?臬 CSV
                </button>
                <button type="button" onClick={() => window.print()} className={`rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}>
                  ?
                </button>
              </div>
              <div className="space-y-3 rounded-2xl bg-white p-4">
                <h3 className="font-bold">批次個人通知區間匯出</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-bold">起始月份</span>
                    <input
                      type="month"
                      value={batchExportStartMonth}
                      onChange={(event) => {
                        setBatchExportStartMonth(event.target.value);
                        setBatchExportBundles([]);
                      }}
                      className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold">結束月份</span>
                    <input
                      type="month"
                      value={batchExportEndMonth}
                      onChange={(event) => {
                        setBatchExportEndMonth(event.target.value);
                        setBatchExportBundles([]);
                      }}
                      className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={includeNoRecordMembers}
                    onChange={(event) => {
                      setIncludeNoRecordMembers(event.target.checked);
                      setBatchExportBundles([]);
                    }}
                  />
                  包含無紀錄社友
                </label>
                <p className="text-sm font-bold">即將匯出人數：{batchExportBundles.length}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => void loadBatchExportMembers()} className={`rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}>
                    載入區間匯出名單
                  </button>
                  <button type="button" onClick={() => void exportBatchJpg()} className={`rounded-2xl bg-[#F7C948] py-3 font-bold ${buttonShadow}`}>
                    批次匯出全體社友區間明細 JPG
                  </button>
                </div>
                <p className="text-xs font-bold text-[#173B73]/70">
                  若瀏覽器阻擋多檔下載，請允許本網站下載多個檔案。
                </p>
              </div>
              <div id="monthly-dues-summary" className="overflow-x-auto rounded-2xl bg-white p-4">
                <h3 className="text-center text-lg font-bold">高雄晨光扶輪社</h3>
                <p className="mt-1 text-center font-bold">{formatSummaryTitleMonth(summaryMonth)}全體社友本期應繳費用總表</p>
                <table className="mt-4 min-w-[920px] w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#F8F3E8]">
                      {["社友姓名", "社名", "前期未繳", "餐費", "常年費", "特別捐", "紅箱", "扶輪基金", "代收付", "本期社費總計", "已繳費用", "本期應繳"].map((header) => (
                        <th key={header} className="border border-[#173B73]/25 px-2 py-2 text-left">{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.map((row) => (
                      <tr key={row.record.id}>
                        <td className="border border-[#173B73]/20 px-2 py-2">{row.member?.chineseName || "未知社友"}</td>
                        <td className="border border-[#173B73]/20 px-2 py-2">{row.member?.rotaryName || ""}</td>
                        <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(row.record.previousBalance)}</td>
                        <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(row.meal)}</td>
                        <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(row.annualFee)}</td>
                        <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(row.specialDonation)}</td>
                        <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(row.redBox)}</td>
                        <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(row.rotaryFoundation)}</td>
                        <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(row.passThrough)}</td>
                        <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(row.currentDue)}</td>
                        <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(row.record.paidAmount)}</td>
                        <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(row.balance)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td className="border border-[#173B73]/20 px-2 py-2" colSpan={2}>合計：{summaryTotals.memberCount} 位</td>
                      <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(summaryTotals.previousBalance)}</td>
                      <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(summaryTotals.meal)}</td>
                      <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(summaryTotals.annualFee)}</td>
                      <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(summaryTotals.specialDonation)}</td>
                      <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(summaryTotals.redBox)}</td>
                      <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(summaryTotals.rotaryFoundation)}</td>
                      <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(summaryTotals.passThrough)}</td>
                      <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(summaryTotals.currentDue)}</td>
                      <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(summaryTotals.paidAmount)}</td>
                      <td className="border border-[#173B73]/20 px-2 py-2 text-right">{formatCurrency(summaryTotals.balance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </AssistantSection>
      </section>
    </main>
  );
}

function AssistantSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 text-left">
        <h2 className="text-xl font-bold">{title}</h2>
        <span className="shrink-0 text-sm font-bold">{isOpen ? "???嗅?" : "??撅?"}</span>
      </button>
      {isOpen ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

function AssistantInput({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "numeric";
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base text-[#173B73] outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
      />
    </label>
  );
}

function AssistantTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-2 w-full resize-none rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base text-[#173B73] outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
      />
    </label>
  );
}

function MoneyInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-2xl border border-[#E5D9BD] bg-white px-3 py-2 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
      />
    </label>
  );
}

function buildWarnings(eventItem: Omit<EventItem, "id">, aiWarnings: string[]) {
  return mergeWarnings(aiWarnings, buildRequiredWarnings(eventItem));
}

function buildRequiredWarnings(eventItem: Omit<EventItem, "id">) {
  const warnings = new Set<string>();
  if (!eventItem.rotaryYearId) warnings.add("請選擇年度");
  if (!eventItem.date) warnings.add("請填寫活動日期");
  if (!eventItem.title) warnings.add("請填寫活動名稱");
  if (!eventItem.location) warnings.add("請填寫活動地點");
  return Array.from(warnings);
}

function mergeWarnings(...groups: string[][]) {
  return Array.from(new Set(groups.flat().filter(Boolean)));
}

function getPreviousMonth() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getRotaryYearStartMonth(year: RotaryYear | undefined, fallbackMonth: string) {
  return year?.startDate ? year.startDate.slice(0, 7) : fallbackMonth;
}

function findPreviousBalance(memberId: string, targetMonth: string, records: DuesRecord[]) {
  const previousRecord = records
    .filter((record) => record.memberId === memberId && record.periodMonth < targetMonth)
    .sort((firstRecord, secondRecord) => secondRecord.periodMonth.localeCompare(firstRecord.periodMonth))[0];
  return previousRecord ? getDisplayDuesBalance(previousRecord) : 0;
}

function getBatchCurrentDue(row: BatchRow) {
  return (
    row.meal +
    row.annualFee +
    row.specialDonation +
    row.redBox +
    row.rotaryFoundation +
    row.passThrough
  );
}

function buildDuesRecordFromBatchRow(row: BatchRow, periodMonth: string): DuesRecord {
  const lineItems = buildBatchLineItems(row);
  return {
    ...emptyDuesRecord,
    id: crypto.randomUUID(),
    memberId: row.member.id,
    periodMonth,
    previousBalance: row.previousBalance,
    currentDue: getBatchCurrentDue(row),
    paymentMethod: "頧董" as PaymentMethod,
    createdAt: new Date().toISOString(),
    lineItems,
  };
}

function buildBatchLineItems(row: BatchRow): DuesLineItem[] {
  const createdAt = new Date().toISOString();
  const items: DuesLineItem[] = [];
  addBatchLineItem(items, "meal", "餐費", row.meal, createdAt);
  addBatchLineItem(items, "annual_fee", "常年費", row.annualFee, createdAt);
  addBatchLineItem(items, "special_donation", "特別捐", row.specialDonation, createdAt);
  addBatchLineItem(items, "red_box", "紅箱", row.redBox, createdAt);
  addBatchLineItem(items, "rotary_foundation", "扶輪基金（代收）", row.rotaryFoundation, createdAt, "固定 NT$270");
  addBatchLineItem(items, "pass_through", "代收付", row.passThrough, createdAt);
  return items;
}

function addBatchLineItem(
  items: DuesLineItem[],
  itemType: DuesLineItem["itemType"],
  itemName: string,
  amount: number,
  createdAt: string,
  note = ""
) {
  if (amount <= 0) return;
  items.push({
    id: crypto.randomUUID(),
    duesRecordId: "",
    itemType,
    itemName,
    serviceDate: "",
    quantity: 1,
    unitAmount: amount,
    amount,
    note,
    createdAt,
  });
}

function sumLineItemType(record: DuesRecord, type: DuesLineItem["itemType"]) {
  return record.lineItems
    .filter((item) => item.itemType === type)
    .reduce((total, item) => total + item.amount, 0);
}

function calculateSummaryTotals(rows: SummaryRow[]) {
  return rows.reduce(
    (total, row) => ({
      memberCount: total.memberCount + 1,
      previousBalance: total.previousBalance + row.record.previousBalance,
      meal: total.meal + row.meal,
      annualFee: total.annualFee + row.annualFee,
      specialDonation: total.specialDonation + row.specialDonation,
      redBox: total.redBox + row.redBox,
      rotaryFoundation: total.rotaryFoundation + row.rotaryFoundation,
      passThrough: total.passThrough + row.passThrough,
      currentDue: total.currentDue + row.currentDue,
      paidAmount: total.paidAmount + row.record.paidAmount,
      balance: total.balance + row.balance,
    }),
    {
      memberCount: 0,
      previousBalance: 0,
      meal: 0,
      annualFee: 0,
      specialDonation: 0,
      redBox: 0,
      rotaryFoundation: 0,
      passThrough: 0,
      currentDue: 0,
      paidAmount: 0,
      balance: 0,
    }
  );
}

function buildMemberDuesRows(
  records: DuesRecord[],
  members: Member[],
  memberId: string,
  startMonth: string,
  endMonth: string
) {
  return records
    .filter(
      (record) =>
        record.memberId === memberId &&
        record.periodMonth >= startMonth &&
        record.periodMonth <= endMonth
    )
    .sort((firstRecord, secondRecord) =>
      firstRecord.periodMonth.localeCompare(secondRecord.periodMonth)
    )
    .map((record) => buildSummaryRow(record, members));
}

function buildMemberDuesBundles(
  members: Member[],
  records: DuesRecord[],
  startMonth: string,
  endMonth: string,
  includeNoRecordMembers: boolean
): MemberDuesRangeBundle[] {
  return members
    .map((member) => ({
      member,
      rows: buildMemberDuesRows(records, members, member.id, startMonth, endMonth),
    }))
    .filter((bundle) => includeNoRecordMembers || bundle.rows.length > 0)
    .sort((firstBundle, secondBundle) =>
      formatMemberName(firstBundle.member).localeCompare(formatMemberName(secondBundle.member), "zh-Hant")
    );
}

function buildSummaryRow(record: DuesRecord, members: Member[]): SummaryRow {
  return {
    record,
    member: members.find((member) => member.id === record.memberId),
    meal: sumLineItemType(record, "meal"),
    annualFee: sumLineItemType(record, "annual_fee"),
    specialDonation: sumLineItemType(record, "special_donation"),
    redBox: sumLineItemType(record, "red_box"),
    rotaryFoundation: sumLineItemType(record, "rotary_foundation"),
    passThrough: sumLineItemType(record, "pass_through"),
    currentDue: record.currentDue,
    balance: getDisplayDuesBalance(record),
  };
}

function exportUnpaidCsv(month: string, rows: UnpaidRow[]) {
  const csvRows = [
    ["查詢月份", month],
    [],
    ["社友姓名", "社名", "前期未繳", "本期社費", "已繳費用", "本期應繳", "繳費方式", "繳費日期"],
    ...rows.map((row) => [
      row.member?.chineseName || "未知社友",
      row.member?.rotaryName || "",
      String(row.record.previousBalance),
      String(row.record.currentDue),
      String(row.record.paidAmount),
      String(row.balance),
      row.record.paymentMethod,
      row.record.paymentDate,
    ]),
  ];
  downloadCsv(`高雄晨光扶輪社_未匯款社費_${month}.csv`, csvRows);
}

function exportSummaryCsv(month: string, rows: SummaryRow[]) {
  const totals = calculateSummaryTotals(rows);
  const csvRows = [
    ["高雄晨光扶輪社", `${formatSummaryTitleMonth(month)}全體社友本期應繳費用總表`],
    [],
    ["社友姓名", "社名", "前期未繳", "餐費", "常年費", "特別捐", "紅箱", "扶輪基金", "代收付", "本期社費總計", "已繳費用", "本期應繳"],
    ...rows.map((row) => [
      row.member?.chineseName || "未知社友",
      row.member?.rotaryName || "",
      String(row.record.previousBalance),
      String(row.meal),
      String(row.annualFee),
      String(row.specialDonation),
      String(row.redBox),
      String(row.rotaryFoundation),
      String(row.passThrough),
      String(row.currentDue),
      String(row.record.paidAmount),
      String(row.balance),
    ]),
    [
      "合計",
      `${totals.memberCount} 位`,
      String(totals.previousBalance),
      String(totals.meal),
      String(totals.annualFee),
      String(totals.specialDonation),
      String(totals.redBox),
      String(totals.rotaryFoundation),
      String(totals.passThrough),
      String(totals.currentDue),
      String(totals.paidAmount),
      String(totals.balance),
    ],
  ];
  downloadCsv(`高雄晨光扶輪社_全體社友本期應繳費用總表_${month}.csv`, csvRows);
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createMemberRangeExportElement(
  memberName: string,
  startMonth: string,
  endMonth: string,
  rows: SummaryRow[]
) {
  const element = document.createElement("section");
  element.style.position = "fixed";
  element.style.left = "0";
  element.style.top = "0";
  element.style.zIndex = "-1";
  element.style.boxSizing = "border-box";
  element.style.width = "1120px";
  element.style.padding = "48px";
  element.style.backgroundColor = "#ffffff";
  element.style.color = "#000000";
  element.style.fontFamily = '"Noto Sans TC", "Microsoft JhengHei", Arial, sans-serif';
  element.innerHTML = buildMemberRangeHtml(memberName, startMonth, endMonth, rows);
  document.body.appendChild(element);
  return element;
}

function buildMemberRangeHtml(
  memberName: string,
  startMonth: string,
  endMonth: string,
  rows: SummaryRow[]
) {
  const totals = calculateSummaryTotals(rows);
  const bodyRows =
    rows.length > 0
      ? rows
          .map((row) => {
            const detail = getStatementLineItems(row.record)
              .map(
                (item) =>
                  `${escapeHtml(item.label)} ${escapeHtml(item.description || "舊資料總額")} ${formatCurrency(item.amount)}`
              )
              .join("<br/>");
            return `
              <tr>
                <td style="border:1px solid #000;padding:8px;">${escapeHtml(formatSummaryTitleMonth(row.record.periodMonth))}</td>
                <td style="border:1px solid #000;padding:8px;text-align:right;">${formatCurrency(row.record.previousBalance)}</td>
                <td style="border:1px solid #000;padding:8px;">${detail || "舊資料總額"}</td>
                <td style="border:1px solid #000;padding:8px;text-align:right;">${formatCurrency(row.currentDue)}</td>
                <td style="border:1px solid #000;padding:8px;text-align:right;">${formatCurrency(row.record.paidAmount)}</td>
                <td style="border:1px solid #000;padding:8px;text-align:right;">${formatCurrency(row.balance)}</td>
                <td style="border:1px solid #000;padding:8px;">${escapeHtml(row.record.paymentDate || "-")}</td>
                <td style="border:1px solid #000;padding:8px;">${escapeHtml(row.record.paymentMethod || "-")}</td>
                <td style="border:1px solid #000;padding:8px;">${row.balance > 0 ? "未匯款" : "已繳清"}</td>
              </tr>
            `;
          })
          .join("")
      : `<tr><td colspan="9" style="border:1px solid #000;padding:16px;text-align:center;">此區間無社費紀錄</td></tr>`;

  return `
    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:18px;">
      <p style="font-size:24px;font-weight:700;margin:0;">高雄晨光扶輪社</p>
      <h2 style="font-size:32px;font-weight:700;margin:8px 0 0;">社友個人社費繳交明細</h2>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;margin-top:24px;font-size:18px;font-weight:700;">
      <p style="margin:0;">社友：${escapeHtml(memberName || "-")}</p>
      <p style="margin:0;">查詢區間：${escapeHtml(formatSummaryTitleMonth(startMonth))} ～ ${escapeHtml(formatSummaryTitleMonth(endMonth))}</p>
      <p style="margin:0;">產出日期：${formatTaiwanDate(new Date())}</p>
      <p style="margin:0;">查詢月份數：${rows.length}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:24px;font-size:14px;line-height:1.45;">
      <thead>
        <tr style="background:#f2f2f2;">
          <th style="border:1px solid #000;padding:8px;text-align:left;">月份</th>
          <th style="border:1px solid #000;padding:8px;text-align:right;">前期未繳</th>
          <th style="border:1px solid #000;padding:8px;text-align:left;">本期社費明細</th>
          <th style="border:1px solid #000;padding:8px;text-align:right;">本期應繳</th>
          <th style="border:1px solid #000;padding:8px;text-align:right;">已繳費用</th>
          <th style="border:1px solid #000;padding:8px;text-align:right;">本期應繳餘額</th>
          <th style="border:1px solid #000;padding:8px;text-align:left;">繳費日期</th>
          <th style="border:1px solid #000;padding:8px;text-align:left;">繳費方式</th>
          <th style="border:1px solid #000;padding:8px;text-align:left;">狀態</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:24px;font-size:17px;font-weight:700;">
      <p style="margin:0;">前期未繳合計：${formatCurrency(totals.previousBalance)}</p>
      <p style="margin:0;">餐費合計：${formatCurrency(totals.meal)}</p>
      <p style="margin:0;">常年費合計：${formatCurrency(totals.annualFee)}</p>
      <p style="margin:0;">特別捐合計：${formatCurrency(totals.specialDonation)}</p>
      <p style="margin:0;">紅箱合計：${formatCurrency(totals.redBox)}</p>
      <p style="margin:0;">扶輪基金合計：${formatCurrency(totals.rotaryFoundation)}</p>
      <p style="margin:0;">代收付合計：${formatCurrency(totals.passThrough)}</p>
      <p style="margin:0;">本期應繳合計：${formatCurrency(totals.currentDue)}</p>
      <p style="margin:0;">已繳費用合計：${formatCurrency(totals.paidAmount)}</p>
      <p style="margin:0;">尚未繳清合計：${formatCurrency(totals.balance)}</p>
    </div>
  `;
}

async function downloadMemberRangeJpg(element: HTMLElement, filename: string) {
  const html2canvasModule = await import("html2canvas");
  const canvas = await html2canvasModule.default(element, {
    scale: 3,
    useCORS: true,
    backgroundColor: "#ffffff",
  });
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/jpeg", 0.95);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function getStatementLineItems(record: DuesRecord) {
  if (record.lineItems.length === 0) {
    return [{ id: `${record.id}-legacy`, label: "舊資料總額", description: "", amount: record.currentDue }];
  }

  return record.lineItems.map((item) => ({
    id: item.id,
    label: formatLineItemType(item.itemType),
    description: formatLineItemDescription(item),
    amount: item.itemType === "rotary_foundation" ? 270 : item.amount,
  }));
}

function formatLineItemDescription(item: DuesLineItem) {
  if (item.itemType === "meal" || item.itemType === "red_box") {
    return item.serviceDate ? `參加日期 ${item.serviceDate}` : "";
  }

  if (item.itemType === "rotary_foundation") {
    return item.note || "固定 NT$270";
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

function formatSummaryTitleMonth(periodMonth: string) {
  if (!periodMonth) return "未填月份";
  const [year, month] = periodMonth.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function formatTaiwanDate(date: Date) {
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function escapeCsvValue(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitizeFilename(value: string) {
  return value.trim().replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "");
}

function waitForBrowser() {
  return new Promise((resolve) => window.setTimeout(resolve, 350));
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? `${fallback}：${error.message}` : fallback;
}
