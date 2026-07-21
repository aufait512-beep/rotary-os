"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { EventItem, sortEventsByDate } from "@/lib/events";
import { emptyProgramItem, ProgramItem, sortProgramsByDate } from "@/lib/programs";
import { fetchProgramTemplates, ProgramTemplate, ProgramTemplateBlock } from "@/lib/programTemplates";
import { ProgramTemplateManager } from "./ProgramTemplateManager";
import {
  deleteProgram,
  fetchEvents,
  fetchPrograms,
  insertProgram,
  updateProgram,
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
  const [isExportingJpg, setIsExportingJpg] = useState(false);
  const [templates, setTemplates] = useState<ProgramTemplate[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [programErrorMessage, setProgramErrorMessage] = useState("");
  const [programNotice, setProgramNotice] = useState("");
  const [showAllEvents, setShowAllEvents] = useState(false);

  const sortedEvents = useMemo(() => sortEventsByDate(events), [events]);
  const sortedPrograms = useMemo(() => sortProgramsByDate(programs), [programs]);
  const selectedEvent = useMemo(
    () => sortedEvents.find((eventItem) => eventItem.id === form.eventId),
    [form.eventId, sortedEvents]
  );
  const selectableEvents = useMemo(
    () => showAllEvents ? sortedEvents : sortedEvents.filter((eventItem) => isMeetingEvent(eventItem)),
    [showAllEvents, sortedEvents]
  );
  const activeEvent = selectedEvent ?? programToEventFallback(form);
  const activeTemplate = useMemo(
    () => templates.find((template) => template.id === form.templateId) ?? findTemplateForEvent(activeEvent, templates),
    [activeEvent, form.templateId, templates]
  );
  const upcomingEvents = useMemo(
    () => getUpcomingEvents(activeEvent, sortedEvents, form.upcomingRangeMode, form.upcomingStartDate, form.upcomingEndDate),
    [activeEvent, form.upcomingEndDate, form.upcomingRangeMode, form.upcomingStartDate, sortedEvents]
  );

  async function loadData() {
    setErrorMessage("");
    setProgramErrorMessage("");
    setProgramNotice("");

    const [eventsResult, programsResult, templatesResult] = await Promise.allSettled([
      fetchEvents(),
      fetchPrograms(),
      fetchProgramTemplates(),
    ]);

    if (eventsResult.status === "rejected") {
      console.error({
        module: "programs",
        operation: "fetch events",
        table: "events",
        error: eventsResult.reason,
      });
      setErrorMessage(getErrorMessage(eventsResult.reason, "活動資料讀取失敗"));
      return;
    }

    const loadedEvents = eventsResult.value;
    setEvents(loadedEvents);

    if (programsResult.status === "rejected") {
      console.error({
        module: "programs",
        operation: "fetch programs",
        table: "programs",
        error: programsResult.reason,
      });
      setProgramErrorMessage("程序表資料讀取失敗，請重新整理後再試。");
      setPrograms([]);
    } else {
      setPrograms(programsResult.value);
    }
    if (templatesResult.status === "fulfilled") setTemplates(templatesResult.value);
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
    if (!programSheet) return;

    setIsExportingPdf(true);
    try {
      const html2pdfModule = await import("html2pdf.js");
      const html2pdf = (html2pdfModule.default ?? html2pdfModule) as Html2PdfFactory;

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
          pagebreak: activeTemplate?.templateType === "board"
            ? { mode: ["css", "legacy"] }
            : { mode: ["avoid-all", "css", "legacy"] },
        })
        .from(programSheet)
        .save();
    } finally {
      setIsExportingPdf(false);
    }
  }

  async function handleExportJpg() {
    const programSheet = document.getElementById("program-sheet");
    if (!programSheet) return;
    setIsExportingJpg(true);
    try {
      const html2canvasModule = await import("html2canvas");
      const canvas = await html2canvasModule.default(programSheet, {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.download = buildPdfFilename(activeEvent).replace(/\.pdf$/i, ".jpg");
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
    } finally {
      setIsExportingJpg(false);
    }
  }

  function handleEventSelect(eventId: string) {
    const eventForProgram = sortedEvents.find((eventItem) => eventItem.id === eventId);
    if (!eventForProgram) {
      setForm((currentForm) => ({ ...currentForm, eventId: "" }));
      return;
    }
    applyEventToForm(eventForProgram, programs);
  }

  function applyEventToForm(eventForProgram: EventItem, loadedPrograms: ProgramItem[]) {
    const existingProgram = loadedPrograms.find((program) => program.eventId === eventForProgram.id);

    if (existingProgram) {
      handleEdit(mergeProgramWithEvent(existingProgram, eventForProgram), false);
      setProgramNotice("");
      return;
    }

    setEditingId(null);
    setProgramNotice("此活動尚未建立程序表，請確認後儲存。");
    setForm((currentForm) => ({
      ...currentForm,
      templateId: findTemplateForEvent(eventForProgram, templates)?.id ?? "",
      eventId: eventForProgram.id,
      meetingName: eventForProgram.title,
      date: eventForProgram.date,
      dinnerTime: eventForProgram.dinnerTime,
      meetingTime: eventForProgram.meetingTime,
      location: eventForProgram.location,
      room: eventForProgram.room,
      topic: eventForProgram.topic,
      speaker: eventForProgram.speaker,
      upcomingRangeMode: "2_months",
      upcomingStartDate: "",
      upcomingEndDate: "",
      upcomingInsertPosition: eventForProgram.eventType.includes("理監事") ? "after_reports" : "template",
    }));
  }

  useEffect(() => {
    if (form.eventId || sortedEvents.length === 0) return;
    const defaultEvent = findDefaultWeeklyMeeting(sortedEvents);
    if (defaultEvent) applyEventToForm(defaultEvent, programs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.eventId, programs, sortedEvents]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setProgramNotice("");

    if (!form.eventId) {
      setErrorMessage("請先選擇例會活動。");
      return;
    }

    const linkedEvent = sortedEvents.find((eventItem) => eventItem.id === form.eventId);
    if (!linkedEvent) {
      setErrorMessage("請先選擇例會活動。");
      return;
    }

    const existingProgram = programs.find(
      (program) => program.eventId === form.eventId && program.id !== editingId
    );
    if (existingProgram) {
      const editableProgram = mergeProgramWithEvent(existingProgram, linkedEvent);
      handleEdit(editableProgram, false);
      setProgramNotice("此活動已有程序表，已切換為編輯既有紀錄。");
      return;
    }

    const payload = buildProgramForSave(form, linkedEvent, editingId ?? crypto.randomUUID());

    try {
      const savedProgram = editingId ? await updateProgram(payload) : await insertProgram(payload);
      const reloadedPrograms = await fetchPrograms();
      setPrograms(reloadedPrograms);
      setEditingId(savedProgram.id);
      setForm(programToForm(mergeProgramWithEvent(savedProgram, linkedEvent)));
      setProgramNotice("程序表已儲存。");
    } catch (error) {
      console.error({
        module: "programs",
        operation: editingId ? "update program" : "insert program",
        table: "programs",
        payload,
        error,
      });
      setErrorMessage(getErrorMessage(error, "程序表儲存失敗"));
    }
  }

  function handleEdit(program: ProgramItem, scrollToTop = true) {
    setForm(programToForm(program));
    setEditingId(program.id);
    setProgramNotice("");
    if (scrollToTop) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(programId: string) {
    if (!window.confirm("確定要刪除此程序表嗎？")) return;

    try {
      setErrorMessage("");
      await deleteProgram(programId);
      setPrograms((currentPrograms) => currentPrograms.filter((program) => program.id !== programId));
    } catch (error) {
      console.error({
        module: "programs",
        operation: "delete program",
        table: "programs",
        error,
      });
      setErrorMessage(getErrorMessage(error, "程序表刪除失敗"));
      return;
    }
    if (editingId === programId) resetForm();
  }

  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <section className="mx-auto max-w-5xl space-y-6">
        <header className="mx-auto max-w-md space-y-3 print:hidden">
          <Link href="/" className="text-sm font-bold text-[#173B73]/75">
            返回首頁
          </Link>
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-[#C99700]">Rotary OS</p>
            <h1 className="mt-2 text-3xl font-bold">程序表管理</h1>
          </div>
        </header>

        {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}
        {programNotice ? <Notice tone="info">{programNotice}</Notice> : null}
        {programErrorMessage ? <Notice tone="error">{programErrorMessage}</Notice> : null}

        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-md space-y-4 rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)] print:hidden"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">{editingId ? "編輯程序表" : "新增程序表"}</h2>
            {editingId ? (
              <button type="button" onClick={resetForm} className={"rounded-2xl bg-white px-4 py-2 text-sm font-bold text-[#173B73] " + buttonShadow}>
                清空
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
              <option value="">請選擇例會活動</option>
              {selectableEvents.map((eventItem) => (
                <option key={eventItem.id} value={eventItem.id}>{formatEventOption(eventItem)}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-bold">活動預告範圍</span>
            <select
              value={form.upcomingRangeMode}
              onChange={(event) => setForm((currentForm) => ({ ...currentForm, upcomingRangeMode: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base font-semibold text-[#173B73] outline-none transition focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
            >
              <option value="30_days">未來 30 天</option>
              <option value="2_months">未來 2 個月（預設）</option>
              <option value="3_months">未來 3 個月</option>
              <option value="count_3">未來 3 場</option>
              <option value="count_5">未來 5 場</option>
              <option value="all">全部未來活動</option>
              <option value="custom">自訂日期範圍</option>
            </select>
          </label>

          {form.upcomingRangeMode === "custom" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField label="活動預告開始日期" value={form.upcomingStartDate} type="date" onChange={(value) => setForm((currentForm) => ({ ...currentForm, upcomingStartDate: value }))} />
              <TextField label="活動預告結束日期" value={form.upcomingEndDate} type="date" onChange={(value) => setForm((currentForm) => ({ ...currentForm, upcomingEndDate: value }))} />
            </div>
          ) : null}

          <label className="block">
            <span className="text-sm font-bold">活動預告插入位置</span>
            <select
              value={form.upcomingInsertPosition}
              onChange={(event) => setForm((currentForm) => ({ ...currentForm, upcomingInsertPosition: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base font-semibold text-[#173B73] outline-none transition focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
            >
              <option value="template">依模板設定</option>
              <option value="after_reports">報告事項後</option>
              <option value="after_secretary">秘書報告後</option>
              <option value="bottom">程序表最下方</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-bold">套用程序模板</span>
            <select
              value={form.templateId}
              onChange={(event) => setForm((currentForm) => ({ ...currentForm, templateId: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base font-semibold text-[#173B73] outline-none transition focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
            >
              <option value="">依活動類型自動套用</option>
              {templates.filter((template) => template.isActive && (!activeEvent.rotaryYearId || template.rotaryYearId === activeEvent.rotaryYearId)).map((template) => (
                <option key={template.id} value={template.id}>{template.name}</option>
              ))}
            </select>
            <p className="mt-2 text-xs font-semibold text-[#173B73]/65">選擇後，A4 預覽會立即切換；按「儲存程序表」後會記住本次選擇。</p>
          </label>

          <label className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" checked={showAllEvents} onChange={(event) => setShowAllEvents(event.target.checked)} />
            顯示所有活動
          </label>

          <TextField label="聯誼長" value={form.fellowshipChair} onChange={(value) => setForm((currentForm) => ({ ...currentForm, fellowshipChair: value }))} />
          <TextField label="糾察長" value={form.sergeantAtArms} onChange={(value) => setForm((currentForm) => ({ ...currentForm, sergeantAtArms: value }))} />

          <button type="submit" className={"w-full rounded-2xl bg-[#F7C948] py-4 font-bold text-[#173B73] " + buttonShadow}>
            {editingId ? "儲存修改" : "儲存程序表"}
          </button>
        </form>

        <section className="space-y-3">
          <div className="mx-auto flex max-w-[210mm] items-center justify-between gap-3 print:hidden">
            <h2 className="text-2xl font-bold">A4 程序表預覽</h2>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={handlePrint} className={"rounded-2xl bg-[#F7C948] px-3 py-2 text-sm font-bold text-[#173B73] " + buttonShadow}>
                列印
              </button>
              <button type="button" onClick={handleExportPdf} disabled={isExportingPdf} className={"rounded-2xl bg-white px-3 py-2 text-sm font-bold text-[#173B73] disabled:opacity-60 " + buttonShadow}>
                {isExportingPdf ? "匯出中" : "匯出 PDF"}
              </button>
              <button type="button" onClick={handleExportJpg} disabled={isExportingJpg} className={"rounded-2xl bg-white px-3 py-2 text-sm font-bold text-[#173B73] disabled:opacity-60 " + buttonShadow}>
                {isExportingJpg ? "匯出中" : "匯出 JPG"}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-3xl bg-white/70 p-4 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)] print:overflow-visible print:rounded-none print:bg-white print:p-0 print:shadow-none">
            <div
              id="program-sheet"
              className={`program-sheet mx-auto ${activeTemplate?.templateType === "board" ? "program-sheet--multipage" : "program-sheet--single-page"}`}
            >
              <header className="program-header relative border-b border-black text-center">
                <p className="program-date absolute right-0 top-0">{formatProgramDate(activeEvent.date)}</p>
                <h2 className="program-title font-bold leading-snug">{buildProgramTitle(activeEvent)}</h2>
              </header>

              <section className="program-body">
                <ProgramTemplateContent template={activeTemplate} event={activeEvent} upcomingEvents={upcomingEvents} insertPosition={form.upcomingInsertPosition} />
              </section>
            </div>
          </div>
        </section>

        <ProgramTemplateManager rotaryYearId={activeEvent.rotaryYearId} onTemplatesChanged={setTemplates} />

        <section className="mx-auto max-w-md space-y-3 print:hidden">
          <h2 className="text-2xl font-bold">已儲存程序表</h2>
          {programErrorMessage ? (
            <div className="rounded-3xl bg-red-50 p-5 text-center font-semibold text-red-700 shadow-[6px_6px_16px_rgba(0,0,0,0.1),-6px_-6px_16px_rgba(255,255,255,0.8)]">
              {programErrorMessage}
            </div>
          ) : sortedPrograms.length === 0 ? (
            <div className="rounded-3xl bg-white/75 p-5 text-center font-semibold text-[#173B73]/70 shadow-[6px_6px_16px_rgba(0,0,0,0.1),-6px_-6px_16px_rgba(255,255,255,0.8)]">
              尚未建立程序表
            </div>
          ) : (
            sortedPrograms.map((program) => {
              const linkedEvent = sortedEvents.find((eventItem) => eventItem.id === program.eventId);
              const displayProgram = linkedEvent ? mergeProgramWithEvent(program, linkedEvent) : program;
              return (
                <article key={program.id} className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
                  <p className="text-sm font-bold text-[#C99700]">{displayProgram.eventId ? formatDateSlash(displayProgram.date) : "此程序表尚未連結活動"}</p>
                  <h3 className="mt-1 break-words text-xl font-bold">{displayProgram.meetingName || "未命名程序表"}</h3>
                  <div className="mt-3 space-y-1 text-sm font-semibold text-[#173B73]/80">
                    <p>地點：{displayProgram.location || "-"} {displayProgram.room}</p>
                    <p>主題：{displayProgram.topic || "-"}</p>
                    <p>主講人：{displayProgram.speaker || "-"}</p>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <button type="button" onClick={() => handleEdit(displayProgram)} className={"rounded-2xl bg-[#F7C948] py-3 font-bold text-[#173B73] " + buttonShadow}>編輯</button>
                    <button type="button" onClick={() => handleDelete(program.id)} className={"rounded-2xl bg-white py-3 font-bold text-[#173B73] " + buttonShadow}>刪除</button>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </section>
    </main>
  );
}

function Notice({ tone, children }: { tone: "error" | "info"; children: React.ReactNode }) {
  const className = tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "bg-white/80 text-[#173B73]/75";
  return <p className={"mx-auto max-w-md rounded-2xl p-4 text-sm font-bold print:hidden " + className}>{children}</p>;
}

function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-bold">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base text-[#173B73] outline-none transition focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]" />
    </label>
  );
}

function ProgramTemplateContent({ template, event, upcomingEvents, insertPosition }: { template?: ProgramTemplate; event: EventItem; upcomingEvents: EventItem[]; insertPosition: string }) {
  const sourceBlocks = template?.blocks.filter((block) => block.isActive && block.blockKey !== "main_agenda") ?? regularMeetingFallback();
  const blocks = positionUpcomingBlock(sourceBlocks, insertPosition);
  return (
    <>
      {blocks.map((block) => {
        if (block.blockKey === "upcoming_events") return <UpcomingEventsTable key={block.id} events={upcomingEvents} />;
        const content = resolveBlockContent(block.content, event);
        return (
          <ProgramRow
            key={block.id}
            time={block.startTime}
            className={`${block.blockKey === "keynote" ? "speaker-session" : ""} ${["proposals", "motions", "discussion_items"].includes(block.blockKey) ? "program-discussion-row" : ""}`}
          >
            <p className="program-block-title">{block.title}</p>
            {content ? <div className={block.blockKey === "four_way_test" ? "four-way-test whitespace-pre-line" : "program-block-content whitespace-pre-line"}>{content}</div> : null}
          </ProgramRow>
        );
      })}
    </>
  );
}

function positionUpcomingBlock(blocks: ProgramTemplateBlock[], insertPosition: string) {
  if (insertPosition === "template") return blocks;
  const upcoming = blocks.find((block) => block.blockKey === "upcoming_events") ?? regularMeetingFallback().find((block) => block.blockKey === "upcoming_events");
  if (!upcoming) return blocks;
  const withoutUpcoming = blocks.filter((block) => block.blockKey !== "upcoming_events");
  if (insertPosition === "bottom") return [...withoutUpcoming, upcoming];
  const keys = insertPosition === "after_reports"
    ? ["finance_report", "reports", "club_reports"]
    : ["president_secretary", "secretary_report", "club_reports"];
  const targetIndex = withoutUpcoming.findLastIndex((block) => keys.includes(block.blockKey));
  if (targetIndex < 0) return [...withoutUpcoming, upcoming];
  return [...withoutUpcoming.slice(0, targetIndex + 1), upcoming, ...withoutUpcoming.slice(targetIndex + 1)];
}

function regularMeetingFallback(): ProgramTemplateBlock[] {
  const rows: Array<[string, string, string, string]> = [
    ["fellowship", "18:30", "餐敘聯誼", ""],
    ["opening", "19:15", "會議開始／社長鳴鐘", ""],
    ["rotary_song", "", "唱扶輪頌", ""],
    ["welcome_song", "", "扶輪社友，我們歡迎您", "友社來賓參與時唱"],
    ["four_way_test", "", "請社長帶領社友朗讀 四大考驗", "四大考驗－我們所想、所說、所做的事應事先捫心自問：\n1. 是否一切屬於真實？\n2. 是否各方得到公平？\n3. 能否促進親善友誼？\n4. 能否兼顧彼此利益？"],
    ["introduce_guests", "", "介紹社友及來賓", ""],
    ["introduce_speaker", "", "介紹主講人", "{{speaker}}"],
    ["president_secretary", "19:25", "社長致詞／秘書報告", ""],
    ["keynote", "19:35", "專題演講", "{{topic}}"],
    ["qa", "20:10", "Q&A", ""],
    ["sergeant", "20:15", "糾察時間", ""],
    ["closing", "20:20", "社長鳴鐘閉會", ""],
    ["upcoming_events", "", "活動預告", "{{upcoming_events}}"],
  ];
  return rows.map(([blockKey, startTime, title, content], index) => ({
    id: `fallback-${blockKey}`,
    templateId: "fallback",
    blockKey,
    title,
    content,
    startTime,
    sortOrder: (index + 1) * 10,
    isActive: true,
  }));
}

function resolveBlockContent(content: string, event: EventItem) {
  return content
    .replaceAll("{{speaker}}", event.speaker || "-")
    .replaceAll("{{topic}}", event.topic || "-")
    .replaceAll("{{upcoming_events}}", "");
}

function findTemplateForEvent(event: EventItem, templates: ProgramTemplate[]) {
  const type = event.eventType;
  const targetType = type.includes("慶生") || type.includes("結婚")
    ? "celebration"
    : type.includes("理監事")
      ? "board"
      : type.includes("社區服務")
        ? "service"
        : type.includes("新社員") || type.includes("入社")
          ? "induction"
          : "regular";
  return templates.find((template) => template.rotaryYearId === event.rotaryYearId && template.templateType === targetType)
    ?? templates.find((template) => template.templateType === targetType);
}

function ProgramRow({ time, children, className = "" }: { time: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={"program-row grid grid-cols-[22mm_1fr] gap-2 " + className}>
      <div className="program-time font-bold">{time}</div>
      <div>{children}</div>
    </div>
  );
}

function UpcomingEventsTable({ events }: { events: EventItem[] }) {
  return (
    <div className="upcoming-events-block">
      <table className="program-upcoming-table w-full border-collapse border border-black leading-snug">
        <thead>
          <tr>
            <th className="w-[18%] border border-black">日期</th>
            <th className="w-[42%] border border-black">2026年 活動</th>
            <th className="w-[18%] border border-black">時間</th>
            <th className="w-[22%] border border-black">地點</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 ? (
            <tr><td className="border border-black text-center" colSpan={4}>-</td></tr>
          ) : (
            events.map((eventItem) => (
              <tr key={eventItem.id}>
                <td className="border border-black text-center align-top"><p>{formatAnnouncementDate(eventItem.date)}</p><p>({formatWeekday(eventItem)})</p></td>
                <td className="border border-black align-top"><p>{eventItem.title || "-"}</p><p>{eventItem.topic || "-"}</p><p>{eventItem.speaker || "-"}</p><p>{eventItem.note || "-"}</p></td>
                <td className="border border-black align-top"><p>{eventItem.dinnerTime || "-"}</p><p>{eventItem.meetingTime || "-"}</p></td>
                <td className="border border-black align-top"><p>{eventItem.location || "-"}</p><p>{eventItem.room || "-"}</p></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function getUpcomingEvents(activeEvent: EventItem, events: EventItem[], rangeMode: string, customStart: string, customEnd: string) {
  const activeDate = parseDate(activeEvent.date);
  if (!activeDate) return [];
  const futureEvents = sortEventsByDate(events.filter((eventItem) => {
    const eventDate = parseDate(eventItem.date);
    return Boolean(eventDate && eventItem.id !== activeEvent.id && eventDate > activeDate);
  }));
  if (rangeMode === "count_3") return futureEvents.slice(0, 3);
  if (rangeMode === "count_5") return futureEvents.slice(0, 5);
  if (rangeMode === "all") return futureEvents;

  const startDate = rangeMode === "custom" ? (parseDate(customStart) ?? new Date(activeDate.getTime() + 86_400_000)) : new Date(activeDate.getTime() + 86_400_000);
  const endDate = rangeMode === "custom"
    ? (parseDate(customEnd) ?? addMonths(activeDate, 2))
    : rangeMode === "30_days"
      ? new Date(activeDate.getTime() + 30 * 86_400_000)
      : addMonths(activeDate, rangeMode === "3_months" ? 3 : 2);
  return futureEvents.filter((eventItem) => {
    const eventDate = parseDate(eventItem.date);
    return Boolean(eventDate && eventDate >= startDate && eventDate <= endDate);
  });
}

function addMonths(date: Date, months: number) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + months + 1, 0).getDate();
  return new Date(date.getFullYear(), date.getMonth() + months, Math.min(date.getDate(), lastDay));
}

function mergeProgramWithEvent(program: ProgramItem, eventItem: EventItem): ProgramItem {
  return {
    ...program,
    eventId: program.eventId || eventItem.id,
    meetingName: program.meetingName || eventItem.title,
    date: program.date || eventItem.date,
    dinnerTime: program.dinnerTime || eventItem.dinnerTime,
    meetingTime: program.meetingTime || eventItem.meetingTime,
    location: program.location || eventItem.location,
    room: program.room || eventItem.room,
    topic: program.topic || eventItem.topic,
    speaker: program.speaker || eventItem.speaker,
    fellowshipChair: program.fellowshipChair || eventItem.fellowshipChair,
    sergeantAtArms: program.sergeantAtArms || eventItem.sergeantAtArms,
  };
}

function programToForm(program: ProgramItem): ProgramFormState {
  return {
    templateId: program.templateId,
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
    upcomingRangeMode: program.upcomingRangeMode,
    upcomingStartDate: program.upcomingStartDate,
    upcomingEndDate: program.upcomingEndDate,
    upcomingInsertPosition: program.upcomingInsertPosition,
  };
}

function buildProgramForSave(form: ProgramFormState, eventItem: EventItem, programId: string): ProgramItem {
  return {
    id: programId,
    templateId: form.templateId,
    eventId: eventItem.id,
    meetingName: form.meetingName || eventItem.title,
    date: eventItem.date,
    dinnerTime: eventItem.dinnerTime,
    meetingTime: eventItem.meetingTime,
    location: eventItem.location,
    room: eventItem.room,
    topic: eventItem.topic,
    speaker: eventItem.speaker,
    fellowshipChair: form.fellowshipChair || eventItem.fellowshipChair,
    sergeantAtArms: form.sergeantAtArms || eventItem.sergeantAtArms,
    upcomingRangeMode: form.upcomingRangeMode,
    upcomingStartDate: form.upcomingStartDate,
    upcomingEndDate: form.upcomingEndDate,
    upcomingInsertPosition: form.upcomingInsertPosition,
  };
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
    fellowshipChair: program.fellowshipChair,
    sergeantAtArms: program.sergeantAtArms,
    description: "",
    note: "",
    eventMealAmount: 0,
  };
}

function buildProgramTitle(eventItem: EventItem) {
  if (!eventItem.meetingNo) return "高雄晨光扶輪社 2026-2027 年度 程序表";
  return "高雄晨光扶輪社 第" + eventItem.meetingNo + "次例會 程序表";
}

function buildPdfFilename(eventItem: EventItem) {
  const meetingNo = sanitizeFilenamePart(eventItem.meetingNo || "XXX");
  return "高雄晨光扶輪社_第" + meetingNo + "次例會_程序表.pdf";
}

function sanitizeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "").trim() || "XXX";
}

function formatProgramDate(dateValue: string) {
  const date = parseDate(dateValue);
  if (!date) return "";
  return date.getFullYear() + ". " + (date.getMonth() + 1) + ". " + date.getDate() + ".";
}

function formatAnnouncementDate(dateValue: string) {
  const date = parseDate(dateValue);
  if (!date) return "-";
  return (date.getMonth() + 1) + "/" + date.getDate();
}

function formatWeekday(eventItem: EventItem) {
  if (eventItem.weekday) return eventItem.weekday.replace(/^星期/, "");
  const date = parseDate(eventItem.date);
  if (!date) return "-";
  return ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
}

function formatDateSlash(dateValue: string) {
  if (!dateValue) return "未設定日期";
  return dateValue.replaceAll("-", "/");
}

function parseDate(dateValue: string) {
  if (!dateValue) return null;
  const date = new Date(dateValue + "T00:00:00");
  return Number.isNaN(date.getTime()) ? null : date;
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
  const meetingNo = eventItem.meetingNo ? "第" + eventItem.meetingNo + "次" : "一般活動";
  return meetingNo + "｜" + formatDateSlash(eventItem.date) + "｜" + (eventItem.title || "未命名活動");
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? fallback + "：" + error.message : fallback;
}
