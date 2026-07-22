"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import MeetingAttendancePanel from "@/app/components/MeetingAttendancePanel";
import { useAuth } from "@/app/components/AuthProvider";
import { canManageEvents, isExecutiveSecretary } from "@/lib/auth";
import { EventItem, RotaryYear, sortEventsByDate } from "@/lib/events";
import {
  deleteRotaryYear,
  fetchEvents,
  fetchRotaryYears,
  upsertRotaryYear,
} from "@/lib/supabaseData";

type YearFormState = Omit<RotaryYear, "id" | "createdAt">;

const emptyYearForm: YearFormState = {
  name: "",
  displayName: "",
  startDate: "",
  endDate: "",
  isActive: false,
};

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

export default function CalendarPage() {
  const { profile } = useAuth();
  const canEditEvents = canManageEvents(profile?.role);
  const canManageYears = isExecutiveSecretary(profile?.role);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [years, setYears] = useState<RotaryYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState("");
  const [currentMonth, setCurrentMonth] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [expandedEventId, setExpandedEventId] = useState("");
  const [highlightedEventId, setHighlightedEventId] = useState("");
  const [isYearFormOpen, setIsYearFormOpen] = useState(false);
  const [yearForm, setYearForm] = useState<YearFormState>(emptyYearForm);
  const [editingYearId, setEditingYearId] = useState<string | null>(null);

  async function loadData() {
    try {
      setErrorMessage("");
      const [loadedYears, loadedEvents] = await Promise.all([
        fetchRotaryYears(),
        fetchEvents(),
      ]);
      setYears(loadedYears);
      setEvents(loadedEvents);

      const activeYear = loadedYears.find((year) => year.isActive) ?? loadedYears[0];
      if (activeYear) {
        setSelectedYearId(activeYear.id);
        setCurrentMonth(activeYear.startDate.slice(0, 7));
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? `年度行事曆讀取失敗：${error.message}` : "年度行事曆讀取失敗"
      );
    }
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const selectedYear = years.find((year) => year.id === selectedYearId);
  const annualEvents = useMemo(() => {
    if (!selectedYear) return [];

    return sortEventsByDate(
      events.filter((eventItem) => {
        if (eventItem.rotaryYearId) {
          return eventItem.rotaryYearId === selectedYear.id;
        }

        return (
          eventItem.date >= selectedYear.startDate &&
          eventItem.date <= selectedYear.endDate
        );
      })
    );
  }, [events, selectedYear]);
  const monthEvents = useMemo(
    () => annualEvents.filter((eventItem) => eventItem.date.startsWith(currentMonth)),
    [annualEvents, currentMonth]
  );

  function focusAnnualEvent(eventId: string) {
    setExpandedEventId(eventId);
    setHighlightedEventId(eventId);

    window.setTimeout(() => {
      document
        .getElementById(`event-${eventId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);

    window.setTimeout(() => setHighlightedEventId(""), 1800);
  }

  function resetYearForm() {
    setYearForm(emptyYearForm);
    setEditingYearId(null);
  }

  function handleEditYear(year: RotaryYear) {
    setYearForm({
      name: year.name,
      displayName: year.displayName,
      startDate: year.startDate,
      endDate: year.endDate,
      isActive: year.isActive,
    });
    setEditingYearId(year.id);
    setIsYearFormOpen(true);
  }

  async function handleSubmitYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const duplicateYear = years.find(
      (year) => year.name === yearForm.name && year.id !== editingYearId
    );
    if (duplicateYear) {
      setErrorMessage("年度名稱不可重複。");
      return;
    }

    if (yearForm.startDate > yearForm.endDate) {
      setErrorMessage("年度開始日期不可晚於結束日期。");
      return;
    }

    const overlappedYear = years.find(
      (year) =>
        year.id !== editingYearId &&
        yearForm.startDate <= year.endDate &&
        yearForm.endDate >= year.startDate
    );
    if (overlappedYear) {
      setErrorMessage(`年度日期不可重疊：${overlappedYear.displayName || overlappedYear.name}`);
      return;
    }

    try {
      const savedYear = await upsertRotaryYear({
        id: editingYearId ?? crypto.randomUUID(),
        ...yearForm,
        createdAt: new Date().toISOString(),
      });

      setYears((currentYears) => {
        const nextYears = currentYears.some((year) => year.id === savedYear.id)
          ? currentYears.map((year) => (year.id === savedYear.id ? savedYear : year))
          : [...currentYears, savedYear];
        return nextYears
          .map((year) =>
            savedYear.isActive && year.id !== savedYear.id
              ? { ...year, isActive: false }
              : year
          )
          .sort((firstYear, secondYear) =>
            firstYear.startDate.localeCompare(secondYear.startDate)
          );
      });
      if (savedYear.isActive || !selectedYearId) {
        setSelectedYearId(savedYear.id);
        setCurrentMonth(savedYear.startDate.slice(0, 7));
      }
      resetYearForm();
      setIsYearFormOpen(false);
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? `年度儲存失敗：${error.message}` : "年度儲存失敗"
      );
    }
  }

  async function handleDeleteYear(year: RotaryYear) {
    const hasEvents = events.some((eventItem) => {
      if (eventItem.rotaryYearId) {
        return eventItem.rotaryYearId === year.id;
      }

      return eventItem.date >= year.startDate && eventItem.date <= year.endDate;
    });
    if (hasEvents) {
      setErrorMessage("此年度已有活動，不能刪除。");
      return;
    }

    const confirmed = window.confirm(`確定要刪除 ${year.displayName || year.name} 嗎？`);
    if (!confirmed) return;
    const confirmedAgain = window.confirm("再次確認：刪除後無法復原。");
    if (!confirmedAgain) return;

    try {
      await deleteRotaryYear(year.id);
      setYears((currentYears) => currentYears.filter((item) => item.id !== year.id));
      if (selectedYearId === year.id) {
        const nextYear = years.find((item) => item.id !== year.id);
        setSelectedYearId(nextYear?.id ?? "");
        setCurrentMonth(nextYear?.startDate.slice(0, 7) ?? "");
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof Error ? `年度刪除失敗：${error.message}` : "年度刪除失敗"
      );
    }
  }

  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="mx-auto max-w-md space-y-3">
          <Link href="/" className="text-sm font-bold text-[#173B73]/75">
            回首頁
          </Link>
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-[#C99700]">
              Rotary OS
            </p>
            <h1 className="mt-2 text-3xl font-bold">年度行事曆</h1>
          </div>
          {canManageYears ? <Link
            href="/year-transition"
            className={`block rounded-2xl bg-[#F7C948] px-4 py-3 text-center font-bold ${buttonShadow}`}
          >
            年度交接精靈
          </Link> : null}
        </header>

        {errorMessage ? (
          <p className="mx-auto max-w-md rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage}
          </p>
        ) : null}

        {canManageYears ? <section className="mx-auto max-w-md rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
          <button
            type="button"
            onClick={() => {
              if (isYearFormOpen) resetYearForm();
              setIsYearFormOpen((currentValue) => !currentValue);
            }}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="text-xl font-bold">
              {editingYearId ? "編輯年度" : "新增年度"}
            </span>
            <span className={`rounded-2xl bg-[#F7C948] px-4 py-2 text-sm font-bold ${buttonShadow}`}>
              {isYearFormOpen ? "收合" : "展開"}
            </span>
          </button>

          {isYearFormOpen ? (
            <form onSubmit={handleSubmitYear} className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-bold">年度名稱</span>
                <input
                  required
                  value={yearForm.name}
                  onChange={(event) =>
                    setYearForm((currentForm) => ({
                      ...currentForm,
                      name: event.target.value,
                    }))
                  }
                  placeholder="2032-2033"
                  className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                />
              </label>
              <label className="block">
                <span className="text-sm font-bold">顯示名稱</span>
                <input
                  required
                  value={yearForm.displayName}
                  onChange={(event) =>
                    setYearForm((currentForm) => ({
                      ...currentForm,
                      displayName: event.target.value,
                    }))
                  }
                  placeholder="32-33年度"
                  className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-bold">開始日期</span>
                  <input
                    required
                    type="date"
                    value={yearForm.startDate}
                    onChange={(event) =>
                      setYearForm((currentForm) => ({
                        ...currentForm,
                        startDate: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-3 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-bold">結束日期</span>
                  <input
                    required
                    type="date"
                    value={yearForm.endDate}
                    onChange={(event) =>
                      setYearForm((currentForm) => ({
                        ...currentForm,
                        endDate: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-3 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
                  />
                </label>
              </div>
              <label className="flex items-center gap-3 rounded-2xl bg-[#F8F3E8] p-4 font-bold">
                <input
                  type="checkbox"
                  checked={yearForm.isActive}
                  onChange={(event) =>
                    setYearForm((currentForm) => ({
                      ...currentForm,
                      isActive: event.target.checked,
                    }))
                  }
                  className="h-5 w-5"
                />
                設為目前年度
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="submit"
                  className={`rounded-2xl bg-[#F7C948] py-3 font-bold ${buttonShadow}`}
                >
                  儲存年度
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetYearForm();
                    setIsYearFormOpen(false);
                  }}
                  className={`rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}
                >
                  取消
                </button>
              </div>
            </form>
          ) : null}
        </section> : null}

        <section className="mx-auto grid max-w-md grid-cols-1 gap-3">
          {years.length === 0 ? (
            <div className="rounded-3xl bg-white/80 p-5 text-center font-bold">
              尚未建立年度資料
            </div>
          ) : (
            years.map((year) => (
              <article
                key={year.id}
                className={`rounded-3xl p-5 font-bold ${
                  selectedYearId === year.id ? "bg-[#F7C948]" : "bg-white/85"
                } ${buttonShadow}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedYearId(year.id);
                    setCurrentMonth(year.startDate.slice(0, 7));
                  }}
                  className="w-full text-left"
                >
                  <span className="block text-2xl">{year.displayName || year.name}</span>
                  <span className="mt-1 block text-sm text-[#173B73]/70">
                    {year.startDate.replaceAll("-", "/")} - {year.endDate.replaceAll("-", "/")}
                  </span>
                  {year.isActive ? (
                    <span className="mt-3 inline-flex rounded-full bg-[#173B73] px-3 py-1 text-xs text-white">
                      目前年度
                    </span>
                  ) : null}
                </button>
                {canManageYears ? <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleEditYear(year)}
                    className={`rounded-2xl bg-white py-2 text-sm font-bold ${buttonShadow}`}
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteYear(year)}
                    className={`rounded-2xl bg-white py-2 text-sm font-bold ${buttonShadow}`}
                  >
                    刪除
                  </button>
                </div> : null}
              </article>
            ))
          )}
        </section>

        {selectedYear ? (
          <>
            <section className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[#C99700]">月曆總覽</p>
                  <h2 className="text-2xl font-bold">{formatMonthTitle(currentMonth)}</h2>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentMonth(shiftMonth(currentMonth, -1))}
                    className={`rounded-2xl bg-white px-4 py-2 text-sm font-bold ${buttonShadow}`}
                  >
                    上月
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentMonth(shiftMonth(currentMonth, 1))}
                    className={`rounded-2xl bg-[#F7C948] px-4 py-2 text-sm font-bold ${buttonShadow}`}
                  >
                    下月
                  </button>
                </div>
              </div>

              <CalendarGrid
                month={currentMonth}
                events={monthEvents}
                onFocusEvent={focusAnnualEvent}
              />
            </section>

            <section
              id="annual-events-list"
              className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold">年度活動清單</h2>
                {canEditEvents ? <Link
                  href="/events"
                  className={`rounded-2xl bg-[#F7C948] px-4 py-2 text-sm font-bold ${buttonShadow}`}
                >
                  新增 / 編輯 / 刪除
                </Link> : null}
              </div>

              <div className="mt-5 space-y-3">
                {annualEvents.length === 0 ? (
                  <div className="rounded-3xl bg-[#F8F3E8] p-5 text-center font-semibold text-[#173B73]/70">
                    目前年度區間內沒有活動
                  </div>
                ) : (
                  annualEvents.map((eventItem) => {
                    const isExpanded = expandedEventId === eventItem.id;
                    const year = years.find((item) => item.id === eventItem.rotaryYearId);
                    const eventType = eventItem.eventType.trim();
                    const topic = eventItem.topic.trim();

                    return (
                      <article
                        key={eventItem.id}
                        id={`event-${eventItem.id}`}
                        className={`rounded-3xl border bg-white p-4 transition ${
                          highlightedEventId === eventItem.id
                            ? "border-[#F7C948] ring-4 ring-[#F7C948]/60"
                            : "border-[#E5D9BD]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedEventId((currentId) =>
                              currentId === eventItem.id ? "" : eventItem.id
                            )
                          }
                          className="w-full text-left"
                        >
                          <p className="text-sm font-bold text-[#C99700]">
                            {eventItem.meetingNo
                              ? `第${eventItem.meetingNo}次例會`
                              : eventItem.eventType || "活動"}
                          </p>
                          <h3 className="mt-1 break-words text-lg font-bold">
                            {eventItem.title || "未命名活動"}
                          </h3>
                          {eventType ? (
                            <div className="mt-2">
                              <span className="inline-flex max-w-full rounded-full bg-[#F7C948] px-3 py-1 text-xs font-bold text-[#173B73]">
                                活動類型：{eventType}
                              </span>
                            </div>
                          ) : null}
                          {topic ? (
                            <p className="mt-2 line-clamp-2 break-words text-sm font-semibold text-[#173B73]/85">
                              主題：{topic}
                            </p>
                          ) : null}
                          <p className="mt-2 break-words text-sm font-semibold text-[#173B73]/80">
                            {formatDate(eventItem.date)}｜{formatEventTime(eventItem)}｜{eventItem.location || "-"}
                          </p>
                        </button>

                        {isExpanded ? (
                          <div className="mt-4 space-y-2 border-t border-[#E5D9BD] pt-4 text-sm font-semibold text-[#173B73]/80">
                            <DetailRow label="年度" value={year?.displayName || year?.name || "-"} />
                            <DetailRow label="活動類型" value={eventItem.eventType || "-"} />
                            <DetailRow label="活動名稱" value={eventItem.title || "-"} />
                            <DetailRow label="例會次數" value={eventItem.meetingNo || "-"} />
                            <DetailRow label="日期" value={formatDate(eventItem.date)} />
                            <DetailRow label="星期" value={eventItem.weekday || "-"} />
                            <DetailRow label="餐敘時間" value={eventItem.dinnerTime || "-"} />
                            <DetailRow label="開始時間" value={eventItem.meetingTime || "-"} />
                            <DetailRow label="結束時間" value={eventItem.endTime || "-"} />
                            <DetailRow label="地點" value={eventItem.location || "-"} />
                            <DetailRow label="樓層" value={eventItem.room || "-"} />
                            <DetailRow label="主講人" value={eventItem.speaker || "-"} />
                            <DetailRow label="主題" value={eventItem.topic || "-"} />
                            <DetailRow label="聯誼長" value="-" />
                            <DetailRow label="糾察長" value="-" />
                            <DetailRow label="活動說明" value={eventItem.note || "-"} />
                            <DetailRow label="備註" value={eventItem.note || "-"} />
                            {canManageYears ? <MeetingAttendancePanel
                              eventItem={eventItem}
                              onEventUpdated={(savedEvent) =>
                                setEvents((currentEvents) =>
                                  currentEvents.map((currentEvent) =>
                                    currentEvent.id === savedEvent.id
                                      ? savedEvent
                                      : currentEvent
                                  )
                                )
                              }
                            /> : null}
                            {canEditEvents ? <div className="grid grid-cols-2 gap-3 pt-3">
                              <Link
                                href="/events"
                                className={`rounded-2xl bg-[#F7C948] py-3 text-center font-bold text-[#173B73] ${buttonShadow}`}
                              >
                                編輯
                              </Link>
                              <button
                                type="button"
                                onClick={() => setExpandedEventId("")}
                                className={`rounded-2xl bg-white py-3 font-bold text-[#173B73] ${buttonShadow}`}
                              >
                                取消
                              </button>
                              <Link
                                href="/events"
                                className={`rounded-2xl bg-white py-3 text-center font-bold text-[#173B73] ${buttonShadow}`}
                              >
                                儲存
                              </Link>
                              <Link
                                href="/events"
                                className={`rounded-2xl bg-white py-3 text-center font-bold text-[#173B73] ${buttonShadow}`}
                              >
                                刪除
                              </Link>
                            </div> : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

function CalendarGrid({
  month,
  events,
  onFocusEvent,
}: {
  month: string;
  events: EventItem[];
  onFocusEvent: (eventId: string) => void;
}) {
  const cells = buildMonthCells(month);

  return (
    <div className="mt-5 grid w-full min-w-0 grid-cols-7 gap-1 text-center text-xs font-bold sm:text-sm">
      {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
        <div key={day} className="py-2 text-[#173B73]/70">
          {day}
        </div>
      ))}
      {cells.map((dateValue, index) => {
        const dateEvents = events.filter((eventItem) => eventItem.date === dateValue);
        const meetings = dateEvents.filter(isMeetingEvent);
        const otherEvents = dateEvents.filter((eventItem) => !isMeetingEvent(eventItem));

        return (
          <div
            key={`${dateValue}-${index}`}
            className="min-w-0 overflow-hidden rounded-2xl border border-[#E5D9BD] bg-white p-1.5 text-left sm:min-h-20 sm:p-2"
          >
            {dateValue ? (
              <>
                <p className="text-xs font-bold text-[#173B73]/70">
                  {Number(dateValue.slice(-2))}
                </p>
                <div className="mt-1 space-y-1">
                  {meetings.map((eventItem) => (
                    <button
                      key={eventItem.id}
                      type="button"
                      onClick={() => onFocusEvent(eventItem.id)}
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F7C948] px-1.5 text-[10px] leading-none text-[#173B73] sm:h-6 sm:min-w-6 sm:text-xs"
                    >
                      {eventItem.meetingNo || "•"}
                    </button>
                  ))}
                  {otherEvents.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {otherEvents.map((eventItem) => (
                        <span
                          key={eventItem.id}
                          className="h-2 w-2 rounded-full bg-[#173B73]"
                          title={eventItem.title}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function buildMonthCells(month: string) {
  if (!month) return [];
  const firstDate = new Date(`${month}-01T00:00:00`);
  const firstDay = firstDate.getDay() === 0 ? 7 : firstDate.getDay();
  const daysInMonth = new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: firstDay - 1 }, () => "");

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${month}-${String(day).padStart(2, "0")}`);
  }

  while (cells.length % 7 !== 0) cells.push("");
  return cells;
}

function isMeetingEvent(eventItem: EventItem) {
  return eventItem.eventType.includes("例會") || eventItem.meetingNo.trim() !== "";
}

function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00`);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthTitle(month: string) {
  if (!month) return "";
  const [year, monthNumber] = month.split("-");
  return `${year}年${Number(monthNumber)}月`;
}

function formatDate(dateValue: string) {
  if (!dateValue) {
    return "未填日期";
  }

  return dateValue.replaceAll("-", "/");
}

function formatEventTime(eventItem: EventItem) {
  const startTime = eventItem.meetingTime || eventItem.dinnerTime;
  if (!startTime && !eventItem.endTime) {
    return "-";
  }

  return eventItem.endTime ? `${startTime || "-"}-${eventItem.endTime}` : startTime;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="grid grid-cols-[5rem_1fr] gap-2 break-words">
      <span className="text-[#173B73]">{label}</span>
      <span>{value}</span>
    </p>
  );
}
