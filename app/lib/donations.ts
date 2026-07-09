export type DonationCategory = "全球計畫" | "地區計畫" | "社內計畫";
export type DonationPlanStatus = "open" | "closed";
export type DonorType = "晨光社友" | "友社" | "其他";
export type PaymentStatus = "pending" | "received";

export type DonationPlan = {
  id: string;
  category: DonationCategory;
  title: string;
  description: string;
  suggestedAmountText: string;
  startDate: string;
  endDate: string;
  status: DonationPlanStatus;
  sortOrder: number;
};

export type DonationRecord = {
  id: string;
  planId: string;
  donorName: string;
  clubName: string;
  donorType: DonorType;
  amount: number;
  transferLastFive: string;
  note: string;
  paymentStatus: PaymentStatus;
  createdAt: string;
};

export const DONATION_PLANS_STORAGE_KEY = "donationPlans";
export const DONATION_RECORDS_STORAGE_KEY = "rotary-os-donation-records";
const LEGACY_ROTARY_DONATION_PLANS_STORAGE_KEY = "rotary-os-donation-projects";
const LEGACY_DONATION_PLANS_STORAGE_KEY = "donationProjects";
const LEGACY_DONATION_RECORDS_STORAGE_KEY = "donationRecords";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://vmwjmtrugqlhyecovysl.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_cZAZwCZXU9eXTGCdP6SJIA_ipsTnfL_";
const DONATION_PLANS_TABLE = "donation_plans";
const DONATION_RECORDS_TABLE = "donation_records";

export const donationCategories: DonationCategory[] = [
  "全球計畫",
  "地區計畫",
  "社內計畫",
];

export const defaultDonationPlans: DonationPlan[] = [
  {
    id: "paul-harris-fellow-2026",
    category: "全球計畫",
    title: "保羅哈里斯捐獻",
    description: "支持扶輪基金會年度計畫與全球服務。",
    suggestedAmountText: "捐獻美金 1,000 元，可獲頒 Paul Harris Fellow",
    startDate: "",
    endDate: "",
    status: "open",
    sortOrder: 1,
  },
  {
    id: "polio-plus-2026",
    category: "全球計畫",
    title: "根除小兒麻痺",
    description: "支持國際扶輪根除小兒麻痺計畫。",
    suggestedAmountText: "歡迎自由捐獻，持續支持根除小兒麻痺行動",
    startDate: "",
    endDate: "",
    status: "open",
    sortOrder: 2,
  },
  {
    id: "rotary-education-foundation-2026",
    category: "地區計畫",
    title: "中華扶輪教育基金",
    description: "支持中華扶輪教育基金培育優秀人才。",
    suggestedAmountText: "歡迎依年度認捐方案自由填寫金額",
    startDate: "",
    endDate: "",
    status: "open",
    sortOrder: 1,
  },
  {
    id: "slow-flying-angels-2026",
    category: "地區計畫",
    title: "慢飛天使",
    description: "支持慢飛天使相關服務與照顧計畫。",
    suggestedAmountText: "歡迎自由捐獻",
    startDate: "",
    endDate: "",
    status: "open",
    sortOrder: 2,
  },
  {
    id: "longmu-camera-2026",
    category: "地區計畫",
    title: "龍目國小相機捐贈",
    description: "募集數位相機，協助龍目國小教學與活動紀錄。",
    suggestedAmountText: "每台相機新台幣 4,000 元",
    startDate: "",
    endDate: "",
    status: "open",
    sortOrder: 3,
  },
  {
    id: "club-service-fund-2026",
    category: "社內計畫",
    title: "社內服務基金",
    description: "支持高雄晨光扶輪社年度社內服務與公益行動。",
    suggestedAmountText: "歡迎自由捐獻",
    startDate: "",
    endDate: "",
    status: "open",
    sortOrder: 1,
  },
];

export const emptyDonationPlan: Omit<DonationPlan, "id"> = {
  category: "社內計畫",
  title: "",
  description: "",
  suggestedAmountText: "",
  startDate: "",
  endDate: "",
  status: "open",
  sortOrder: 1,
};

export const emptyDonationRecord: Omit<
  DonationRecord,
  "id" | "paymentStatus" | "createdAt"
> = {
  planId: "",
  donorName: "",
  clubName: "",
  donorType: "晨光社友",
  amount: 0,
  transferLastFive: "",
  note: "",
};

