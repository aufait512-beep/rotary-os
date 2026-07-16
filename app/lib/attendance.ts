import { EventItem } from "@/lib/events";
import { Member } from "@/lib/members";

export type AttendanceResponseStatus =
  | "pending"
  | "attending"
  | "absent"
  | "no_response";

export type MeetingAttendance = {
  id: string;
  eventId: string;
  memberId: string;
  responseStatus: AttendanceResponseStatus;
  plannedAttendance: boolean;
  actualAttendance: boolean;
  plannedMeal: boolean;
  actualMeal: boolean;
  guestCount: number;
  vegetarianCount: number;
  noMeal: boolean;
  mealAmount: number;
  includeInDues: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export function emptyMeetingAttendance(
  eventId: string,
  memberId: string,
  defaultMealAmount = 0
): MeetingAttendance {
  const now = new Date().toISOString();

  return {
    id: "",
    eventId,
    memberId,
    responseStatus: "pending",
    plannedAttendance: false,
    actualAttendance: false,
    plannedMeal: false,
    actualMeal: false,
    guestCount: 0,
    vegetarianCount: 0,
    noMeal: false,
    mealAmount: defaultMealAmount,
    includeInDues: true,
    note: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function isMeetingEvent(eventItem: Pick<EventItem, "eventType" | "meetingNo" | "title">) {
  return (
    eventItem.eventType.includes("例會") ||
    eventItem.meetingNo.trim() !== "" ||
    eventItem.title.includes("例會")
  );
}

export function applyResponseStatus(
  record: MeetingAttendance,
  responseStatus: AttendanceResponseStatus
): MeetingAttendance {
  if (responseStatus === "attending") {
    return {
      ...record,
      responseStatus,
      plannedAttendance: true,
    };
  }

  if (responseStatus === "absent") {
    return {
      ...record,
      responseStatus,
      plannedAttendance: false,
    };
  }

  if (responseStatus === "no_response" || responseStatus === "pending") {
    return {
      ...record,
      responseStatus,
      plannedAttendance: false,
    };
  }

  return {
    ...record,
    responseStatus,
  };
}

export function formatAttendanceStatus(status: AttendanceResponseStatus) {
  const labels: Record<AttendanceResponseStatus, string> = {
    pending: "待確認",
    attending: "出席",
    absent: "不出席",
    no_response: "未回覆",
  };
  return labels[status];
}

export function buildAttendanceSummary(
  eventItem: EventItem,
  records: MeetingAttendance[],
  leaveMemberIds: ReadonlySet<string> = new Set()
) {
  const isLeaveOverride = (record: MeetingAttendance) =>
    leaveMemberIds.has(record.memberId) &&
    record.responseStatus === "attending" &&
    record.plannedAttendance;
  const regularRecords = records.filter(
    (record) => !leaveMemberIds.has(record.memberId)
  );
  const leaveOverrideRecords = records.filter(isLeaveOverride);
  const includedRecords = [...regularRecords, ...leaveOverrideRecords];
  const responded =
    regularRecords.filter((record) => record.responseStatus !== "pending").length +
    leaveOverrideRecords.length;
  const regularPlannedAttending = regularRecords.filter(
    (record) => record.plannedAttendance
  ).length;
  const leaveOverrideAttending = leaveOverrideRecords.length;
  const plannedAttending = regularPlannedAttending + leaveOverrideAttending;
  const guests = includedRecords.reduce(
    (total, record) => total + record.guestCount,
    0
  );
  const noResponse = regularRecords.filter(
    (record) => record.responseStatus === "no_response"
  ).length;
  const plannedReservationTotal = plannedAttending + guests;
  const actualAttending = includedRecords.filter(
    (record) => record.actualAttendance
  ).length;
  const actualMeals = includedRecords.filter((record) => record.actualMeal).length;
  const mealTotal = includedRecords.reduce(
    (total, record) => total + (record.actualMeal ? record.mealAmount : 0),
    0
  );

  return {
    totalMembers: records.length,
    responded,
    regularPlannedAttending,
    leaveOverrideAttending,
    plannedAttending,
    guests,
    plannedReservationTotal,
    noResponse,
    actualAttending,
    actualMeals,
    mealTotal,
    copyText: [
      `第${eventItem.meetingNo || "-"}次例會出席統計`,
      "",
      `預計出席社友：${plannedAttending}人`,
      `長假本次參加：${leaveOverrideAttending}人`,
      `眷屬／來賓：${guests}人`,
      `預計訂桌人數：${plannedReservationTotal}人`,
      `未回覆：${noResponse}人`,
    ].join("\n"),
  };
}

export function isActiveMember(member: Member) {
  return member.status !== "inactive";
}
