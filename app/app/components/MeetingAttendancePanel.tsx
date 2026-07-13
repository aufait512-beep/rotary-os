"use client";

import { useMemo, useState } from "react";
import {
  applyResponseStatus,
  AttendanceResponseStatus,
  buildAttendanceSummary,
  emptyMeetingAttendance,
  formatAttendanceStatus,
  isActiveMember,
  isMeetingEvent,
  MeetingAttendance,
} from "@/lib/attendance";
import { EventItem } from "@/lib/events";
import { formatMemberName, Member, sortMembersByName } from "@/lib/members";
import {
  fetchEvents,
  fetchMeetingAttendance,
  fetchMembers,
  upsertEvent,
  upsertMeetingAttendance,
} from "@/lib/supabaseData";

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

type AttendanceFilter = "all" | AttendanceResponseStatus;

export default function MeetingAttendancePanel({
  eventItem,
  onEventUpdated,
}: {
  eventItem: EventItem;
  onEventUpdated?: (eventItem: EventItem) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isActualOpen, setIsActualOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [records, setRecords] = useState<MeetingAttendance[]>([]);
  const [allMeetingEvents, setAllMeetingEvents] = useState<EventItem[]>([]);
  const [allAttendance, setAllAttendance] = useState<MeetingAttendance[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<AttendanceFilter>("all");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [savingMemberId, setSavingMemberId] = useState("");
  const [mealAmount, setMealAmount] = useState(eventItem.eventMealAmount || 0);

  const activeMembers = useMemo(
    () => sortMembersByName(members.filter(isActiveMember)),
    [members]
  );
  const visibleRows = useMemo(() => {
    return activeMembers
      .map((member) => ({
        member,
        record: getMemberRecord(member.id, records, eventItem.id, mealAmount),
      }))
      .filter(({ member, record }) => {
        const memberName = formatMemberName(member);
        const matchesSearch =
          !searchTerm.trim() ||
          memberName.toLowerCase().includes(searchTerm.trim().toLowerCase());
        const matchesFilter = filter === "all" || record.responseStatus === filter;
        return matchesSearch && matchesFilter;
      });
  }, [activeMembers, eventItem.id, filter, mealAmount, records, searchTerm]);
  const allRows = useMemo(
    () =>
      activeMembers.map((member) =>
        getMemberRecord(member.id, records, eventItem.id, mealAmount)
      ),
    [activeMembers, eventItem.id, mealAmount, records]
  );
  const summary = useMemo(
    () => buildAttendanceSummary(eventItem, allRows),
    [allRows, eventItem]
  );
  const annualStats = useMemo(
    () => buildAnnualStats(allMeetingEvents, allAttendance, eventItem.rotaryYearId),
    [allAttendance, allMeetingEvents, eventItem.rotaryYearId]
  );
  const annualMeetingTotal = useMemo(
    () =>
      allMeetingEvents.filter((meetingEvent) =>
        eventItem.rotaryYearId
          ? meetingEvent.rotaryYearId === eventItem.rotaryYearId
          : true
      ).length,
    [allMeetingEvents, eventItem.rotaryYearId]
  );

  if (!isMeetingEvent(eventItem)) {
    return null;
  }

  async function loadAttendance() {
    try {
      setErrorMessage("");
      const [loadedMembers, eventRecords, loadedEvents, loadedAttendance] =
        await Promise.all([
          fetchMembers(),
          fetchMeetingAttendance(eventItem.id),
          fetchEvents(),
          fetchMeetingAttendance(),
        ]);
      setMembers(loadedMembers);
      setRecords(eventRecords);
      setAllMeetingEvents(loadedEvents.filter(isMeetingEvent));
      setAllAttendance(loadedAttendance);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "例會出席統計讀取失敗"));
    }
  }

  async function handleToggleOpen() {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && members.length === 0) {
      await loadAttendance();
    }
  }

  async function saveRecord(nextRecord: MeetingAttendance) {
    try {
      setErrorMessage("");
      setSuccessMessage("");
      setSavingMemberId(nextRecord.memberId);
      const savedRecord = await upsertMeetingAttendance(nextRecord);
      setRecords((currentRecords) => upsertLocalRecord(currentRecords, savedRecord));
      setAllAttendance((currentRecords) => upsertLocalRecord(currentRecords, savedRecord));
      setSuccessMessage("已儲存出席資料");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "出席資料儲存失敗"));
    } finally {
      setSavingMemberId("");
    }
  }

  async function saveMealAmount() {
    try {
      setErrorMessage("");
      const savedEvent = await upsertEvent({
        ...eventItem,
        eventMealAmount: Math.max(0, mealAmount),
      });
      onEventUpdated?.(savedEvent);
      setSuccessMessage("已更新本場餐費預設金額");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "本場餐費儲存失敗"));
    }
  }

  async function handleCopySummary() {
    try {
      await navigator.clipboard.writeText(summary.copyText);
      setSuccessMessage("已複製出席統計，可貼到 LINE。");
    } catch {
      setErrorMessage("複製失敗，請手動選取出席統計文字。");
    }
  }

  async function applyPlannedToActual() {
    const confirmed = window.confirm("確定要套用預計出席為實際出席嗎？");
    if (!confirmed) return;

    const nextRecords = allRows.map((record) => ({
      ...record,
      actualAttendance: record.plannedAttendance,
    }));

    try {
      setErrorMessage("");
      const savedRecords = await Promise.all(nextRecords.map(upsertMeetingAttendance));
      setRecords(savedRecords);
      setAllAttendance((currentRecords) =>
        savedRecords.reduce(upsertLocalRecord, currentRecords)
      );
      setSuccessMessage("已套用預計出席為實際出席。");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "實際出席套用失敗"));
    }
  }

  return (
    <section className="mt-5 rounded-3xl border border-[#E5D9BD] bg-[#F8F3E8] p-4">
      <button
        type="button"
        onClick={() => void handleToggleOpen()}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-lg font-bold">例會出席統計</span>
        <span className={`rounded-2xl bg-[#F7C948] px-4 py-2 text-sm font-bold ${buttonShadow}`}>
          {isOpen ? "收合" : "展開"}
        </span>
      </button>

      {isOpen ? (
        <div className="mt-4 space-y-4">
          {errorMessage ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
              {errorMessage}
            </p>
          ) : null}
          {successMessage ? (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
              {successMessage}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 text-center text-sm font-bold sm:grid-cols-3">
            <SummaryTile label="社友總數" value={`${summary.totalMembers}人`} />
            <SummaryTile label="已回覆" value={`${summary.responded}人`} />
            <SummaryTile label="預計出席" value={`${summary.plannedAttending}人`} />
            <SummaryTile label="眷屬／來賓" value={`${summary.guests}人`} />
            <SummaryTile label="預計訂桌" value={`${summary.plannedReservationTotal}人`} />
            <SummaryTile label="未回覆" value={`${summary.noResponse}人`} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-bold">本場每人餐費</span>
              <input
                type="number"
                min={0}
                value={mealAmount}
                onChange={(event) => setMealAmount(Number(event.target.value) || 0)}
                onBlur={() => void saveMealAmount()}
                className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold">搜尋社友</span>
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="中文姓名 社名"
                className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold">篩選</span>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as AttendanceFilter)}
                className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              >
                <option value="all">全部</option>
                <option value="attending">出席</option>
                <option value="absent">不出席</option>
                <option value="no_response">未回覆</option>
                <option value="pending">待確認</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => void handleCopySummary()}
              className={`rounded-2xl bg-[#F7C948] py-3 font-bold ${buttonShadow}`}
            >
              複製出席摘要
            </button>
            <button
              type="button"
              onClick={() => setIsActualOpen((currentValue) => !currentValue)}
              className={`rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}
            >
              {isActualOpen ? "收合會後確認" : "會後實際出席確認"}
            </button>
          </div>

          {activeMembers.length === 0 ? (
            <p className="rounded-2xl bg-white p-4 text-center font-bold text-[#173B73]/70">
              尚未建立可統計的 active 社友名單。
            </p>
          ) : (
            <div className="space-y-3">
              {visibleRows.map(({ member, record }) => (
                <AttendanceMemberCard
                  key={member.id}
                  member={member}
                  record={record}
                  eventMealAmount={mealAmount || eventItem.eventMealAmount || 0}
                  isActualOpen={isActualOpen}
                  annualStat={annualStats.get(member.id)}
                  annualMeetingTotal={annualMeetingTotal}
                  isSaving={savingMemberId === member.id}
                  onSave={(nextRecord) => void saveRecord(nextRecord)}
                />
              ))}
            </div>
          )}

          {isActualOpen ? (
            <button
              type="button"
              onClick={() => void applyPlannedToActual()}
              className={`w-full rounded-2xl bg-[#173B73] py-3 font-bold text-white ${buttonShadow}`}
            >
              套用預計出席為實際出席
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function AttendanceMemberCard({
  member,
  record,
  eventMealAmount,
  isActualOpen,
  annualStat,
  annualMeetingTotal,
  isSaving,
  onSave,
}: {
  member: Member;
  record: MeetingAttendance;
  eventMealAmount: number;
  isActualOpen: boolean;
  annualStat?: { actual: number; total: number };
  annualMeetingTotal: number;
  isSaving: boolean;
  onSave: (record: MeetingAttendance) => void;
}) {
  function updateRecord(patch: Partial<MeetingAttendance>) {
    const nextRecord = { ...record, ...patch };
    if (patch.actualMeal && !nextRecord.mealAmount) {
      nextRecord.mealAmount = eventMealAmount;
    }
    onSave(nextRecord);
  }

  function updateStatus(status: AttendanceResponseStatus) {
    onSave(applyResponseStatus(record, status));
  }

  const annualRate =
    annualMeetingTotal > 0
      ? `${annualStat?.actual ?? 0}/${annualMeetingTotal}（${Math.round(
          ((annualStat?.actual ?? 0) / annualMeetingTotal) * 100
        )}%）`
      : "—";

  return (
    <article className="min-w-0 rounded-3xl bg-white p-4 text-[#173B73]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="break-words text-lg font-bold">{formatMemberName(member) || "未命名社友"}</h4>
          <p className="mt-1 text-sm font-semibold text-[#173B73]/70">
            年度出席：{annualRate}
          </p>
        </div>
        <span className="rounded-full bg-[#173B73] px-3 py-1 text-xs font-bold text-white">
          {isSaving ? "儲存中" : formatAttendanceStatus(record.responseStatus)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold">回覆狀態</span>
          <select
            value={record.responseStatus}
            onChange={(event) => updateStatus(event.target.value as AttendanceResponseStatus)}
            className="mt-2 w-full rounded-2xl border border-[#E5D9BD] px-3 py-3"
          >
            <option value="pending">待確認</option>
            <option value="attending">出席</option>
            <option value="absent">不出席</option>
            <option value="no_response">未回覆</option>
          </select>
        </label>
        <NumberField
          label="眷屬／來賓"
          value={record.guestCount}
          onChange={(value) => updateRecord({ guestCount: value })}
        />
        <ToggleField
          label="預計出席"
          checked={record.plannedAttendance}
          onChange={(checked) => updateRecord({ plannedAttendance: checked })}
        />
      </div>

      {isActualOpen ? (
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-[#E5D9BD] pt-4 sm:grid-cols-2">
          <ToggleField
            label="實際出席"
            checked={record.actualAttendance}
            onChange={(checked) => updateRecord({ actualAttendance: checked })}
          />
          <ToggleField
            label="實際用餐"
            checked={record.actualMeal}
            onChange={(checked) => updateRecord({ actualMeal: checked })}
          />
          <NumberField
            label="餐費金額"
            value={record.mealAmount}
            onChange={(value) => updateRecord({ mealAmount: value })}
          />
          <ToggleField
            label="帶入社費"
            checked={record.includeInDues}
            onChange={(checked) => updateRecord({ includeInDues: checked })}
          />
          <label className="block sm:col-span-2">
            <span className="text-sm font-bold">備註</span>
            <textarea
              defaultValue={record.note}
              rows={2}
              onBlur={(event) => updateRecord({ note: event.target.value })}
              className="mt-2 w-full resize-none rounded-2xl border border-[#E5D9BD] px-3 py-3"
            />
          </label>
        </div>
      ) : null}
    </article>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-3">
      <p className="text-xs text-[#173B73]/70">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
        className="mt-2 w-full rounded-2xl border border-[#E5D9BD] px-3 py-3"
      />
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl bg-[#F8F3E8] px-3 py-3 font-bold">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5"
      />
    </label>
  );
}

function getMemberRecord(
  memberId: string,
  records: MeetingAttendance[],
  eventId: string,
  defaultMealAmount: number
) {
  return (
    records.find((record) => record.memberId === memberId) ??
    emptyMeetingAttendance(eventId, memberId, defaultMealAmount)
  );
}

function upsertLocalRecord(
  records: MeetingAttendance[],
  nextRecord: MeetingAttendance
) {
  const existingIndex = records.findIndex(
    (record) =>
      record.id === nextRecord.id ||
      (record.eventId === nextRecord.eventId && record.memberId === nextRecord.memberId)
  );
  if (existingIndex === -1) return [...records, nextRecord];

  return records.map((record, index) => (index === existingIndex ? nextRecord : record));
}

function buildAnnualStats(
  meetingEvents: EventItem[],
  records: MeetingAttendance[],
  rotaryYearId: string
) {
  const yearMeetings = meetingEvents.filter((eventItem) =>
    rotaryYearId ? eventItem.rotaryYearId === rotaryYearId : true
  );
  const meetingIds = new Set(yearMeetings.map((eventItem) => eventItem.id));
  const stats = new Map<string, { actual: number; total: number }>();

  records.forEach((record) => {
    if (!meetingIds.has(record.eventId)) return;
    const currentStat = stats.get(record.memberId) ?? {
      actual: 0,
      total: yearMeetings.length,
    };
    if (record.actualAttendance) {
      currentStat.actual += 1;
    }
    stats.set(record.memberId, currentStat);
  });

  return stats;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? `${fallback}：${error.message}` : fallback;
}
