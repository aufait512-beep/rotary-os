"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  defaultEventTimes,
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
  const [expandedEventId, setExpandedEventId] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const sortedEvents = useMemo(() => sortEventsByDate(events), [events]);
  const activeYearId = years.find((year) => year.isActive)?.id || years[0]?.id || "";

  async function loadEvents() {
    try {
      setErrorMessage("");
      const [loadedEvents, loadedYears] = await Promise.all([
        fetchEvents(),
        fetchRotaryYears(),
      ]);
      setEvents(loadedEvents);
      setYears(loadedYears);
      const activeYear = loadedYears.find((year) => year.isActive) ?? loadedYears[0];
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
    setForm({ ...emptyEventItem, ...defaultEventTimes, rotaryYearId: activeYearId });
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
        setExpandedEventId(savedEvent.id);
      } else {
        const savedEvent = await upsertEvent({ ...form, id: crypto.randomUUID() });
        setEvents((currentEvents) => [savedEvent, ...currentEvents]);
        setExpandedEventId("");
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "活動儲存失敗"));
      return;
    }

    resetForm();
    setIsFormOpen(false);
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
    setExpandedEventId(eventItem.id);
    setIsFormOpen(true);
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
      setIsFormOpen(false);
    }
    if (expandedEventId === eventId) {
      setExpandedEventId("");
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
              Rotary OS
            </p>
            <h1 className="mt-2 text-3xl font-bold">新增/管理活動</h1>
          </div>
        </header>
        {errorMessage ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <section className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
          <button
            type="button"
            onClick={() => {
              if (isFormOpen && editingId) {
                resetForm();
              } else if (!isFormOpen && !editingId) {
                resetForm();
              }
              setIsFormOpen((currentValue) => !currentValue);
            }}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="text-xl font-bold">
              {editingId ? "編輯活動" : "新增活動"}
            </span>
            <span className={`rounded-2xl bg-[#F7C948] px-4 py-2 text-sm font-bold ${buttonShadow}`}>
              {isFormOpen ? "收合" : "展開"}
            </span>
          </button>

          {isFormOpen ? (
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
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

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="submit"
                  className={`rounded-2xl bg-[#F7C948] py-4 font-bold text-[#173B73] ${buttonShadow}`}
                >
                  {editingId ? "儲存修改" : "儲存活動"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsFormOpen(false);
                  }}
                  className={`rounded-2xl bg-white py-4 font-bold text-[#173B73] ${buttonShadow}`}
                >
                  取消
                </button>
              </div>
            </form>
          ) : null}
        </section>

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
            sortedEvents.map((eventItem) => {
              const isExpanded = expandedEventId === eventItem.id;
              const year = years.find((item) => item.id === eventItem.rotaryYearId);

              return (
                <article
                  key={eventItem.id}
                  className="min-w-0 rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]"
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
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#C99700]">
                          {eventItem.meetingNo ? `第${eventItem.meetingNo}次例會` : eventItem.eventType || "活動"}
                        </p>
                        <h3 className="mt-1 break-words text-xl font-bold">
                          {eventItem.title || "未命名活動"}
                        </h3>
                        <p className="mt-2 break-words text-sm font-semibold text-[#173B73]/80">
                          {formatDate(eventItem.date)}｜{formatEventTime(eventItem)}
                        </p>
                        <p className="mt-1 break-words text-sm font-semibold text-[#173B73]/80">
                          {eventItem.location || "-"} {eventItem.room}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#173B73] px-3 py-1 text-xs font-bold text-white">
                        {isExpanded ? "收合" : "展開"}
                      </span>
                    </div>
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
                          onClick={() => setExpandedEventId("")}
                          className={`rounded-2xl bg-white py-3 font-bold text-[#173B73] ${buttonShadow}`}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(eventItem)}
                          className={`rounded-2xl bg-white py-3 font-bold text-[#173B73] ${buttonShadow}`}
                        >
                          儲存
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(eventItem.id)}
                          className={`rounded-2xl bg-white py-3 font-bold text-[#173B73] ${buttonShadow}`}
                        >
                          刪除
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </section>
      </section>
    </main>
  );
}

function formatDate(dateValue: string) {
  return dateValue ? dateValue.replaceAll("-", "/") : "未填日期";
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

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? `${fallback}：${error.message}` : fallback;
}
