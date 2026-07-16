"use client";

import { useMemo, useRef, useState } from "react";
import { MeetingAttendance } from "@/lib/attendance";
import { EventItem } from "@/lib/events";
import { Member } from "@/lib/members";

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

export type MeetingRosterRow = {
  member: Member;
  record: MeetingAttendance;
  isOnLeave: boolean;
  isLeaveOverride: boolean;
};

type RosterFilter =
  | "all"
  | "planned"
  | "actual_attendance"
  | "actual_meal"
  | "leave_override"
  | "pending";

type AttendanceSummary = {
  regularPlannedAttending: number;
  leaveOverrideAttending: number;
  plannedAttending: number;
  guests: number;
  plannedReservationTotal: number;
  actualAttending: number;
  actualMeals: number;
  mealTotal: number;
};

export default function MeetingAttendanceRoster({
  eventItem,
  rows,
  summary,
  eventMealAmount,
  onError,
  onSuccess,
}: {
  eventItem: EventItem;
  rows: MeetingRosterRow[];
  summary: AttendanceSummary;
  eventMealAmount: number;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [includeAbsent, setIncludeAbsent] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const previewRows = useMemo(
    () => rows.filter((row) => matchesFilter(row, filter)),
    [filter, rows]
  );
  const exportRows = useMemo(
    () => rows.filter((row) => includeAbsent || shouldExportByDefault(row)),
    [includeAbsent, rows]
  );

  async function exportJpg() {
    const element = exportRef.current;
    if (!element) {
      onError("本日名單尚未準備完成，請稍後再試。");
      return;
    }

    try {
      setIsExporting(true);
      onError("");
      const html2canvasModule = await import("html2canvas");
      const canvas = await html2canvasModule.default(element, {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: element.scrollWidth,
        height: element.scrollHeight,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      });
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.95)
      );
      if (!blob) throw new Error("無法建立 JPG 圖檔");

      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = buildRosterFilename(eventItem, "jpg");
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      onSuccess("本日例會出席用餐名單 JPG 已匯出。");
    } catch (error) {
      onError(getErrorMessage(error, "本日名單 JPG 匯出失敗"));
    } finally {
      setIsExporting(false);
    }
  }

  function printRoster() {
    const element = exportRef.current;
    if (!element) {
      onError("本日名單尚未準備完成，請稍後再試。");
      return;
    }

    const printWindow = window.open("", "_blank", "width=900,height=1100");
    if (!printWindow) {
      onError("瀏覽器已阻擋列印視窗，請允許彈出式視窗後再試。");
      return;
    }

    const sharedStyles = Array.from(
      document.head.querySelectorAll('link[rel="stylesheet"], style')
    )
      .map((node) => node.outerHTML)
      .join("");
    printWindow.document.write(`<!doctype html>
      <html lang="zh-Hant">
        <head>
          <meta charset="utf-8" />
          <base href="${document.baseURI}" />
          <title>${escapeHtml(buildRosterFilename(eventItem, ""))}</title>
          ${sharedStyles}
          <style>
            @page { size: A4 portrait; margin: 8mm; }
            html, body { margin: 0; padding: 0; background: #fff; }
            .meeting-roster-sheet { width: 194mm !important; min-height: 0 !important; box-shadow: none !important; }
            .meeting-roster-sheet table { font-size: 8pt !important; }
            .meeting-roster-sheet tr { break-inside: avoid; page-break-inside: avoid; }
          </style>
        </head>
        <body>${element.outerHTML}</body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 700);
  }

  return (
    <div className="min-w-0 rounded-3xl border border-[#E5D9BD] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className={`rounded-2xl bg-[#F7C948] px-4 py-3 font-bold ${buttonShadow}`}
        >
          {isOpen ? "收合本日名單" : "預覽本日名單"}
        </button>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void exportJpg()}
            disabled={isExporting}
            className={`rounded-2xl bg-[#173B73] px-4 py-3 font-bold text-white disabled:opacity-60 ${buttonShadow}`}
          >
            {isExporting ? "匯出中" : "匯出本日名單 JPG"}
          </button>
          <button
            type="button"
            onClick={printRoster}
            className={`rounded-2xl bg-white px-4 py-3 font-bold ${buttonShadow}`}
          >
            列印本日名單
          </button>
        </div>
      </div>

      <label className="mt-3 flex min-w-0 items-center gap-3 rounded-2xl bg-[#F8F3E8] px-3 py-3 font-bold">
        <input
          type="checkbox"
          checked={includeAbsent}
          onChange={(event) => setIncludeAbsent(event.target.checked)}
          className="h-5 w-5 shrink-0"
        />
        <span className="break-words">包含不出席社友（影響 JPG 與列印）</span>
      </label>

      {isOpen ? (
        <div className="mt-4 min-w-0 space-y-3">
          <label className="block">
            <span className="text-sm font-bold">名單篩選</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as RosterFilter)}
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base"
            >
              <option value="all">全部社友</option>
              <option value="planned">預計出席</option>
              <option value="actual_attendance">實際出席</option>
              <option value="actual_meal">實際用餐</option>
              <option value="leave_override">長假本次參加</option>
              <option value="pending">尚待確認</option>
            </select>
          </label>
          <p className="text-sm font-semibold text-[#173B73]/70">
            預覽共 {previewRows.length} 位；正式匯出共 {exportRows.length} 位。
          </p>
          <div className="max-w-full overflow-x-auto rounded-2xl border border-[#E5D9BD] bg-[#EFE9DC] p-2">
            <RosterDocument
              eventItem={eventItem}
              rows={previewRows}
              summary={summary}
              eventMealAmount={eventMealAmount}
            />
          </div>
        </div>
      ) : null}

      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-[-10000px] top-0"
      >
        <RosterDocument
          ref={exportRef}
          eventItem={eventItem}
          rows={exportRows}
          summary={summary}
          eventMealAmount={eventMealAmount}
        />
      </div>
    </div>
  );
}

