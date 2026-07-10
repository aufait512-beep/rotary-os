"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EventItem, RotaryYear, sortEventsByDate } from "@/lib/events";
import { fetchEvents, fetchRotaryYears } from "@/lib/supabaseData";

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

export default function CalendarPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [years, setYears] = useState<RotaryYear[]>([]);
  const [selectedYearId, setSelectedYearId] = useState("");
  const [currentMonth, setCurrentMonth] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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
        </header>

        {errorMessage ? (
          <p className="mx-auto max-w-md rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <section className="mx-auto grid max-w-md grid-cols-1 gap-3">
          {years.length === 0 ? (
            <div className="rounded-3xl bg-white/80 p-5 text-center font-bold">
              尚未建立年度資料
            </div>
          ) : (
            years.map((year) => (
              <button
                key={year.id}
                type="button"
                onClick={() => {
                  setSelectedYearId(year.id);
                  setCurrentMonth(year.startDate.slice(0, 7));
                }}
                className={`rounded-3xl p-5 text-left font-bold ${
                  selectedYearId === year.id ? "bg-[#F7C948]" : "bg-white/85"
                } ${buttonShadow}`}
              >
                <span className="block text-2xl">{year.displayName || year.name}</span>
                <span className="mt-1 block text-sm text-[#173B73]/70">
                  {year.startDate.replaceAll("-", "/")} - {year.endDate.replaceAll("-", "/")}
                </span>
              </button>
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

              <CalendarGrid month={currentMonth} events={monthEvents} />
            </section>

            <section className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold">年度活動清單</h2>
                <Link
                  href="/events"
                  className={`rounded-2xl bg-[#F7C948] px-4 py-2 text-sm font-bold ${buttonShadow}`}
                >
                  新增 / 編輯 / 刪除
                </Link>
              </div>

              <div className="mt-5 space-y-3">
                {annualEvents.length === 0 ? (
                  <div className="rounded-3xl bg-[#F8F3E8] p-5 text-center font-semibold text-[#173B73]/70">
                    目前年度區間內沒有活動
                  </div>
                ) : (
                  annualEvents.map((eventItem) => (
                    <article
                      key={eventItem.id}
                      className="rounded-3xl border border-[#E5D9BD] bg-white p-4"
                    >
                      <p className="text-sm font-bold text-[#C99700]">
                        {formatDate(eventItem.date)}
                      </p>
                      <h3 className="mt-1 break-words text-lg font-bold">
                        {eventItem.title || "未命名活動"}
                      </h3>
                      <p className="mt-2 text-sm font-semibold">
                        {eventItem.location || "-"}｜{eventItem.meetingTime || eventItem.dinnerTime || "-"}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

function CalendarGrid({ month, events }: { month: string; events: EventItem[] }) {
  const cells = buildMonthCells(month);

  return (
    <div className="mt-5 grid grid-cols-7 gap-1 text-center text-xs font-bold sm:text-sm">
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
            className="min-h-20 rounded-2xl border border-[#E5D9BD] bg-white p-2 text-left"
          >
            {dateValue ? (
              <>
                <p className="text-xs font-bold text-[#173B73]/70">
                  {Number(dateValue.slice(-2))}
                </p>
                <div className="mt-1 space-y-1">
                  {meetings.map((eventItem) => (
                    <Link
                      key={eventItem.id}
                      href="/events"
                      className="block rounded-xl bg-[#F7C948] px-2 py-1 text-[11px] leading-snug text-[#173B73]"
                    >
                      {eventItem.meetingNo
                        ? `第${eventItem.meetingNo}次例會`
                        : eventItem.title || "例會"}
                    </Link>
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
