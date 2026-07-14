import { supabase } from "@/src/lib/supabase";
import { MeetingAttendance } from "@/lib/attendance";
import { DuesLineItem, DuesRecord, PaymentMethod } from "@/lib/dues";
import { EventItem, RotaryYear } from "@/lib/events";
import { MemberLeavePeriod } from "@/lib/memberLeave";
import { Member, normalizeMember, sortMembersByName } from "@/lib/members";
import { ProgramItem } from "@/lib/programs";

type DbRecord = Record<string, unknown>;
type MemberWrite = Omit<Member, "note"> & { note?: string };

export async function fetchMembers() {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .order("chinese_name", { ascending: true });
  if (error) throw error;
  return sortMembersByName((data ?? []).map(mapMemberFromRow));
}

export async function upsertMember(member: MemberWrite) {
  const { data, error } = await supabase
    .from("members")
    .upsert(mapMemberToRow(member), { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return mapMemberFromRow(data);
}

export async function insertMember(member: MemberWrite) {
  const { data, error } = await supabase
    .from("members")
    .insert(mapMemberFieldsToRow(member))
    .select()
    .single();
  if (error) throw error;
  return mapMemberFromRow(data);
}

export async function deleteMember(memberId: string) {
  const { error } = await supabase.from("members").delete().eq("id", memberId);
  if (error) throw error;
}

export async function fetchMemberLeavePeriods(memberId?: string) {
  let query = supabase
    .from("member_leave_periods")
    .select("*")
    .order("start_date", { ascending: false });
  if (memberId) {
    query = query.eq("member_id", memberId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapMemberLeavePeriodFromRow);
}

export async function upsertMemberLeavePeriod(period: MemberLeavePeriod) {
  const { data, error } = await supabase
    .from("member_leave_periods")
    .upsert(mapMemberLeavePeriodToRow(period), { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return mapMemberLeavePeriodFromRow(data);
}

export async function fetchEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapEventFromRow);
}

export async function fetchRotaryYears() {
  const { data, error } = await supabase
    .from("rotary_years")
    .select("*")
    .order("start_date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapRotaryYearFromRow);
}

export async function upsertRotaryYear(year: RotaryYear) {
  if (year.isActive) {
    const { error: updateError } = await supabase
      .from("rotary_years")
      .update({ is_active: false })
      .neq("id", year.id);
    if (updateError) throw updateError;
  }

  const { data, error } = await supabase
    .from("rotary_years")
    .upsert(mapRotaryYearToRow(year), { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return mapRotaryYearFromRow(data);
}

export async function deleteRotaryYear(yearId: string) {
  const { error } = await supabase.from("rotary_years").delete().eq("id", yearId);
  if (error) throw error;
}

export async function upsertEvent(eventItem: EventItem) {
  const { data, error } = await supabase
    .from("events")
    .upsert(mapEventToRow(eventItem), { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return mapEventFromRow(data);
}

export async function deleteEvent(eventId: string) {
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) throw error;
}

export async function fetchPrograms() {
  const { data, error } = await supabase
    .from("programs")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapProgramFromRow);
}

export async function insertProgram(program: ProgramItem) {
  const payload = mapProgramToRow(program);
  const { data, error } = await supabase
    .from("programs")
    .insert(payload)
    .select()
    .single();
  if (error) {
    console.error({
      module: "programs",
      operation: "insert program",
      table: "programs",
      payload,
      error,
    });
    throw error;
  }
  return mapProgramFromRow(data);
}

export async function updateProgram(program: ProgramItem) {
  const payload = mapProgramToRow(program, false);
  const { data, error } = await supabase
    .from("programs")
    .update(payload)
    .eq("id", program.id)
    .select()
    .single();
  if (error) {
    console.error({
      module: "programs",
      operation: "update program",
      table: "programs",
      payload,
      error,
    });
    throw error;
  }
  return mapProgramFromRow(data);
}

export async function deleteProgram(programId: string) {
  const { error } = await supabase.from("programs").delete().eq("id", programId);
  if (error) throw error;
}

export async function fetchDuesRecords() {
  const [{ data, error }, lineItemResult] = await Promise.all([
    supabase
    .from("dues_records")
    .select("*")
      .order("period_month", { ascending: false }),
    supabase.from("dues_line_items").select("*").order("created_at", { ascending: true }),
  ]);
  if (error) throw error;
  if (lineItemResult.error) throw lineItemResult.error;

  const lineItems = (lineItemResult.data ?? []).map(mapDuesLineItemFromRow);
  return (data ?? []).map((row) =>
    mapDuesRecordFromRow(
      row,
      lineItems.filter((item) => item.duesRecordId === text(row.id))
    )
  );
}

export async function upsertDuesRecord(record: DuesRecord, lineItems = record.lineItems) {
  const normalizedRecord = {
    ...record,
    currentDue: sumLineItems(lineItems) || record.currentDue,
  };
  const { data, error } = await supabase
    .from("dues_records")
    .upsert(mapDuesRecordToRow(normalizedRecord), { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;

  const recordId = text(data.id);
  const nextLineItems = lineItems.map((item) => ({ ...item, duesRecordId: recordId }));
  const { error: deleteError } = await supabase
    .from("dues_line_items")
    .delete()
    .eq("dues_record_id", recordId);
  if (deleteError) throw deleteError;

  if (nextLineItems.length > 0) {
    const { error: insertError } = await supabase
      .from("dues_line_items")
      .insert(nextLineItems.map(mapDuesLineItemToRow));
    if (insertError) throw insertError;
  }

  return mapDuesRecordFromRow(data, nextLineItems);
}

export async function deleteDuesRecord(recordId: string) {
  const lineItemDelete = await supabase
    .from("dues_line_items")
    .delete()
    .eq("dues_record_id", recordId);
  if (lineItemDelete.error) throw lineItemDelete.error;

  const { error } = await supabase
    .from("dues_records")
    .delete()
    .eq("id", recordId);
  if (error) throw error;
}

export async function fetchMeetingAttendance(eventId?: string) {
  let query = supabase.from("meeting_attendance").select("*");
  if (eventId) {
    query = query.eq("event_id", eventId);
  }

  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapMeetingAttendanceFromRow);
}

export async function upsertMeetingAttendance(record: MeetingAttendance) {
  const { data, error } = await supabase
    .from("meeting_attendance")
    .upsert(mapMeetingAttendanceToRow(record), {
      onConflict: "event_id,member_id",
    })
    .select()
    .single();
  if (error) throw error;
  return mapMeetingAttendanceFromRow(data);
}

export async function insertDuesLineItems(lineItems: DuesLineItem[]) {
  if (lineItems.length === 0) return [];

  const { data, error } = await supabase
    .from("dues_line_items")
    .insert(lineItems.map(mapDuesLineItemToRow))
    .select();
  if (error) throw error;
  return (data ?? []).map(mapDuesLineItemFromRow);
}

function mapRotaryYearFromRow(row: DbRecord): RotaryYear {
  return {
    id: text(row.id),
    name: text(row.name),
    displayName: text(row.display_name),
    startDate: text(row.start_date),
    endDate: text(row.end_date),
    isActive: Boolean(row.is_active),
    createdAt: text(row.created_at),
  };
}

function mapRotaryYearToRow(year: RotaryYear) {
  return {
    id: year.id,
    name: year.name,
    display_name: year.displayName,
    start_date: emptyToNull(year.startDate),
    end_date: emptyToNull(year.endDate),
    is_active: year.isActive,
  };
}

function mapMemberFromRow(row: DbRecord): Member {
  return normalizeMember({
    id: text(row.id),
    chineseName: text(row.chinese_name),
    englishName: text(row.english_name),
    rotaryName: text(row.rotary_name),
    title: text(row.annual_role),
    rotaryTitle: text(row.rotary_title),
    birthdayMonth: text(row.birthday_month),
    phone: text(row.phone),
    mobile: text(row.mobile),
    email: text(row.email),
    spouse: text(row.spouse),
    joinDate: text(row.join_date),
    birthday: text(row.birthday),
    anniversary: text(row.anniversary),
    classification: text(row.classification),
    organization: text(row.organization),
    workAddress: text(row.work_address),
    homeAddress: text(row.home_address),
    fax: text(row.fax),
    littleRotary: text(row.little_rotary),
    riNo: text(row.ri_no),
    note: text(row.note),
    status: text(row.status),
    createdAt: text(row.created_at),
  });
}

function mapMemberToRow(member: MemberWrite) {
  return {
    id: member.id,
    ...mapMemberFieldsToRow(member),
  };
}

function mapMemberFieldsToRow(member: MemberWrite) {
  return {
    chinese_name: member.chineseName,
    rotary_name: member.rotaryName,
    english_name: member.englishName,
    rotary_title: member.rotaryTitle,
    annual_role: member.title,
    spouse: member.spouse,
    join_date: emptyToNull(member.joinDate),
    birthday: emptyToNull(member.birthday),
    birthday_month: member.birthdayMonth,
    anniversary: emptyToNull(member.anniversary),
    classification: member.classification,
    organization: member.organization,
    work_address: member.workAddress,
    home_address: member.homeAddress,
    phone: member.phone,
    mobile: member.mobile,
    fax: member.fax,
    email: member.email,
    little_rotary: member.littleRotary,
    ri_no: member.riNo,
    status: member.status,
  };
}

function mapMemberLeavePeriodFromRow(row: DbRecord): MemberLeavePeriod {
  return {
    id: text(row.id),
    memberId: text(row.member_id),
    startDate: text(row.start_date),
    endDate: text(row.end_date),
    reason: text(row.reason),
    annualFeeAmount:
      row.annual_fee_amount === null || row.annual_fee_amount === undefined
        ? 1000
        : number(row.annual_fee_amount),
    isActive: Boolean(row.is_active),
    note: text(row.note),
    createdAt: text(row.created_at) || new Date().toISOString(),
    updatedAt: text(row.updated_at) || new Date().toISOString(),
  };
}

function mapMemberLeavePeriodToRow(period: MemberLeavePeriod) {
  return {
    ...(period.id ? { id: period.id } : {}),
    member_id: period.memberId,
    start_date: emptyToNull(period.startDate),
    end_date: emptyToNull(period.endDate),
    reason: period.reason,
    annual_fee_amount: period.annualFeeAmount,
    is_active: period.isActive,
    note: period.note,
  };
}

function mapEventFromRow(row: DbRecord): EventItem {
  return {
    id: text(row.id),
    rotaryYearId: text(row.rotary_year_id),
    title: text(row.title),
    eventType: text(row.event_type),
    meetingNo: text(row.meeting_no),
    date: text(row.date),
    weekday: text(row.weekday),
    dinnerTime: text(row.dinner_time),
    meetingTime: text(row.meeting_time),
    endTime: text(row.end_time),
    location: text(row.location),
    room: text(row.room),
    topic: text(row.topic),
    speaker: text(row.speaker),
    fellowshipChair: text(row.fellowship_chair),
    sergeantAtArms: text(row.sergeant_at_arms),
    description: text(row.description),
    note: text(row.note),
    eventMealAmount: number(row.event_meal_amount),
  };
}

function mapEventToRow(eventItem: EventItem) {
  return {
    id: eventItem.id,
    rotary_year_id: eventItem.rotaryYearId || null,
    title: eventItem.title,
    event_type: eventItem.eventType,
    meeting_no: eventItem.meetingNo,
    date: emptyToNull(eventItem.date),
    weekday: eventItem.weekday,
    dinner_time: emptyToNull(eventItem.dinnerTime),
    meeting_time: emptyToNull(eventItem.meetingTime),
    end_time: emptyToNull(eventItem.endTime),
    location: eventItem.location,
    room: eventItem.room,
    topic: eventItem.topic,
    speaker: eventItem.speaker,
    fellowship_chair: eventItem.fellowshipChair,
    sergeant_at_arms: eventItem.sergeantAtArms,
    description: eventItem.description,
    note: eventItem.note,
    event_meal_amount: eventItem.eventMealAmount,
  };
}

function mapProgramFromRow(row: DbRecord): ProgramItem {
  return {
    id: text(row.id),
    eventId: text(row.event_id),
    meetingName: text(row.title),
    date: text(row.date),
    dinnerTime: text(row.dinner_time),
    meetingTime: text(row.meeting_time),
    location: text(row.location),
    room: text(row.room),
    topic: text(row.topic),
    speaker: text(row.speaker),
    fellowshipChair: text(row.fellowship_chair),
    sergeantAtArms: text(row.sergeant_at_arms),
  };
}

function mapProgramToRow(program: ProgramItem, includeId = true) {
  return {
    ...(includeId ? { id: program.id } : {}),
    event_id: program.eventId,
    title: program.meetingName,
    fellowship_chair: program.fellowshipChair,
    sergeant_at_arms: program.sergeantAtArms,
  };
}

function mapDuesRecordFromRow(row: DbRecord, lineItems: DuesLineItem[] = []): DuesRecord {
  const legacyCurrentDue = number(row.current_due);
  return {
    id: text(row.id),
    memberId: text(row.member_id),
    periodMonth: text(row.period_month),
    previousBalance: number(row.previous_balance),
    currentDue: lineItems.length > 0 ? sumLineItems(lineItems) : legacyCurrentDue,
    paidAmount: number(row.paid_amount),
    discountAmount: number(row.discount_amount),
    paymentDate: text(row.payment_date),
    paymentMethod: normalizePaymentMethod(text(row.payment_method)),
    note: text(row.note),
    createdAt: text(row.created_at) || new Date().toISOString(),
    lineItems:
      lineItems.length > 0
        ? lineItems
        : legacyCurrentDue > 0
          ? [
              {
                id: `legacy-${text(row.id)}`,
                duesRecordId: text(row.id),
                itemType: "legacy",
                itemName: "舊資料總額",
                serviceDate: "",
                quantity: 1,
                unitAmount: legacyCurrentDue,
                amount: legacyCurrentDue,
                note: "舊資料總額",
                createdAt: text(row.created_at) || new Date().toISOString(),
              },
            ]
          : [],
  };
}

function mapDuesRecordToRow(record: DuesRecord) {
  return {
    id: record.id,
    member_id: record.memberId,
    period_month: record.periodMonth,
    previous_balance: record.previousBalance,
    current_due: record.currentDue,
    paid_amount: record.paidAmount,
    discount_amount: record.discountAmount,
    payment_date: emptyToNull(record.paymentDate),
    payment_method: record.paymentMethod,
    note: record.note,
  };
}

function mapDuesLineItemFromRow(row: DbRecord): DuesLineItem {
  return {
    id: text(row.id),
    duesRecordId: text(row.dues_record_id),
    itemType: normalizeLineItemType(text(row.item_type)),
    itemName: text(row.item_name),
    serviceDate: text(row.service_date),
    quantity: number(row.quantity) || 1,
    unitAmount: number(row.unit_amount),
    amount: number(row.amount),
    note: text(row.note),
    createdAt: text(row.created_at) || new Date().toISOString(),
  };
}

function mapDuesLineItemToRow(item: DuesLineItem) {
  return {
    id: item.id.startsWith("legacy-") ? crypto.randomUUID() : item.id,
    dues_record_id: item.duesRecordId,
    item_type: item.itemType === "legacy" ? "pass_through" : item.itemType,
    item_name: item.itemName,
    service_date: emptyToNull(item.serviceDate),
    quantity: item.quantity,
    unit_amount: item.unitAmount,
    amount: item.amount,
    note: item.note,
  };
}

function mapMeetingAttendanceFromRow(row: DbRecord): MeetingAttendance {
  return {
    id: text(row.id),
    eventId: text(row.event_id),
    memberId: text(row.member_id),
    responseStatus: normalizeAttendanceStatus(text(row.response_status)),
    plannedAttendance: Boolean(row.planned_attendance),
    actualAttendance: Boolean(row.actual_attendance),
    plannedMeal: Boolean(row.planned_meal),
    actualMeal: Boolean(row.actual_meal),
    guestCount: number(row.guest_count),
    vegetarianCount: number(row.vegetarian_count),
    noMeal: Boolean(row.no_meal),
    mealAmount: number(row.meal_amount),
    includeInDues: row.include_in_dues !== false,
    note: text(row.note),
    createdAt: text(row.created_at) || new Date().toISOString(),
    updatedAt: text(row.updated_at) || new Date().toISOString(),
  };
}

function mapMeetingAttendanceToRow(record: MeetingAttendance) {
  return {
    ...(record.id ? { id: record.id } : {}),
    event_id: record.eventId,
    member_id: record.memberId,
    response_status: record.responseStatus,
    planned_attendance: record.plannedAttendance,
    actual_attendance: record.actualAttendance,
    planned_meal: record.plannedMeal,
    actual_meal: record.actualMeal,
    guest_count: record.guestCount,
    vegetarian_count: record.vegetarianCount,
    no_meal: record.noMeal,
    meal_amount: record.mealAmount,
    include_in_dues: record.includeInDues,
    note: record.note,
  };
}

function normalizePaymentMethod(value: string): PaymentMethod {
  if (value === "現金" || value === "轉帳" || value === "信用卡扣") {
    return value;
  }

  return "轉帳";
}

function normalizeLineItemType(value: string): DuesLineItem["itemType"] {
  if (
    value === "meal" ||
    value === "annual_fee" ||
    value === "special_donation" ||
    value === "red_box" ||
    value === "rotary_foundation" ||
    value === "pass_through"
  ) {
    return value;
  }

  return "pass_through";
}

function normalizeAttendanceStatus(value: string): MeetingAttendance["responseStatus"] {
  if (
    value === "pending" ||
    value === "attending" ||
    value === "absent" ||
    value === "no_response"
  ) {
    return value;
  }

  return "pending";
}

function sumLineItems(lineItems: DuesLineItem[]) {
  return lineItems.reduce((total, item) => total + item.amount, 0);
}

function text(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function number(value: unknown) {
  return Number(value) || 0;
}

function emptyToNull(value: string) {
  return value || null;
}
