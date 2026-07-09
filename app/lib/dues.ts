export type PaymentMethod = "現金" | "轉帳" | "其他" | "未付款";

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
  paymentMethod: "未付款",
  note: "",
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
    record.paidAmount -
    record.discountAmount
  );
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
  };
}

function normalizePaymentMethod(paymentMethod: unknown): PaymentMethod {
  if (
    paymentMethod === "現金" ||
    paymentMethod === "轉帳" ||
    paymentMethod === "其他" ||
    paymentMethod === "未付款"
  ) {
    return paymentMethod;
  }

  return "未付款";
}
