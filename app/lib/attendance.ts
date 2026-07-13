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
    plannedMeal: true,
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
      plannedMeal: true,
      noMeal: false,
    };
  }

  if (responseStatus === "absent") {
    return {
      ...record,
      responseStatus,
      plannedAttendance: false,
      plannedMeal: false,
      noMeal: true,
      mealAmount: 0,
    };
  }

  if (responseStatus === "no_response" || responseStatus === "pending") {
    return {
      ...record,
      responseStatus,
      plannedAttendance: false,
      plannedMeal: false,
      noMeal: false,
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
    absent: "請假",
    no_response: "未回覆",
  };
  return labels[status];
}

export function buildAttendanceSummary(
  eventItem: EventItem,
  records: MeetingAttendance[]
) {
  const responded = records.filter((record) => record.responseStatus !== "pending").length;
  const plannedAttending = records.filter((record) => record.plannedAttendance).length;
  const plannedMealMembers = records.filter(
    (record) => record.plannedAttendance && record.plannedMeal && !record.noMeal
  ).length;
  const guests = records.reduce((total, record) => total + record.guestCount, 0);
  const vegetarian = records.reduce(
    (total, record) => total + record.vegetarianCount,
    0
  );
  const noMeal = records.filter((record) => record.noMeal).length;
  const noResponse = records.filter(
    (record) => record.responseStatus === "no_response"
  ).length;

  return {
    totalMembers: records.length,
    responded,
    plannedAttending,
    plannedMealMembers,
    guests,
    plannedTotalMeals: plannedMealMembers + guests,
    vegetarian,
    noMeal,
    noResponse,
    copyText: [
      `第${eventItem.meetingNo || "-"}次例會出席統計`,
      `預計出席社友：${plannedAttending}人`,
      `眷屬／來賓：${guests}人`,
      `預計用餐：${plannedMealMembers + guests}人`,
      `素食：${vegetarian}人`,
      `不用餐：${noMeal}人`,
      `未回覆：${noResponse}人`,
    ].join("\n"),
  };
}

export function isActiveMember(member: Member) {
  return member.status !== "inactive";
}
