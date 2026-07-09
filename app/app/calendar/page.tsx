"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EventItem, sortEventsByDate } from "@/lib/events";
import { fetchEvents } from "@/lib/supabaseData";

const YEAR_START = "2026-07-01";
const YEAR_END = "2027-06-30";

export default function CalendarPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadEvents() {
    try {
      setErrorMessage("");
      setEvents(await fetchEvents());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? `活動資料讀取失敗：${error.message}` : "活動資料讀取失敗"
      );
    }
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadEvents();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  const annualEvents = useMemo(() => {
    return sortEventsByDate(
      events.filter(
        (eventItem) =>
          eventItem.date >= YEAR_START && eventItem.date <= YEAR_END
      )
    );
  }, [events]);

  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <section className="mx-auto max-w-md space-y-6">
        <header className="space-y-3">
          <Link href="/" className="text-sm font-bold text-[#173B73]/75">
            回首頁
          </Link>
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-[#C99700]">
              ROTARY OS
            </p>
            <h1 className="mt-2 text-3xl font-bold">年度行事曆</h1>
            <p className="mt-2 text-sm font-semibold text-[#173B73]/70">
              2026/07/01 到 2027/06/30
            </p>
          </div>
        </header>
        {errorMessage ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <div className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">活動清單</h2>
            <Link
              href="/events"
              className="rounded-2xl bg-[#F7C948] px-4 py-2 text-sm font-bold text-[#173B73] shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner"
            >
              管理活動
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
                  <div className="mt-3 space-y-1 text-sm font-semibold text-[#173B73]/80">
                    <p>地點：{eventItem.location || "-"}</p>
                    <p>
                      時間：{eventItem.dinnerTime || "-"} /{" "}
                      {eventItem.meetingTime || "-"} -{" "}
                      {eventItem.endTime || "-"}
                    </p>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function formatDate(dateValue: string) {
  if (!dateValue) {
    return "未填日期";
  }

  return dateValue.replaceAll("-", "/");
}
