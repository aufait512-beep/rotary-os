export type MemberStatus = "active" | "inactive";

export type Member = {
  id: string;
  chineseName: string;
  englishName: string;
  rotaryName: string;
  title: string;
  rotaryTitle: string;
  birthdayMonth: string;
  phone: string;
  mobile: string;
  email: string;
  spouse: string;
  joinDate: string;
  birthday: string;
  anniversary: string;
  classification: string;
  organization: string;
  workAddress: string;
  homeAddress: string;
  fax: string;
  littleRotary: string;
  riNo: string;
  note: string;
  status: MemberStatus;
  createdAt: string;
};

export const MEMBERS_STORAGE_KEY = "rotary-os-members";
const LEGACY_MEMBERS_STORAGE_KEY = "members";

export const emptyMember: Omit<Member, "id" | "createdAt"> = {
  chineseName: "",
  englishName: "",
  rotaryName: "",
  title: "",
  rotaryTitle: "",
  birthdayMonth: "",
  phone: "",
  mobile: "",
  email: "",
  spouse: "",
  joinDate: "",
  birthday: "",
  anniversary: "",
  classification: "",
  organization: "",
  workAddress: "",
  homeAddress: "",
  fax: "",
  littleRotary: "",
  riNo: "",
  note: "",
  status: "active",
};

export function readMembersFromStorage(): Member[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawMembers =
      window.localStorage.getItem(MEMBERS_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_MEMBERS_STORAGE_KEY);
    if (!rawMembers) {
      return [];
    }

    const parsedMembers = JSON.parse(rawMembers);
    if (!Array.isArray(parsedMembers)) {
      return [];
    }

    return parsedMembers.map(normalizeMember);
  } catch {
    return [];
  }
}

export function writeMembersToStorage(members: Member[]) {
  window.localStorage.setItem(MEMBERS_STORAGE_KEY, JSON.stringify(members));
}

export function sortMembersByName(members: Member[]) {
  return [...members].sort((firstMember, secondMember) =>
    formatMemberName(firstMember).localeCompare(
      formatMemberName(secondMember),
      "zh-Hant"
    )
  );
}

export function formatMemberName(member: Pick<Member, "chineseName" | "rotaryName">) {
  return [member.chineseName, member.rotaryName].filter(Boolean).join(" ");
}

export function normalizeMember(memberInput: unknown): Member {
  const member = isRecord(memberInput) ? memberInput : {};
  const birthday = getText(member, "birthday", "生日");

  return {
    id: getText(member, "id") || createId(),
    chineseName: getText(
      member,
      "chineseName",
      "chinese_name",
      "中文姓名",
      "姓名",
      "name",
      "displayName"
    ),
    englishName: getText(member, "englishName", "english_name", "英文姓名"),
    rotaryName: getText(
      member,
      "rotaryName",
      "rotary_name",
      "Rotary Name",
      "社名",
      "nickname"
    ),
    title: getText(
      member,
      "title",
      "annualRole",
      "annual_role",
      "社內職務",
      "職稱"
    ),
    rotaryTitle: getText(member, "rotaryTitle", "rotary_title", "扶輪職稱"),
    birthdayMonth:
      getText(member, "birthdayMonth", "birthday_month", "生日月份") ||
      inferBirthdayMonth(birthday),
    phone: getText(member, "phone", "電話"),
    mobile: getText(member, "mobile", "手機", "行動電話"),
    email: getText(member, "email", "Email", "E-mail", "E-Mail"),
    spouse: getText(member, "spouse", "配偶", "夫人"),
    joinDate: getText(member, "joinDate", "join_date", "入社日期"),
    birthday,
    anniversary: getText(member, "anniversary", "結婚紀念日"),
    classification: getText(member, "classification", "職業分類"),
    organization: getText(member, "organization", "服務單位"),
    workAddress: getText(member, "workAddress", "work_address", "公司地址", "服務地址"),
    homeAddress: getText(member, "homeAddress", "home_address", "住家地址", "住址"),
    fax: getText(member, "fax", "傳真"),
    littleRotary: getText(member, "littleRotary", "little_rotary", "小扶輪"),
    riNo: getText(member, "riNo", "ri_no", "RI No.", "RI 編號"),
    note: getText(member, "note", "備註"),
    status: getText(member, "status") === "inactive" ? "inactive" : "active",
    createdAt: getText(member, "createdAt", "created_at") || new Date().toISOString(),
  };
}

function getText(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function inferBirthdayMonth(birthday: string | undefined) {
  if (!birthday) {
    return "";
  }

  const month = birthday.split("-")[1];
  return month ? String(Number(month)) : "";
}
