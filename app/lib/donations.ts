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
  unitAmount: number;
  currency: string;
  targetUnits: number;
  sourceLabel: string;
  sourceUrl: string;
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
    id: "f33744f1-113d-43c4-92d7-77c20f982d72",
    category: "全球計畫",
    title: "保羅哈里斯認捐",
    description:
      "保羅哈里斯之友（PHF）認捐：個人捐至年度基金、根除小兒麻痺或核准的獎助金專案，累計達 US$1,000，或透過表彰積點轉移達成。總表以 1 單位 US$1,000 登錄認捐。",
    suggestedAmountText:
      "1 單位代表 US$1,000；本項只登錄認捐，不自動換算台幣社費。",
    unitAmount: 1000,
    currency: "USD",
    targetUnits: 0,
    sourceLabel: "國際扶輪 3510 地區｜扶輪基金的捐獻項目及表彰說明",
    sourceUrl:
      "https://www.rid3510.org/eventdetail.html?actid=4B94D0BF-7412-4999-9A8E-3D70582C8FF6",
    startDate: "2026-07-01",
    endDate: "2026-10-30",
    status: "open",
    sortOrder: 1,
  },
  {
    id: "d1406338-af77-423c-877c-6647aa5b254c",
    category: "地區計畫",
    title: "中華扶輪教育基金",
    description: "支持教育相關公益計畫。",
    suggestedAmountText: "自由捐獻",
    unitAmount: 0,
    currency: "TWD",
    targetUnits: 0,
    sourceLabel: "國際扶輪 3510 地區｜中華扶輪基金",
    sourceUrl: "https://www.rid3510.org/index.html",
    startDate: "",
    endDate: "",
    status: "open",
    sortOrder: 3,
  },
  {
    id: "41bf86bb-05fe-40b8-82a5-992175d5bba4",
    category: "地區計畫",
    title: "伊甸基金會慢飛天使",
    description:
      "支持伊甸基金會的慢飛天使（發展遲緩兒童）計畫，您可以透過線上定期或單筆捐款，直接成為早療家庭的堅強後盾，幫助孩子克服成長困境。",
    suggestedAmountText: "自由捐獻",
    unitAmount: 0,
    currency: "TWD",
    targetUnits: 0,
    sourceLabel: "",
    sourceUrl: "",
    startDate: "2026-07-01",
    endDate: "2027-06-30",
    status: "open",
    sortOrder: 4,
  },
  {
    id: "53b8147c-643e-4e73-b394-81be1639d298",
    category: "社內計畫",
    title: "小鄉社造志業聯盟-相機捐贈",
    description:
      "小鄉社造立背景：莫拉克風災後（2010年左右），在官方重建資源退場時生長出來。\n120公分，是一個孩子的視線高度。\n\n我們把相機交給長輩和孩子，\n讓他們用自己的眼睛拍下生活。\n不要求照片漂亮，只問一句話：\n「你為什麼拍這張？」\n一張照片，打開一個故事；\n一個故事，\n讓我們看見一個家庭真正需要什麼。",
    suggestedAmountText:
      "120公分的視角(社長計畫 小鄉相機捐助)\n目標48台。\n每台相機新台幣 4,000 元，共計19萬2000元\n歡迎社友自由捐獻",
    unitAmount: 4000,
    currency: "TWD",
    targetUnits: 48,
    sourceLabel: "社內捐獻計畫",
    sourceUrl: "",
    startDate: "2026-07-03",
    endDate: "2026-12-30",
    status: "open",
    sortOrder: 1,
  },
  {
    id: "42fd7796-5139-4e2f-8df9-917f50abf537",
    category: "社內計畫",
    title: "例會IOU紅箱",
    description:
      "例會IOU紅箱，費用將登錄在本月社費繳交明細中。\n\n友社社友，填寫後可在備註中寫明收據寄送地址，\n或於例會結束後請執秘開立收據。",
    suggestedAmountText:
      "例會IOU紅箱，您的每一份捐獻都將帶來美好的豐收",
    unitAmount: 0,
    currency: "TWD",
    targetUnits: 0,
    sourceLabel: "社內捐獻計畫",
    sourceUrl: "",
    startDate: "",
    endDate: "",
    status: "open",
    sortOrder: 1,
  },
  {
    id: "6e421a37-a2f2-4f71-91d7-1f4db75921ef",
    category: "全球計畫",
    title: "年度基金 EREY",
    description:
      "Every Rotarian, Every Year（每位社員、每年捐獻）鼓勵每位社友持續支持扶輪基金年度基金。3510 地區說明：全社年度計畫基金平均捐獻超過美金 100 元，且每位社員都有捐獻，可符合 EREY Club 表彰要件。",
    suggestedAmountText:
      "參考統計單位為每位社員每年 US$100；實際捐獻與匯率請由執行秘書依當年度地區通知確認。",
    unitAmount: 100,
    currency: "USD",
    targetUnits: 26,
    sourceLabel: "國際扶輪 3510 地區｜EREY 線上繳款操作說明",
    sourceUrl:
      "https://www.rid3510.org/eventdetail.html?actid=F7B9E262-5FF1-44D1-B315-C03EC24F9711",
    startDate: "",
    endDate: "",
    status: "closed",
    sortOrder: 2,
  },
  {
    id: "7b2ef9b5-ccae-41b6-a822-ad1d3f678926",
    category: "全球計畫",
    title: "保羅哈里斯會 PHS",
    description:
      "Paul Harris Society 會員承諾每年至少捐獻 US$1,000，可捐至年度基金、小兒麻痺或核准的獎助金專案。",
    suggestedAmountText:
      "1 單位代表每年承諾捐獻 US$1,000；美元項目不會直接併入台幣社費。",
    unitAmount: 1000,
    currency: "USD",
    targetUnits: 0,
    sourceLabel: "國際扶輪 3510 地區｜扶輪基金的捐獻項目及表彰說明",
    sourceUrl:
      "https://www.rid3510.org/eventdetail.html?actid=4B94D0BF-7412-4999-9A8E-3D70582C8FF6",
    startDate: "",
    endDate: "",
    status: "closed",
    sortOrder: 3,
  },
  {
    id: "b3d18fa0-af3d-49ed-97ad-738ba71b47d2",
    category: "全球計畫",
    title: "捐助基金 Benefactor",
    description:
      "Benefactor（捐助人）表彰適用於捐助基金（原永久基金）；3510 地區資料列出的資格為捐獻至少 US$1,000。",
    suggestedAmountText:
      "1 單位代表 US$1,000；美元項目不會直接併入台幣社費。",
    unitAmount: 1000,
    currency: "USD",
    targetUnits: 0,
    sourceLabel: "國際扶輪 3510 地區｜扶輪基金的捐獻項目及表彰說明",
    sourceUrl:
      "https://www.rid3510.org/eventdetail.html?actid=4B94D0BF-7412-4999-9A8E-3D70582C8FF6",
    startDate: "",
    endDate: "",
    status: "closed",
    sortOrder: 4,
  },
  {
    id: "394023f8-f236-4a35-bcd5-2521bb0618ec",
    category: "全球計畫",
    title: "終結小兒麻痺 PolioPlus",
    description:
      "支持國際扶輪根除小兒麻痺工作。此捐獻亦可計入 PHF、PHS 等相關扶輪基金表彰，但實際金額可由社友自由選擇。",
    suggestedAmountText: "自由捐獻；請由執行秘書確認當年度收款與換匯方式。",
    unitAmount: 0,
    currency: "USD",
    targetUnits: 0,
    sourceLabel: "國際扶輪 3510 地區｜扶輪基金的捐獻項目及表彰說明",
    sourceUrl:
      "https://www.rid3510.org/eventdetail.html?actid=4B94D0BF-7412-4999-9A8E-3D70582C8FF6",
    startDate: "",
    endDate: "",
    status: "closed",
    sortOrder: 5,
  },
  {
    id: "e2bd04c3-6b29-41ad-beb1-da59c9061561",
    category: "地區計畫",
    title: "3510 綠色奇蹟｜再生電腦",
    description:
      "募集與整理可再利用的電腦設備，支持在地非營利組織、偏鄉學校及弱勢族群。此為實物支持型計畫，預設不列金額；執行秘書可在確認本年度募集方式後設定單位與開放狀態。",
    suggestedAmountText: "實物捐贈／待執行秘書確認本年度募集規格。",
    unitAmount: 0,
    currency: "TWD",
    targetUnits: 0,
    sourceLabel: "國際扶輪 3510 地區｜綠色奇蹟再生電腦支持專案",
    sourceUrl: "https://www.rid3510.org/pcdonation.html",
    startDate: "",
    endDate: "",
    status: "closed",
    sortOrder: 5,
  },
];

export const emptyDonationPlan: Omit<DonationPlan, "id"> = {
  category: "社內計畫",
  title: "",
  description: "",
  suggestedAmountText: "",
  unitAmount: 0,
  currency: "TWD",
  targetUnits: 0,
  sourceLabel: "",
  sourceUrl: "",
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
    unitAmount: getNumber(plan, "unitAmount", "unit_amount"),
    currency: getText(plan, "currency") || "TWD",
    targetUnits: getNumber(plan, "targetUnits", "target_units"),
    sourceLabel: getText(plan, "sourceLabel", "source_label"),
    sourceUrl: getText(plan, "sourceUrl", "source_url"),
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
    unit_amount: plan.unitAmount,
    currency: plan.currency,
    target_units: plan.targetUnits,
    source_label: plan.sourceLabel || null,
    source_url: plan.sourceUrl || null,
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
