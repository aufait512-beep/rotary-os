export type PaymentMethod = "轉帳" | "信用卡扣" | "現金";

export type DuesLineItemType =
  | "meal"
  | "annual_fee"
  | "special_donation"
  | "red_box"
  | "rotary_foundation"
  | "pass_through"
  | "legacy";

export type DuesLineItem = {
  id: string;
  duesRecordId: string;
  itemType: DuesLineItemType;
  itemName: string;
  serviceDate: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  note: string;
  createdAt: string;
};

export type DuesRecord = {
  id: string;
  memberId: string;
  periodMonth: string;
  previousBalance: number;
  currentDue: number;
  paidAmount: number;
  discountAmount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  note: string;
  createdAt: string;
  lineItems: DuesLineItem[];
};

export const DUES_STORAGE_KEY = "rotary-os-dues-records";

export const emptyDuesRecord: Omit<DuesRecord, "id" | "createdAt"> = {
  memberId: "",
  periodMonth: "",
  previousBalance: 0,
  currentDue: 0,
  paidAmount: 0,
  discountAmount: 0,
  paymentDate: "",
  paymentMethod: "轉帳",
  note: "",
  lineItems: [],
};

export function readDuesRecordsFromStorage(): DuesRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawRecords = window.localStorage.getItem(DUES_STORAGE_KEY);
    if (!rawRecords) {
      return [];
    }

    const parsedRecords = JSON.parse(rawRecords);
    if (!Array.isArray(parsedRecords)) {
      return [];
    }

    return parsedRecords.map(normalizeDuesRecord);
  } catch {
    return [];
  }
}

export function writeDuesRecordsToStorage(records: DuesRecord[]) {
  window.localStorage.setItem(DUES_STORAGE_KEY, JSON.stringify(records));
}

export function calculateDuesBalance(record: DuesRecord) {
  return (
    record.previousBalance +
    record.currentDue -
    record.paidAmount
  );
}

export function getOutstandingBalance(record: DuesRecord) {
  return calculateDuesBalance(record);
}

export function getDisplayDuesBalance(record: DuesRecord) {
  return Math.max(0, getOutstandingBalance(record));
}

export function getDuesPaymentStatus(record: DuesRecord) {
  return getOutstandingBalance(record) > 0 ? "未匯款" : "已繳清";
}

export function sortDuesRecords(records: DuesRecord[]) {
  return [...records].sort((firstRecord, secondRecord) =>
    secondRecord.periodMonth.localeCompare(firstRecord.periodMonth)
  );
}

function normalizeDuesRecord(record: Partial<DuesRecord>): DuesRecord {
  return {
    id: record.id ?? crypto.randomUUID(),
    memberId: record.memberId ?? "",
    periodMonth: record.periodMonth ?? "",
    previousBalance: Number(record.previousBalance) || 0,
    currentDue: Number(record.currentDue) || 0,
    paidAmount: Number(record.paidAmount) || 0,
    discountAmount: Number(record.discountAmount) || 0,
    paymentDate: record.paymentDate ?? "",
    paymentMethod: normalizePaymentMethod(record.paymentMethod),
    note: record.note ?? "",
    createdAt: record.createdAt ?? new Date().toISOString(),
    lineItems: Array.isArray(record.lineItems) ? record.lineItems : [],
  };
}

function normalizePaymentMethod(paymentMethod: unknown): PaymentMethod {
  if (
    paymentMethod === "現金" ||
    paymentMethod === "轉帳" ||
    paymentMethod === "信用卡扣"
  ) {
    return paymentMethod;
  }

  return "轉帳";
}
