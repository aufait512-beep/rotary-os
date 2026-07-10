"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  emptyEventItem,
  EventItem,
  RotaryYear,
  sortEventsByDate,
} from "@/lib/events";
import { deleteEvent, fetchEvents, fetchRotaryYears, upsertEvent } from "@/lib/supabaseData";

type EventFormState = Omit<EventItem, "id">;
type EventField = keyof EventFormState;

const eventFields: {
  name: EventField;
  label: string;
  type?: string;
  inputMode?: "numeric";
}[] = [
  { name: "title", label: "活動名稱" },
  { name: "eventType", label: "活動類型" },
  { name: "meetingNo", label: "第幾次例會", inputMode: "numeric" },
  { name: "date", label: "日期", type: "date" },
  { name: "weekday", label: "星期" },
  { name: "dinnerTime", label: "餐敘時間", type: "time" },
  { name: "meetingTime", label: "開會時間", type: "time" },
  { name: "endTime", label: "結束時間", type: "time" },
  { name: "location", label: "地點" },
  { name: "room", label: "樓層" },
  { name: "topic", label: "主題" },
  { name: "speaker", label: "主講人" },
];

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [years, setYears] = useState<RotaryYear[]>([]);
  const [form, setForm] = useState<EventFormState>(emptyEventItem);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const sortedEvents = useMemo(() => sortEventsByDate(events), [events]);

  async function loadEvents() {
    try {
      setErrorMessage("");
      const [loadedEvents, loadedYears] = await Promise.all([
        fetchEvents(),
        fetchRotaryYears(),
      ]);
      setEvents(loadedEvents);
      setYears(loadedYears);
      const activeYear = loadedYears.find((year) => year.isActive);
      if (activeYear) {
        setForm((currentForm) => ({
          ...currentForm,
          rotaryYearId: currentForm.rotaryYearId || activeYear.id,
        }));
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "活動資料讀取失敗"));
    }
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadEvents();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  function updateField(field: EventField, value: string) {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  }

  function resetForm() {
    setForm(emptyEventItem);
    setEditingId(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    try {
      if (editingId) {
        const savedEvent = await upsertEvent({ ...form, id: editingId });
        setEvents((currentEvents) =>
          currentEvents.map((eventItem) =>
            eventItem.id === editingId ? savedEvent : eventItem
          )
        );
      } else {
        const savedEvent = await upsertEvent({ ...form, id: crypto.randomUUID() });
        setEvents((currentEvents) => [savedEvent, ...currentEvents]);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "活動儲存失敗"));
      return;
    }

    resetForm();
  }

  function handleEdit(eventItem: EventItem) {
    setForm({
      rotaryYearId: eventItem.rotaryYearId,
      title: eventItem.title,
      eventType: eventItem.eventType,
      meetingNo: eventItem.meetingNo,
      date: eventItem.date,
      weekday: eventItem.weekday,
      dinnerTime: eventItem.dinnerTime,
      meetingTime: eventItem.meetingTime,
      endTime: eventItem.endTime,
      location: eventItem.location,
      room: eventItem.room,
      topic: eventItem.topic,
      speaker: eventItem.speaker,
      note: eventItem.note,
    });
    setEditingId(eventItem.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(eventId: string) {
    const confirmed = window.confirm("確定要刪除這筆活動嗎？");
    if (!confirmed) {
      return;
    }

    try {
      setErrorMessage("");
      await deleteEvent(eventId);
      setEvents((currentEvents) =>
        currentEvents.filter((eventItem) => eventItem.id !== eventId)
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "活動刪除失敗"));
      return;
    }
    if (editingId === eventId) {
      resetForm();
    }
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
              ROTARY OS
            </p>
            <h1 className="mt-2 text-3xl font-bold">新增/管理活動</h1>
          </div>
        </header>
        {errorMessage ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">
              {editingId ? "編輯活動" : "新增活動"}
            </h2>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className={`rounded-2xl bg-white px-4 py-2 text-sm font-bold text-[#173B73] ${buttonShadow}`}
              >
                取消
              </button>
            ) : null}
          </div>

          <label className="block">
            <span className="text-sm font-bold">年度</span>
            <select
              value={form.rotaryYearId}
              onChange={(event) => updateField("rotaryYearId", event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base text-[#173B73] outline-none transition focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
            >
              <option value="">未指定年度</option>
              {years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.displayName || year.name}
                </option>
              ))}
            </select>
          </label>

          {eventFields.map((field) => (
            <label key={field.name} className="block">
              <span className="text-sm font-bold">{field.label}</span>
              <input
                type={field.type ?? "text"}
                inputMode={field.inputMode}
                value={form[field.name]}
                onChange={(event) => updateField(field.name, event.target.value)}
                className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base text-[#173B73] outline-none transition focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              />
            </label>
          ))}

          <label className="block">
            <span className="text-sm font-bold">備註</span>
            <textarea
              value={form.note}
              onChange={(event) => updateField("note", event.target.value)}
              rows={4}
              className="mt-2 w-full resize-none rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base text-[#173B73] outline-none transition focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
            />
          </label>

          <button
            type="submit"
            className={`w-full rounded-2xl bg-[#F7C948] py-4 font-bold text-[#173B73] ${buttonShadow}`}
          >
            {editingId ? "儲存修改" : "儲存活動"}
          </button>
        </form>

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <h2 className="text-2xl font-bold">活動列表</h2>
            <Link
              href="/calendar"
              className="text-sm font-bold text-[#173B73]/75 underline underline-offset-4"
            >
              年度行事曆
            </Link>
          </div>

          {sortedEvents.length === 0 ? (
            <div className="rounded-3xl bg-white/75 p-5 text-center font-semibold text-[#173B73]/70 shadow-[6px_6px_16px_rgba(0,0,0,0.1),-6px_-6px_16px_rgba(255,255,255,0.8)]">
              目前尚未建立活動
            </div>
          ) : (
            sortedEvents.map((eventItem) => (
              <article
                key={eventItem.id}
                className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#C99700]">
                      {eventItem.date || "未填日期"} {eventItem.weekday}
                    </p>
                    <h3 className="mt-1 break-words text-xl font-bold">
                      {eventItem.title || "未命名活動"}
                    </h3>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#173B73] px-3 py-1 text-xs font-bold text-white">
                    {eventItem.eventType || "活動"}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-sm font-semibold text-[#173B73]/80">
                  <p>第幾次例會：{eventItem.meetingNo || "-"}</p>
                  <p>
                    時間：{eventItem.dinnerTime || "-"} /{" "}
                    {eventItem.meetingTime || "-"} - {eventItem.endTime || "-"}
                  </p>
                  <p>
                    地點：{eventItem.location || "-"} {eventItem.room}
                  </p>
                  <p>主題：{eventItem.topic || "-"}</p>
                  <p>主講人：{eventItem.speaker || "-"}</p>
                  {eventItem.note ? <p>備註：{eventItem.note}</p> : null}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleEdit(eventItem)}
                    className={`rounded-2xl bg-[#F7C948] py-3 font-bold text-[#173B73] ${buttonShadow}`}
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(eventItem.id)}
                    className={`rounded-2xl bg-white py-3 font-bold text-[#173B73] ${buttonShadow}`}
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? `${fallback}：${error.message}` : fallback;
}