export function readDonationPlansFromStorage(): DonationPlan[] {
  if (typeof window === "undefined") {
    return defaultDonationPlans;
  }

  try {
    const rawPlans = window.localStorage.getItem(DONATION_PLANS_STORAGE_KEY);
    if (rawPlans) {
      const parsedPlans: unknown = JSON.parse(rawPlans);
      if (!Array.isArray(parsedPlans)) {
        return [];
      }

      return sortDonationPlans(parsedPlans.map(normalizeDonationPlan));
    }

    const legacyPlans =
      window.localStorage.getItem(LEGACY_ROTARY_DONATION_PLANS_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_DONATION_PLANS_STORAGE_KEY);
    if (legacyPlans) {
      const parsedLegacyPlans: unknown = JSON.parse(legacyPlans);
      if (!Array.isArray(parsedLegacyPlans)) {
        writeDonationPlansToStorage(defaultDonationPlans);
        return defaultDonationPlans;
      }

      const migratedPlans = addMissingDefaultPlans(
        parsedLegacyPlans.map(normalizeDonationPlan)
      );
      writeDonationPlansToStorage(migratedPlans);
      return migratedPlans;
    }

    writeDonationPlansToStorage(defaultDonationPlans);
    return defaultDonationPlans;
  } catch {
    return defaultDonationPlans;
  }
}

export function writeDonationPlansToStorage(plans: DonationPlan[]) {
  window.localStorage.setItem(DONATION_PLANS_STORAGE_KEY, JSON.stringify(plans));
}

export function readDonationRecordsFromStorage(): DonationRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawRecords =
      window.localStorage.getItem(DONATION_RECORDS_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_DONATION_RECORDS_STORAGE_KEY);
    if (!rawRecords) {
      return [];
    }

    const parsedRecords: unknown = JSON.parse(rawRecords);
    if (!Array.isArray(parsedRecords)) {
      return [];
    }

    const records = parsedRecords.map(normalizeDonationRecord);
    writeDonationRecordsToStorage(records);
    return records;
  } catch {
    return [];
  }
}

export function writeDonationRecordsToStorage(records: DonationRecord[]) {
  window.localStorage.setItem(
    DONATION_RECORDS_STORAGE_KEY,
    JSON.stringify(records)
  );
}

export async function readDonationPlans(): Promise<DonationPlan[]> {
  try {
    const rows = await supabaseRequest<unknown[]>(
      `${DONATION_PLANS_TABLE}?select=*&order=category.asc,sort_order.asc`
    );
    const plans = sortDonationPlans(rows.map(normalizeDonationPlan));

    if (plans.length > 0) {
      writeDonationPlansToStorage(plans);
      return plans;
    }

    const seededPlans = await seedDefaultDonationPlans();
    writeDonationPlansToStorage(seededPlans);
    return seededPlans;
  } catch {
    return readDonationPlansFromStorage();
  }
}

export async function saveDonationPlan(plan: DonationPlan): Promise<DonationPlan> {
  const [savedPlan] = await supabaseRequest<unknown[]>(
    `${DONATION_PLANS_TABLE}?on_conflict=id`,
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(toDonationPlanRow(plan)),
    }
  );

  return normalizeDonationPlan(savedPlan ?? plan);
}

export async function deleteDonationPlan(planId: string) {
  await supabaseRequest(
    `${DONATION_PLANS_TABLE}?id=eq.${encodeURIComponent(planId)}`,
    {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal",
      },
    }
  );
}

export async function readDonationRecords(): Promise<DonationRecord[]> {
  try {
    const rows = await supabaseRequest<unknown[]>(
      `${DONATION_RECORDS_TABLE}?select=*&order=created_at.desc`
    );
    const records = rows.map(normalizeDonationRecord);
    writeDonationRecordsToStorage(records);
    return records;
  } catch {
    return readDonationRecordsFromStorage();
  }
}

export async function saveDonationRecord(
  record: DonationRecord
): Promise<DonationRecord> {
  const [savedRecord] = await supabaseRequest<unknown[]>(
    `${DONATION_RECORDS_TABLE}?on_conflict=id`,
    {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(toDonationRecordRow(record)),
    }
  );

  return normalizeDonationRecord(savedRecord ?? record);
}

export async function deleteDonationRecord(recordId: string) {
  await supabaseRequest(
    `${DONATION_RECORDS_TABLE}?id=eq.${encodeURIComponent(recordId)}`,
    {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal",
      },
    }
  );
}

export function sortDonationPlans(plans: DonationPlan[]) {
  return [...plans].sort((firstPlan, secondPlan) => {
    const categoryDiff =
      donationCategories.indexOf(firstPlan.category) -
      donationCategories.indexOf(secondPlan.category);
    if (categoryDiff !== 0) {
      return categoryDiff;
    }

    return firstPlan.sortOrder - secondPlan.sortOrder;
  });
}

export function getPlanStats(plan: DonationPlan, records: DonationRecord[]) {
  const planRecords = records.filter((record) => record.planId === plan.id);
  const totalAmount = planRecords.reduce(
    (total, record) => total + record.amount,
    0
  );
  const pendingAmount = planRecords
    .filter((record) => record.paymentStatus === "pending")
    .reduce((total, record) => total + record.amount, 0);
  const receivedAmount = planRecords
    .filter((record) => record.paymentStatus === "received")
    .reduce((total, record) => total + record.amount, 0);

  return {
    records: planRecords,
    totalAmount,
    pendingAmount,
    receivedAmount,
  };
}

