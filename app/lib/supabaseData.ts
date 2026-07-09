import { supabase } from "@/src/lib/supabase";
import { DuesRecord, PaymentMethod } from "@/lib/dues";
import { EventItem } from "@/lib/events";
import { Member, normalizeMember, sortMembersByName } from "@/lib/members";
import { ProgramItem } from "@/lib/programs";

type DbRecord = Record<string, unknown>;

export async function fetchMembers() {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .order("chinese_name", { ascending: true });
  if (error) throw error;
  return sortMembersByName((data ?? []).map(mapMemberFromRow));
}

export async function upsertMember(member: Member) {
  const { data, error } = await supabase
    .from("members")
    .upsert(mapMemberToRow(member), { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return mapMemberFromRow(data);
}

export async function insertMember(member: Member) {
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

export async function fetchEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapEventFromRow);
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
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapProgramFromRow);
}

export async function upsertProgram(program: ProgramItem) {
  const { data, error } = await supabase
    .from("programs")
    .upsert(mapProgramToRow(program), { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return mapProgramFromRow(data);
}

export async function deleteProgram(programId: string) {
  const { error } = await supabase.from("programs").delete().eq("id", programId);
  if (error) throw error;
}

export async function fetchDuesRecords() {
  const { data, error } = await supabase
    .from("dues_records")
    .select("*")
    .order("period_month", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapDuesRecordFromRow);
}

export async function upsertDuesRecord(record: DuesRecord) {
  const { data, error } = await supabase
    .from("dues_records")
    .upsert(mapDuesRecordToRow(record), { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return mapDuesRecordFromRow(data);
}

export async function deleteDuesRecord(recordId: string) {
  const { error } = await supabase
    .from("dues_records")
    .delete()
    .eq("id", recordId);
  if (error) throw error;
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

function mapMemberToRow(member: Member) {
  return {
    id: member.id,
    ...mapMemberFieldsToRow(member),
  };
}

function mapMemberFieldsToRow(member: Member) {
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
    note: member.note,
  };
}

function mapEventFromRow(row: DbRecord): EventItem {
  return {
    id: text(row.id),
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
    note: text(row.note),
  };
}

function mapEventToRow(eventItem: EventItem) {
  return {
    id: eventItem.id,
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
    note: eventItem.note,
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

function mapProgramToRow(program: ProgramItem) {
  return {
    id: program.id,
    event_id: program.eventId || null,
    title: program.meetingName,
    date: emptyToNull(program.date),
    dinner_time: emptyToNull(program.dinnerTime),
    meeting_time: emptyToNull(program.meetingTime),
    location: program.location,
    room: program.room,
    topic: program.topic,
    speaker: program.speaker,
    fellowship_chair: program.fellowshipChair,
    sergeant_at_arms: program.sergeantAtArms,
  };
}

function mapDuesRecordFromRow(row: DbRecord): DuesRecord {
  return {
    id: text(row.id),
    memberId: text(row.member_id),
    periodMonth: text(row.period_month),
    previousBalance: number(row.previous_balance),
    currentDue: number(row.current_due),
    paidAmount: number(row.paid_amount),
    discountAmount: number(row.discount_amount),
    paymentDate: text(row.payment_date),
    paymentMethod: normalizePaymentMethod(text(row.payment_method)),
    note: text(row.note),
    createdAt: text(row.created_at) || new Date().toISOString(),
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

function normalizePaymentMethod(value: string): PaymentMethod {
  if (value === "現金" || value === "轉帳" || value === "其他") {
    return value;
  }

  return "未付款";
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