function RosterDocument({
  ref,
  eventItem,
  rows,
  summary,
  eventMealAmount,
}: {
  ref?: React.Ref<HTMLDivElement>;
  eventItem: EventItem;
  rows: MeetingRosterRow[];
  summary: AttendanceSummary;
  eventMealAmount: number;
}) {
  const location = [eventItem.location, eventItem.room].filter(Boolean).join(" ");

  return (
    <div
      ref={ref}
      className="meeting-roster-sheet box-border min-h-[277mm] w-[190mm] bg-white p-[8mm] font-sans text-[10px] leading-normal text-black"
    >
      <header className="border-b-2 border-black pb-3 text-center">
        <p className="text-[18px] font-bold">高雄晨光扶輪社</p>
        <h3 className="mt-1 text-[16px] font-bold">
          第{eventItem.meetingNo || "-"}次例會 出席用餐名單
        </h3>
      </header>

      <section className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
        <Info label="活動名稱" value={eventItem.title} />
        <Info label="活動類型" value={eventItem.eventType} />
        <Info label="主題" value={eventItem.topic} />
        <Info label="日期" value={eventItem.date} />
        <Info label="餐敘時間" value={eventItem.dinnerTime} />
        <Info label="開會時間" value={eventItem.meetingTime} />
        <div className="col-span-2">
          <Info label="地點" value={location} />
        </div>
      </section>

      <section className="mt-3 grid grid-cols-4 border border-black text-center text-[10px]">
        <RosterSummary label="預計出席社友" value={`${summary.regularPlannedAttending}人`} />
        <RosterSummary label="長假本次參加" value={`${summary.leaveOverrideAttending}人`} />
        <RosterSummary label="眷屬／來賓" value={`${summary.guests}人`} />
        <RosterSummary label="預計訂桌總人數" value={`${summary.plannedReservationTotal}人`} />
        <RosterSummary label="實際出席" value={`${summary.actualAttending}人`} />
        <RosterSummary label="實際用餐" value={`${summary.actualMeals}人`} />
        <RosterSummary
          label="餐費單價"
          value={eventMealAmount > 0 ? formatCurrency(eventMealAmount) : "未設定"}
        />
        <RosterSummary label="餐費總額" value={formatCurrency(summary.mealTotal)} />
      </section>

      <table className="mt-3 w-full table-fixed border-collapse text-center text-[9px]">
        <thead>
          <tr className="bg-[#F2F2F2]">
            <Th className="w-[5%]">編號</Th>
            <Th className="w-[11%]">社友姓名</Th>
            <Th className="w-[10%]">社名</Th>
            <Th className="w-[14%]">身分標記</Th>
            <Th className="w-[8%]">預計出席</Th>
            <Th className="w-[8%]">實際出席</Th>
            <Th className="w-[8%]">實際用餐</Th>
            <Th className="w-[10%]">餐費</Th>
            <Th className="w-[9%]">眷屬／來賓</Th>
            <Th className="w-[17%]">備註</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row, index) => (
              <tr key={row.member.id} className="break-inside-avoid">
                <Td>{index + 1}</Td>
                <Td>{row.member.chineseName || "—"}</Td>
                <Td>{row.member.rotaryName || "—"}</Td>
                <Td>{getIdentityLabel(row)}</Td>
                <Td>{row.record.plannedAttendance ? "是" : "—"}</Td>
                <Td>{row.record.actualAttendance ? "是" : "—"}</Td>
                <Td>{row.record.actualMeal ? "是" : "—"}</Td>
                <Td>
                  {row.record.actualMeal ? formatCurrency(row.record.mealAmount) : "—"}
                </Td>
                <Td>{row.record.guestCount || "—"}</Td>
                <Td className="break-words text-left">{row.record.note || ""}</Td>
              </tr>
            ))
          ) : (
            <tr>
              <Td colSpan={10}>此篩選條件下沒有名單資料</Td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="mt-3 text-right text-[9px] text-[#555555]">
        產出時間：{new Date().toLocaleString("zh-TW", { hour12: false })}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <p className="break-words">
      <span className="font-bold">{label}：</span>
      {value || "—"}
    </p>
  );
}

function RosterSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-black p-2">
      <p className="font-bold">{label}</p>
      <p className="mt-1 text-[12px] font-bold">{value}</p>
    </div>
  );
}

function Th({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  return <th className={`border border-black px-1 py-2 font-bold ${className}`}>{children}</th>;
}

function Td({
  children,
  className = "",
  colSpan,
}: React.PropsWithChildren<{ className?: string; colSpan?: number }>) {
  return (
    <td colSpan={colSpan} className={`border border-black px-1 py-2 align-middle ${className}`}>
      {children}
    </td>
  );
}

function matchesFilter(row: MeetingRosterRow, filter: RosterFilter) {
  if (filter === "all") return true;
  if (filter === "planned") return row.record.plannedAttendance;
  if (filter === "actual_attendance") return row.record.actualAttendance;
  if (filter === "actual_meal") return row.record.actualMeal;
  if (filter === "leave_override") return row.isLeaveOverride;
  return (
    !row.isOnLeave &&
    (row.record.responseStatus === "pending" || row.record.responseStatus === "no_response")
  );
}

function shouldExportByDefault(row: MeetingRosterRow) {
  return (
    row.record.plannedAttendance ||
    row.record.actualAttendance ||
    row.record.actualMeal ||
    row.isLeaveOverride ||
    row.record.guestCount > 0
  );
}

function getIdentityLabel(row: MeetingRosterRow) {
  if (row.isLeaveOverride) return "長假／本次參加";
  const roles = [row.member.title, row.member.rotaryTitle].filter(Boolean);
  const seniorRole = roles.find((role) => role.includes("資深"));
  return seniorRole || roles[0] || "一般";
}

function buildRosterFilename(eventItem: EventItem, extension: string) {
  const meetingNo = eventItem.meetingNo || "未編號";
  const baseName = `高雄晨光扶輪社_第${meetingNo}次例會_出席用餐名單_${eventItem.date || "未定日期"}`;
  return extension ? `${baseName}.${extension}` : baseName;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? `${fallback}：${error.message}` : fallback;
}