export function isPlanOpen(plan: DonationPlan) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    plan.status === "open" &&
    (!plan.startDate || plan.startDate <= today) &&
    (!plan.endDate || plan.endDate >= today)
  );
}

function normalizeDonationPlan(planInput: unknown): DonationPlan {
  const plan = isRecord(planInput) ? planInput : {};
  const legacySuggestedAmount = getNumber(plan, "suggestedAmount", "unitAmount");
  const suggestedAmountText =
    getText(plan, "suggestedAmountText", "建議捐獻說明") ||
    (legacySuggestedAmount > 0
      ? `建議捐獻金額新台幣 ${legacySuggestedAmount.toLocaleString("zh-TW")} 元`
      : "");
  const legacyStatus = getText(plan, "status");
  const legacyIsOpen = getBoolean(plan, "isOpen");

  return {
    id: getText(plan, "id") || createId(),
    category: normalizeCategory(getText(plan, "category", "分類")),
    title: getText(plan, "title", "計畫名稱"),
    description: stripParagraphTags(getText(plan, "description", "計畫內容")),
    suggestedAmountText:
      suggestedAmountText || getText(plan, "suggested_amount_text"),
    startDate: getText(plan, "startDate", "start_date", "開始日期"),
    endDate: getText(plan, "endDate", "end_date", "截止日期"),
    status:
      legacyStatus === "closed" || legacyIsOpen === false ? "closed" : "open",
    sortOrder: getNumber(plan, "sortOrder", "sort_order", "排序") || 1,
  };
}

function addMissingDefaultPlans(plans: DonationPlan[]) {
  const nextPlans = [...plans];

  defaultDonationPlans.forEach((defaultPlan) => {
    if (!nextPlans.some((plan) => plan.id === defaultPlan.id)) {
      nextPlans.push(defaultPlan);
    }
  });

  return sortDonationPlans(nextPlans);
}

function normalizeDonationRecord(recordInput: unknown): DonationRecord {
  const record = isRecord(recordInput) ? recordInput : {};
  const legacyProjectId = getText(record, "projectId");

  return {
    id: getText(record, "id") || createId(),
    planId: getText(record, "planId", "plan_id") || legacyProjectId,
    donorName: getText(record, "donorName", "donor_name", "姓名", "姓名 / 社名"),
    clubName: getText(record, "clubName", "club_name", "社別"),
    donorType: normalizeDonorType(
      getText(record, "donorType", "donor_type", "身分類型")
    ),
    amount: getNumber(record, "amount", "捐獻金額"),
    transferLastFive: getText(
      record,
      "transferLastFive",
      "transfer_last_five",
      "匯款後五碼"
    ),
    note: getText(record, "note", "備註"),
    paymentStatus:
      getText(record, "paymentStatus", "payment_status") === "received"
        ? "received"
        : "pending",
    createdAt:
      getText(record, "createdAt", "created_at") || new Date().toISOString(),
  };
}

async function seedDefaultDonationPlans() {
  const rows = await supabaseRequest<unknown[]>(DONATION_PLANS_TABLE, {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify(defaultDonationPlans.map(toDonationPlanRow)),
  });

  return sortDonationPlans(rows.map(normalizeDonationPlan));
}

async function supabaseRequest<Result>(
  path: string,
  init: RequestInit = {}
): Promise<Result> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as Result;
  }

  return response.json() as Promise<Result>;
}

function toDonationPlanRow(plan: DonationPlan) {
  return {
    id: plan.id,
    category: plan.category,
    title: plan.title,
    description: plan.description,
    suggested_amount_text: plan.suggestedAmountText,
    start_date: plan.startDate || null,
    end_date: plan.endDate || null,
    status: plan.status,
    sort_order: plan.sortOrder,
  };
}

function toDonationRecordRow(record: DonationRecord) {
  return {
    id: record.id,
    plan_id: record.planId,
    donor_name: record.donorName,
    club_name: record.clubName,
    donor_type: record.donorType,
    amount: record.amount,
    transfer_last_five: record.transferLastFive,
    note: record.note,
    payment_status: record.paymentStatus,
    created_at: record.createdAt,
  };
}

function normalizeCategory(category: string): DonationCategory {
  if (category === "global" || category === "全球" || category === "全球計畫") {
    return "全球計畫";
  }
  if (category === "district" || category === "地區" || category === "地區計畫") {
    return "地區計畫";
  }

  return "社內計畫";
}

function normalizeDonorType(donorType: string): DonorType {
  if (donorType === "友社" || donorType === "其他") {
    return donorType;
  }

  return "晨光社友";
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

function getNumber(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      return Number(value) || 0;
    }
  }

  return 0;
}

function getBoolean(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value === "true" || value === "開放" || value === "是";
  }

  return undefined;
}

function stripParagraphTags(value: string) {
  return value.replaceAll("<p>", "").replaceAll("</p>", "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
