"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { EventItem, sortEventsByDate } from "@/lib/events";
import {
  emptyProgramItem,
  ProgramItem,
  sortProgramsByDate,
} from "@/lib/programs";
import {
  deleteProgram,
  fetchEvents,
  fetchPrograms,
  upsertProgram,
} from "@/lib/supabaseData";

type ProgramFormState = Omit<ProgramItem, "id">;

type Html2PdfWorker = {
  set: (options: unknown) => Html2PdfWorker;
  from: (element: HTMLElement) => Html2PdfWorker;
  save: () => Promise<void>;
};

type Html2PdfFactory = () => Html2PdfWorker;

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

export default function ProgramsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [programs, setPrograms] = useState<ProgramItem[]>([]);
  const [form, setForm] = useState<ProgramFormState>(emptyProgramItem);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [programNotice, setProgramNotice] = useState("");
  const [showAllEvents, setShowAllEvents] = useState(false);

  const sortedEvents = useMemo(() => sortEventsByDate(events), [events]);
  const sortedPrograms = useMemo(
    () => sortProgramsByDate(programs),
    [programs]
  );
  const selectedEvent = useMemo(
    () => sortedEvents.find((eventItem) => eventItem.id === form.eventId),
    [form.eventId, sortedEvents]
  );
  const selectableEvents = useMemo(
    () =>
      showAllEvents
        ? sortedEvents
        : sortedEvents.filter((eventItem) => isMeetingEvent(eventItem)),
    [showAllEvents, sortedEvents]
  );
  const activeEvent = selectedEvent ?? programToEventFallback(form);
  const upcomingEvents = useMemo(
    () => getUpcomingEvents(activeEvent, sortedEvents),
    [activeEvent, sortedEvents]
  );

  async function loadData() {
    setErrorMessage("");
    setProgramNotice("");

    const [eventsResult, programsResult] = await Promise.allSettled([
      fetchEvents(),
      fetchPrograms(),
    ]);

    if (eventsResult.status === "rejected") {
      console.error(eventsResult.reason);
      setErrorMessage(getErrorMessage(eventsResult.reason, "活動資料讀取失敗"));
      return;
    }

    const loadedEvents = eventsResult.value;
    setEvents(loadedEvents);

    if (programsResult.status === "rejected") {
      console.error(programsResult.reason);
      setErrorMessage(getErrorMessage(programsResult.reason, "程序表資料查詢失敗"));
      setPrograms([]);
    } else {
      setPrograms(programsResult.value);
    }

  }

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadData();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  function resetForm() {
    setForm(emptyProgramItem);
    setEditingId(null);
  }

  function handlePrint() {
    window.print();
  }

  async function handleExportPdf() {
    const programSheet = document.getElementById("program-sheet");
    if (!programSheet) {
      return;
    }

    setIsExportingPdf(true);

    try {
      const html2pdfModule = await import("html2pdf.js");
      const html2pdf = (html2pdfModule.default ??
        html2pdfModule) as Html2PdfFactory;

      await html2pdf()
        .set({
          filename: buildPdfFilename(activeEvent),
          margin: 0,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 3,
            useCORS: true,
            backgroundColor: "#ffffff",
          },
          jsPDF: {
            unit: "mm",
            format: "a4",
            orientation: "portrait",
          },
          pagebreak: { mode: ["avoid-all", "css", "legacy"] },
        })
        .from(programSheet)
        .save();
    } finally {
      setIsExportingPdf(false);
    }
  }

  function handleEventSelect(eventId: string) {
    const eventForProgram = sortedEvents.find(
      (eventItem) => eventItem.id === eventId
    );
    if (!eventForProgram) {
      setForm((currentForm) => ({ ...currentForm, eventId: "" }));
      return;
    }
    applyEventToForm(eventForProgram, programs);
  }

  function applyEventToForm(eventForProgram: EventItem, loadedPrograms: ProgramItem[]) {
    const existingProgram = loadedPrograms.find(
      (program) => program.eventId === eventForProgram.id
    );

    if (existingProgram) {
      handleEdit(existingProgram, false);
      setProgramNotice("");
      return;
    }

    setEditingId(null);
    setProgramNotice("尚未建立程序表");
    setForm((currentForm) => ({
      ...currentForm,
      eventId: eventForProgram.id,
      meetingName: eventForProgram.title,
      date: eventForProgram.date,
      dinnerTime: eventForProgram.dinnerTime,
      meetingTime: eventForProgram.meetingTime,
      location: eventForProgram.location,
      room: eventForProgram.room,
      topic: eventForProgram.topic,
      speaker: eventForProgram.speaker,
    }));
  }

  useEffect(() => {
    if (form.eventId || sortedEvents.length === 0) {
      return;
    }

    const defaultEvent = findDefaultWeeklyMeeting(sortedEvents);
    if (defaultEvent) {
      applyEventToForm(defaultEvent, programs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.eventId, programs, sortedEvents]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    try {
      if (editingId) {
        const savedProgram = await upsertProgram({ ...form, id: editingId });
        setPrograms((currentPrograms) =>
          currentPrograms.map((program) =>
            program.id === editingId ? savedProgram : program
          )
        );
      } else {
        const savedProgram = await upsertProgram({
          ...form,
          id: crypto.randomUUID(),
        });
        setPrograms((currentPrograms) => [savedProgram, ...currentPrograms]);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "程序表儲存失敗"));
      return;
    }

    resetForm();
  }

  function handleEdit(program: ProgramItem, scrollToTop = true) {
    setForm({
      eventId: program.eventId,
      meetingName: program.meetingName,
      date: program.date,
      dinnerTime: program.dinnerTime,
      meetingTime: program.meetingTime,
      location: program.location,
      room: program.room,
      topic: program.topic,
      speaker: program.speaker,
      fellowshipChair: program.fellowshipChair,
      sergeantAtArms: program.sergeantAtArms,
    });
    setEditingId(program.id);
    setProgramNotice("");
    if (scrollToTop) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function handleDelete(programId: string) {
    const confirmed = window.confirm("確定要刪除這份程序表嗎？");
    if (!confirmed) {
      return;
    }

    try {
      setErrorMessage("");
      await deleteProgram(programId);
      setPrograms((currentPrograms) =>
        currentPrograms.filter((program) => program.id !== programId)
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "程序表刪除失敗"));
      return;
    }
    if (editingId === programId) {
      resetForm();
    }
  }

  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="mx-auto max-w-md space-y-3 print:hidden">
          <Link href="/" className="text-sm font-bold text-[#173B73]/75">
            回首頁
          </Link>
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-[#C99700]">
              程序表模組
            </p>
            <h1 className="mt-2 text-3xl font-bold">程序表管理</h1>
          </div>
        </header>
        {errorMessage ? (
          <p className="mx-auto max-w-md rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 print:hidden">
            {errorMessage}
          </p>
        ) : null}
        {programNotice ? (
          <p className="mx-auto max-w-md rounded-2xl bg-white/80 p-4 text-sm font-bold text-[#173B73]/75 print:hidden">
            {programNotice}
          </p>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-md space-y-4 rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)] print:hidden"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">
              {editingId ? "編輯程序表" : "建立程序表"}
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
            <span className="text-sm font-bold">選擇活動</span>
            <select
              value={form.eventId}
              onChange={(event) => handleEventSelect(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base font-semibold text-[#173B73] outline-none transition focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
            >
              <option value="">請選擇一場活動</option>
              {selectableEvents.map((eventItem) => (
                <option key={eventItem.id} value={eventItem.id}>
                  {formatEventOption(eventItem)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={showAllEvents}
              onChange={(event) => setShowAllEvents(event.target.checked)}
            />
            查看其他活動
          </label>

          <label className="block">
            <span className="text-sm font-bold">聯誼長</span>
            <input
              value={form.fellowshipChair}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  fellowshipChair: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base text-[#173B73] outline-none transition focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold">糾察長</span>
            <input
              value={form.sergeantAtArms}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  sergeantAtArms: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base text-[#173B73] outline-none transition focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
            />
          </label>

          <button
            type="submit"
            className={`w-full rounded-2xl bg-[#F7C948] py-4 font-bold text-[#173B73] ${buttonShadow}`}
          >
            {editingId ? "儲存修改" : "儲存程序表"}
          </button>
        </form>

        <section className="space-y-3">
          <div className="mx-auto flex max-w-[210mm] items-center justify-between gap-3 print:hidden">
            <h2 className="text-2xl font-bold">A4 程序表預覽</h2>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className={`rounded-2xl bg-[#F7C948] px-3 py-2 text-sm font-bold text-[#173B73] ${buttonShadow}`}
              >
                🖨️ 列印
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className={`rounded-2xl bg-white px-3 py-2 text-sm font-bold text-[#173B73] disabled:opacity-60 ${buttonShadow}`}
              >
                {isExportingPdf ? "產生中" : "📄 匯出PDF"}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-3xl bg-white/70 p-4 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)] print:overflow-visible print:rounded-none print:bg-white print:p-0 print:shadow-none">
            <div
              id="program-sheet"
              className="program-sheet mx-auto"
            >
              <header className="relative border-b border-black pb-3 text-center">
                <p className="absolute right-0 top-0 text-[14pt]">
                  {formatProgramDate(activeEvent.date)}
                </p>
                <h2 className="pt-8 text-[22pt] font-bold leading-snug">
                  {buildProgramTitle(activeEvent)}
                </h2>
              </header>

              <section className="mt-7">
                <ProgramRow time="19:15">
                  <p>會議開始</p>
                  <p>社長鳴鐘</p>
                  <p>唱扶輪頌</p>
                  <p>介紹主講人</p>
                  <p>介紹社友及來賓</p>
                  <p>唱扶輪社友我們歡迎您</p>

                  <div className="mt-4">
                    <p>請社長帶領社友朗讀 四大考驗</p>
                    <p>
                      四大考驗～我們所想、所說、所做的事應事先捫心自問：
                    </p>
                    <p>1. 是否一切屬於真實？</p>
                    <p>2. 是否各方得到公平？</p>
                    <p>3. 能否促進親善友誼？</p>
                    <p>4. 能否兼顧彼此利益？</p>
                  </div>
                </ProgramRow>

                <ProgramRow time="19:25">
                  <p>社長致詞</p>
                  <p>秘書報告</p>
                </ProgramRow>

                <UpcomingEventsTable events={upcomingEvents} />

                <ProgramRow time="19:35">
                  <p>講師介紹：</p>
                  <p>{activeEvent.speaker || "-"}</p>
                  <p className="mt-3">專題演講：</p>
                  <p>{activeEvent.topic || "-"}</p>
                </ProgramRow>

                <ProgramRow time="20:05">
                  <p>糾察時間</p>
                </ProgramRow>

                <ProgramRow time="20:10">
                  <p>社長鳴鐘，閉會</p>
                </ProgramRow>
              </section>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-md space-y-3 print:hidden">
          <h2 className="text-2xl font-bold">已儲存程序表</h2>
          {sortedPrograms.length === 0 ? (
            <div className="rounded-3xl bg-white/75 p-5 text-center font-semibold text-[#173B73]/70 shadow-[6px_6px_16px_rgba(0,0,0,0.1),-6px_-6px_16px_rgba(255,255,255,0.8)]">
              目前尚未建立程序表
            </div>
          ) : (
            sortedPrograms.map((program) => (
              <article
                key={program.id}
                className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]"
              >
                <p className="text-sm font-bold text-[#C99700]">
                  {formatDateSlash(program.date)}
                </p>
                <h3 className="mt-1 break-words text-xl font-bold">
                  {program.meetingName || "未命名程序表"}
                </h3>
                <div className="mt-3 space-y-1 text-sm font-semibold text-[#173B73]/80">
                  <p>
                    地點：{program.location || "-"} {program.room}
                  </p>
                  <p>主題：{program.topic || "-"}</p>
                  <p>主講人：{program.speaker || "-"}</p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleEdit(program)}
                    className={`rounded-2xl bg-[#F7C948] py-3 font-bold text-[#173B73] ${buttonShadow}`}
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(program.id)}
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

function ProgramRow({
  time,
  children,
}: {
  time: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[27mm_1fr] gap-4 py-1">
      <div className="font-bold">{time}</div>
      <div>{children}</div>
    </div>
  );
}

function UpcomingEventsTable({ events }: { events: EventItem[] }) {
  return (
    <div className="my-4">
      <table className="w-full border-collapse border border-black text-[12pt] leading-snug">
        <thead>
          <tr>
            <th className="w-[18%] border border-black px-2 py-1">日期</th>
            <th className="w-[42%] border border-black px-2 py-1">
              2026年 活動
            </th>
            <th className="w-[18%] border border-black px-2 py-1">時間</th>
            <th className="w-[22%] border border-black px-2 py-1">地點</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr>
              <td className="border border-black px-2 py-2 text-center" colSpan={4}>
                -
              </td>
            </tr>
          ) : (
            events.map((eventItem) => (
              <tr key={eventItem.id}>
                <td className="border border-black px-2 py-2 text-center align-top">
                  <p>{formatAnnouncementDate(eventItem.date)}</p>
                  <p>({formatWeekday(eventItem)})</p>
                </td>
                <td className="border border-black px-2 py-2 align-top">
                  <p>{eventItem.title || "-"}</p>
                  <p>{eventItem.topic || "-"}</p>
                  <p>{eventItem.speaker || "-"}</p>
                  <p>{eventItem.note || "-"}</p>
                </td>
                <td className="border border-black px-2 py-2 align-top">
                  <p>{eventItem.dinnerTime || "-"}</p>
                  <p>{eventItem.meetingTime || "-"}</p>
                </td>
                <td className="border border-black px-2 py-2 align-top">
                  <p>{eventItem.location || "-"}</p>
                  <p>{eventItem.room || "-"}</p>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function getUpcomingEvents(activeEvent: EventItem, events: EventItem[]) {
  const activeDate = parseDate(activeEvent.date);
  if (!activeDate) {
    return [];
  }

  const nextMonth = new Date(activeDate.getFullYear(), activeDate.getMonth() + 1, 1);
  const nextMonthEnd = new Date(activeDate.getFullYear(), activeDate.getMonth() + 2, 0);

  return sortEventsByDate(
    events.filter((eventItem) => {
      const eventDate = parseDate(eventItem.date);
      if (!eventDate || eventItem.id === activeEvent.id || eventDate <= activeDate) {
        return false;
      }

      const sameMonthAfter =
        eventDate.getFullYear() === activeDate.getFullYear() &&
        eventDate.getMonth() === activeDate.getMonth();
      const inNextMonth = eventDate >= nextMonth && eventDate <= nextMonthEnd;

      return sameMonthAfter || inNextMonth;
    })
  );
}

function programToEventFallback(program: ProgramFormState): EventItem {
  return {
    id: program.eventId,
    rotaryYearId: "",
    title: program.meetingName,
    eventType: "",
    meetingNo: "",
    date: program.date,
    weekday: "",
    dinnerTime: program.dinnerTime,
    meetingTime: program.meetingTime,
    endTime: "",
    location: program.location,
    room: program.room,
    topic: program.topic,
    speaker: program.speaker,
    note: "",
  };
}

function buildProgramTitle(eventItem: EventItem) {
  if (!eventItem.meetingNo) {
    return "高雄晨光扶輪社 2026-2027 年度 程序表";
  }

  return `高雄晨光扶輪社 第${eventItem.meetingNo}次例會 程序表`;
}

function buildPdfFilename(eventItem: EventItem) {
  const meetingNo = sanitizeFilenamePart(eventItem.meetingNo || "XXX");
  return `高雄晨光扶輪社_第${meetingNo}次例會_程序表.pdf`;
}

function sanitizeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "").trim() || "XXX";
}

function formatProgramDate(dateValue: string) {
  const date = parseDate(dateValue);
  if (!date) {
    return "";
  }

  return `${date.getFullYear()}. ${date.getMonth() + 1}. ${date.getDate()}.`;
}

function formatAnnouncementDate(dateValue: string) {
  const date = parseDate(dateValue);
  if (!date) {
    return "-";
  }

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatWeekday(eventItem: EventItem) {
  if (eventItem.weekday) {
    return eventItem.weekday.replace(/^星期/, "");
  }

  const date = parseDate(eventItem.date);
  if (!date) {
    return "-";
  }

  return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
}

function formatDateSlash(dateValue: string) {
  if (!dateValue) {
    return "未填日期";
  }

  return dateValue.replaceAll("-", "/");
}

function parseDate(dateValue: string) {
  if (!dateValue) {
    return null;
  }

  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function isMeetingEvent(eventItem: EventItem) {
  return eventItem.eventType.includes("例會") || eventItem.meetingNo.trim() !== "";
}

function findDefaultWeeklyMeeting(events: EventItem[]) {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(today.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const weeklyMeetings = sortEventsByDate(events).filter((eventItem) => {
    if (!isMeetingEvent(eventItem)) return false;
    const eventDate = parseDate(eventItem.date);
    return eventDate ? eventDate >= monday && eventDate <= sunday : false;
  });

  return weeklyMeetings[0] ?? sortEventsByDate(events).find(isMeetingEvent) ?? null;
}

function formatEventOption(eventItem: EventItem) {
  const meetingNo = eventItem.meetingNo ? `第${eventItem.meetingNo}次例會` : "一般活動";
  return `${meetingNo}｜${formatDateSlash(eventItem.date)}｜${eventItem.title || "未命名活動"}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? `${fallback}：${error.message}` : fallback;
}
