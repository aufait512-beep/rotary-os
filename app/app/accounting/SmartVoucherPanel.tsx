"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase";

type EntryType = "income" | "expense";
type EntryMode = "auto" | EntryType;
type Row = Record<string, unknown>;

type Account = {
  id: string;
  name: string;
  accountCategory: string;
};

type Category = {
  id: string;
  entryType: EntryType;
  groupName: string;
  name: string;
};

type Entry = {
  id: string;
  entryDate: string;
  entryType: EntryType;
  categoryId: string;
  category: string;
  description: string;
  amount: number;
  accountId: string;
  paymentMethod: string;
  referenceNo: string;
  status: string;
};

type VoucherSummary = {
  id: string;
  voucherNo: string;
  voucherDate: string;
  description: string;
  sourceEntryId: string;
  totalDebit: number;
  totalCredit: number;
  smartInput: string;
  smartConfidence: string;
  note: string;
};

type VoucherDraft = {
  entryType: EntryType;
  accountId: string;
  categoryId: string;
  amount: number;
  confidence: string;
  reason: string;
};

type SavedVoucher = VoucherSummary & {
  sourceEntryId: string;
};

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";
const inputClass =
  "mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 text-base text-[#173B73]";

const commonTransactions = [
  "收到本月社費",
  "收到公益捐款",
  "收到活動贊助款",
  "收到銀行利息",
  "支付例會餐費",
  "支付文具印刷費",
  "支付公益服務費",
];

export default function SmartVoucherPanel({
  yearId,
  month,
  cutoffDate,
  monthClosed,
  accounts,
  categories,
  entries,
  onSaved,
}: {
  yearId: string;
  month: string;
  cutoffDate: string;
  monthClosed: boolean;
  accounts: Account[];
  categories: Category[];
  entries: Entry[];
  onSaved: () => Promise<void> | void;
}) {
  const [voucherDate, setVoucherDate] = useState(() => defaultVoucherDate(month, cutoffDate));
  const [sourceEntryId, setSourceEntryId] = useState("");
  const [entryMode, setEntryMode] = useState<EntryMode>("auto");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState("轉帳");
  const [referenceNo, setReferenceNo] = useState("");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<VoucherDraft | null>(null);
  const [savedVoucher, setSavedVoucher] = useState<SavedVoucher | null>(null);
  const [vouchers, setVouchers] = useState<VoucherSummary[]>([]);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const loadVouchers = useCallback(async () => {
    if (!yearId || !voucherDate) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("accounting_vouchers")
      .select("*")
      .eq("rotary_year_id", yearId)
      .eq("voucher_date", voucherDate)
      .order("voucher_no");
    if (error) {
      console.error({ module: "smart-voucher", operation: "fetch vouchers", table: "accounting_vouchers", error });
      setErrorMessage("智慧傳票資料讀取失敗，請先執行 20260718_accounting_smart_vouchers.sql。");
      setVouchers([]);
    } else {
      setVouchers((data ?? []).map(mapVoucher));
    }
    setIsLoading(false);
  }, [voucherDate, yearId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadVouchers(), 0);
    return () => window.clearTimeout(timer);
  }, [loadVouchers]);

  const voucherSourceIds = useMemo(
    () => new Set(vouchers.map((voucher) => voucher.sourceEntryId).filter(Boolean)),
    [vouchers]
  );
  const availableEntries = entries.filter(
    (entry) =>
      entry.entryDate === voucherDate &&
      entry.status === "posted" &&
      entry.amount > 0 &&
      !voucherSourceIds.has(entry.id)
  );
  const selectedEntry = entries.find((entry) => entry.id === sourceEntryId);
  const selectedCategory = draft
    ? categories.find((category) => category.id === draft.categoryId)
    : undefined;
  const selectedAccount = draft
    ? accounts.find((account) => account.id === draft.accountId)
    : undefined;
  const displayLines = draft
    ? buildDisplayLines(draft, selectedAccount?.name ?? "", selectedCategory?.name ?? "")
    : [];

  function resetPreview() {
    setDraft(null);
    setSavedVoucher(null);
    setMessage("");
  }

  function selectExistingEntry(entryId: string) {
    setSourceEntryId(entryId);
    resetPreview();
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) {
      setDescription("");
      setAmount("");
      return;
    }
    setVoucherDate(entry.entryDate);
    setEntryMode(entry.entryType);
    setDescription(entry.description || entry.category);
    setAmount(String(entry.amount));
    setAccountId(entry.accountId || accounts[0]?.id || "");
    setPaymentMethod(entry.paymentMethod || "其他");
    setReferenceNo(entry.referenceNo || "");
  }

  function createDraft(event?: FormEvent) {
    event?.preventDefault();
    setErrorMessage("");
    setMessage("");
    setSavedVoucher(null);
    const resolvedAmount = toNumber(amount) || extractAmount(description);
    if (!description.trim()) return setErrorMessage("請輸入一句話交易說明。");
    if (resolvedAmount <= 0) return setErrorMessage("請輸入金額，或在交易說明中包含金額。");

    const resolvedType = selectedEntry?.entryType ?? inferEntryType(description, entryMode);
    const categorySuggestion = selectedEntry?.categoryId
      ? {
          category: categories.find((category) => category.id === selectedEntry.categoryId),
          confidence: "高",
          reason: "直接沿用選定收支的既有科目",
        }
      : suggestCategory(description, resolvedType, categories);
    const resolvedAccountId = selectedEntry?.accountId || accountId || accounts[0]?.id;
    if (!resolvedAccountId) return setErrorMessage("請先建立或選擇收付款帳戶。");
    if (!categorySuggestion.category) {
      return setErrorMessage(`找不到可用的${resolvedType === "income" ? "收入" : "支出"}科目，請先在年度預算建立科目。`);
    }

    setAmount(String(resolvedAmount));
    setEntryMode(resolvedType);
    setAccountId(resolvedAccountId);
    setDraft({
      entryType: resolvedType,
      accountId: resolvedAccountId,
      categoryId: categorySuggestion.category.id,
      amount: resolvedAmount,
      confidence: categorySuggestion.confidence,
      reason: categorySuggestion.reason,
    });
  }

  async function saveVoucher() {
    if (monthClosed) return setErrorMessage("本月份已月結，請先解除月結後再建立傳票。");
    if (!draft || !selectedAccount || !selectedCategory) {
      return setErrorMessage("請先產生並確認借貸分錄草稿。");
    }
    if (!window.confirm(`確認將 ${formatCurrency(draft.amount)} 列帳並建立正式傳票嗎？`)) return;

    const voucherId = crypto.randomUUID();
    const lines = buildRpcLines(voucherId, draft, note);
    const entryPayload = sourceEntryId
      ? null
      : {
          id: crypto.randomUUID(),
          entry_type: draft.entryType,
          category_id: selectedCategory.id,
          category: selectedCategory.name,
          amount: draft.amount,
          account_id: selectedAccount.id,
          payment_method: paymentMethod,
          reference_no: referenceNo.trim(),
          note: note.trim(),
        };

    setIsSaving(true);
    setErrorMessage("");
    try {
      const payload = {
        p_voucher_id: voucherId,
        p_rotary_year_id: yearId,
        p_voucher_date: voucherDate,
        p_description: description.trim(),
        p_smart_input: description.trim(),
        p_smart_confidence: `${draft.confidence}｜${draft.reason}`,
        p_note: note.trim(),
        p_source_entry_id: sourceEntryId || null,
        p_entry_payload: entryPayload,
        p_lines: lines,
      };
      const { data, error } = await supabase.rpc("create_accounting_voucher", payload);
      if (error) {
        console.error({ module: "smart-voucher", operation: "create voucher", table: "accounting_vouchers", payload, error });
        throw error;
      }
      const result = data as Row;
      setSavedVoucher({
        id: voucherId,
        voucherNo: text(result.voucher_no),
        voucherDate,
        description: description.trim(),
        sourceEntryId: text(result.source_entry_id),
        totalDebit: toNumber(result.total_debit),
        totalCredit: toNumber(result.total_credit),
        smartInput: description.trim(),
        smartConfidence: `${draft.confidence}｜${draft.reason}`,
        note: note.trim(),
      });
      setSourceEntryId(text(result.source_entry_id));
      setMessage("傳票已列帳並儲存，可匯出 A5 JPG。");
      await loadVouchers();
      await onSaved();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "傳票儲存失敗"));
    } finally {
      setIsSaving(false);
    }
  }

  async function loadSavedVoucher(voucher: VoucherSummary) {
    setErrorMessage("");
    const { data, error } = await supabase
      .from("accounting_voucher_lines")
      .select("*")
      .eq("voucher_id", voucher.id)
      .order("line_no");
    if (error) {
      console.error({ module: "smart-voucher", operation: "fetch voucher lines", table: "accounting_voucher_lines", error });
      return setErrorMessage("傳票明細讀取失敗：" + error.message);
    }
    const lines = (data ?? []) as Row[];
    const debit = lines.find((line) => text(line.line_side) === "debit");
    const credit = lines.find((line) => text(line.line_side) === "credit");
    const accountLine = lines.find((line) => text(line.account_id));
    const categoryLine = lines.find((line) => text(line.category_id));
    if (!debit || !credit || !accountLine || !categoryLine) {
      return setErrorMessage("此傳票缺少完整借貸科目，請人工核對。");
    }
    const entryType: EntryType = text(debit.account_id) ? "income" : "expense";
    setVoucherDate(voucher.voucherDate);
    setSourceEntryId(voucher.sourceEntryId);
    setDescription(voucher.description);
    setAmount(String(voucher.totalDebit));
    setEntryMode(entryType);
    setAccountId(text(accountLine.account_id));
    setNote(voucher.note);
    setDraft({
      entryType,
      accountId: text(accountLine.account_id),
      categoryId: text(categoryLine.category_id),
      amount: voucher.totalDebit,
      confidence: voucher.smartConfidence.split("｜")[0] || "已確認",
      reason: voucher.smartConfidence.split("｜").slice(1).join("｜") || "已儲存傳票",
    });
    setSavedVoucher({ ...voucher });
    setMessage("已載入正式傳票，可再次匯出 JPG。");
  }

  async function exportJpg() {
    if (!savedVoucher || !draft) return setErrorMessage("請先儲存正式傳票後再匯出 JPG。");
    const element = document.getElementById("smart-voucher-a5-sheet");
    if (!element) return setErrorMessage("找不到傳票預覽區塊。");
    setIsExporting(true);
    setErrorMessage("");
    try {
      await document.fonts.ready;
      const html2canvasModule = await import("html2canvas");
      const canvas = await html2canvasModule.default(element, {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        onclone: (clonedDocument) => {
          const clonedSheet = clonedDocument.getElementById("smart-voucher-a5-sheet");
          if (!clonedSheet) return;
          clonedSheet.style.setProperty("background-color", "rgb(255, 255, 255)", "important");
          clonedSheet.style.setProperty("color", "rgb(0, 0, 0)", "important");
          clonedSheet.style.setProperty("box-shadow", "none", "important");
          clonedSheet.querySelectorAll<HTMLElement>("*").forEach((node) => {
            node.style.setProperty("color", "rgb(0, 0, 0)", "important");
            node.style.setProperty("border-color", "rgb(0, 0, 0)", "important");
            node.style.setProperty("box-shadow", "none", "important");
            if (node.tagName === "TABLE" || node.tagName === "THEAD" || node.tagName === "TBODY" || node.tagName === "TR" || node.tagName === "TH" || node.tagName === "TD") {
              node.style.setProperty("background-color", "rgb(255, 255, 255)", "important");
            }
          });
        },
      });
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.download = `高雄晨光扶輪社_傳票_${savedVoucher.voucherDate}_${safeFileName(savedVoucher.voucherNo)}.jpg`;
      link.click();
      setMessage("A5 傳票 JPG 已匯出。");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "傳票 JPG 匯出失敗"));
    } finally {
      setIsExporting(false);
    }
  }

  function printVoucher() {
    if (!savedVoucher || !draft) return setErrorMessage("請先儲存正式傳票後再列印。");
    const element = document.getElementById("smart-voucher-a5-sheet");
    if (!element) return setErrorMessage("找不到傳票預覽區塊。");

    const frame = document.createElement("iframe");
    frame.setAttribute("title", "A5 傳票列印");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.style.right = "0";
    frame.style.bottom = "0";
    document.body.appendChild(frame);

    const printDocument = frame.contentDocument;
    if (!printDocument) {
      frame.remove();
      return setErrorMessage("無法建立列印頁面。");
    }
    printDocument.open();
    printDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>記帳傳票</title><style>
      @page { size: A5 landscape; margin: 0; }
      html, body { width: 210mm; height: 148mm; margin: 0; padding: 0; background: #fff; color: #000; }
      * { box-sizing: border-box; color: #000 !important; border-color: #000 !important; box-shadow: none !important; }
      #smart-voucher-a5-sheet { width: 210mm; height: 148mm; padding: 9mm 10mm; overflow: hidden; background: #fff; font-family: serif; font-size: 13pt; line-height: 1.3; }
      table { width: 100%; table-layout: fixed; border-collapse: collapse; }
      th, td { border: 1px solid #000; padding: 5px 8px; font-size: 13pt; }
      .text-center { text-align: center; } .text-right { text-align: right; } .text-left { text-align: left; }
      .font-bold, strong { font-weight: 700; } .border-b-2 { border-bottom: 2px solid #000; }
      .border, .border-black { border: 1px solid #000; } .border-b { border-bottom: 1px solid #000; }
      .grid { display: grid; } .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); } .col-span-2 { grid-column: span 2 / span 2; }
      .gap-x-6 { column-gap: 24px; } .gap-y-2 { row-gap: 8px; } .gap-4 { gap: 16px; }
      .mt-1 { margin-top: 4px; } .mt-2 { margin-top: 8px; } .mt-4 { margin-top: 16px; }
      .mt-10 { margin-top: 40px; } .mt-12 { margin-top: 48px; } .pb-3 { padding-bottom: 12px; }
      .p-3 { padding: 12px; } .h-10 { height: 40px; } .min-h-16 { min-height: 64px; }
      h3, p { margin-bottom: 0; } h3 { margin-top: 0; font-size: 22pt; }
      #smart-voucher-a5-sheet > div:first-child > p { font-size: 17pt; }
    </style></head><body>${element.outerHTML}</body></html>`);
    printDocument.close();
    window.setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => frame.remove(), 1000);
    }, 250);
  }

  return (
    <section className="min-w-0 rounded-3xl bg-white/90 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#C99700]">Jade 智慧會計</p>
          <h2 className="mt-1 text-xl font-bold">智慧傳票｜當日列帳</h2>
          <p className="mt-2 text-sm font-semibold text-[#173B73]/70">
            選一筆已登錄金額，或用一句話輸入交易；系統會建議借貸科目，確認後才正式列帳。
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#173B73] px-3 py-1 text-xs font-bold text-white">A5 橫式</span>
      </div>

      {errorMessage ? <Notice tone="error">{errorMessage}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {monthClosed ? <Notice tone="warning">本月份已鎖定，只能查看與匯出既有傳票。</Notice> : null}

      <form onSubmit={createDraft} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="傳票日期">
          <input
            type="date"
            min={`${month}-01`}
            max={cutoffDate}
            value={voucherDate}
            onChange={(event) => {
              setVoucherDate(event.target.value);
              setSourceEntryId("");
              resetPreview();
            }}
            className={inputClass}
          />
        </Field>
        <Field label="選定已登錄金額">
          <select value={sourceEntryId} onChange={(event) => selectExistingEntry(event.target.value)} className={inputClass}>
            <option value="">手動輸入新交易</option>
            {availableEntries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {formatCurrency(entry.amount)}｜{entry.description || entry.category}
              </option>
            ))}
          </select>
        </Field>
        <Field label="常見交易">
          <select
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) setDescription(event.target.value);
              setSourceEntryId("");
              resetPreview();
            }}
            className={inputClass}
          >
            <option value="">選一則常見交易帶入</option>
            {commonTransactions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="交易類型">
          <select
            value={entryMode}
            disabled={Boolean(selectedEntry)}
            onChange={(event) => {
              setEntryMode(event.target.value as EntryMode);
              resetPreview();
            }}
            className={inputClass}
          >
            <option value="auto">由系統判斷</option>
            <option value="income">收入</option>
            <option value="expense">支出</option>
          </select>
        </Field>
        <label className="block md:col-span-2">
          <span className="text-sm font-bold">一句話交易說明</span>
          <textarea
            rows={3}
            value={description}
            readOnly={Boolean(selectedEntry)}
            onChange={(event) => {
              setDescription(event.target.value);
              resetPreview();
            }}
            placeholder="例如：收到 PDG APPS 認捐 10,000 元"
            className={`${inputClass} resize-none`}
          />
        </label>
        <Field label="金額">
          <input
            type="number"
            min="1"
            value={amount}
            readOnly={Boolean(selectedEntry)}
            onChange={(event) => {
              setAmount(event.target.value);
              resetPreview();
            }}
            placeholder="可留空，由說明文字擷取"
            className={inputClass}
          />
        </Field>
        <Field label="收付款帳戶">
          <select
            value={accountId}
            onChange={(event) => {
              setAccountId(event.target.value);
              resetPreview();
            }}
            className={inputClass}
          >
            <option value="">請選擇</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </Field>
        <Field label="收付款方式">
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={inputClass}>
            <option>轉帳</option><option>現金</option><option>信用卡扣</option><option>其他</option>
          </select>
        </Field>
        <Field label="憑證編號">
          <input value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} className={inputClass} />
        </Field>
        <label className="block md:col-span-2">
          <span className="text-sm font-bold">備註</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} className={inputClass} />
        </label>
        <button
          type="submit"
          disabled={monthClosed}
          className={`rounded-2xl bg-[#F7C948] px-4 py-4 font-bold disabled:opacity-50 md:col-span-2 ${buttonShadow}`}
        >
          智慧產生借貸分錄草稿
        </button>
      </form>

      {draft ? (
        <div className="mt-6 min-w-0">
          <div className="rounded-2xl border border-[#D9CCF6] bg-[#F7F3FF] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-[#6D28D9]">智慧傳票草稿｜請確認科目</h3>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-bold">信心：{draft.confidence}</span>
            </div>
            <p className="mt-2 text-sm font-semibold">{draft.reason}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label={draft.entryType === "income" ? "借方科目（收款帳戶）" : "貸方科目（付款帳戶）"}>
                <select
                  value={draft.accountId}
                  onChange={(event) => {
                    setAccountId(event.target.value);
                    setDraft({ ...draft, accountId: event.target.value, reason: "已由秘書人工調整帳戶" });
                    setSavedVoucher(null);
                  }}
                  className={inputClass}
                >
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </Field>
              <Field label={draft.entryType === "income" ? "貸方科目（收入科目）" : "借方科目（支出科目）"}>
                <select
                  value={draft.categoryId}
                  onChange={(event) => {
                    setDraft({ ...draft, categoryId: event.target.value, reason: "已由秘書人工調整會計科目" });
                    setSavedVoucher(null);
                  }}
                  className={inputClass}
                >
                  {categories.filter((category) => category.entryType === draft.entryType).map((category) => (
                    <option key={category.id} value={category.id}>{category.groupName}｜{category.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-[#D9CCF6] bg-white">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead><tr className="bg-[#173B73] text-white"><Th>借／貸</Th><Th>科目</Th><Th>借方</Th><Th>貸方</Th></tr></thead>
                <tbody>{displayLines.map((line) => <tr key={line.side}><Td>{line.side === "debit" ? "借 Dr" : "貸 Cr"}</Td><Td>{line.subject}</Td><Td>{line.side === "debit" ? formatCurrency(line.amount) : ""}</Td><Td>{line.side === "credit" ? formatCurrency(line.amount) : ""}</Td></tr>)}</tbody>
                <tfoot><tr className="font-bold"><Td colSpan={2}>合計</Td><Td>{formatCurrency(draft.amount)}</Td><Td>{formatCurrency(draft.amount)}</Td></tr></tfoot>
              </table>
            </div>
            <button
              type="button"
              disabled={isSaving || monthClosed || Boolean(savedVoucher)}
              onClick={() => void saveVoucher()}
              className={`mt-4 w-full rounded-2xl bg-[#173B73] py-4 font-bold text-white disabled:opacity-50 ${buttonShadow}`}
            >
              {isSaving ? "列帳中" : savedVoucher ? "已建立正式傳票" : "確認科目並列帳"}
            </button>
          </div>

          <div className="mt-5 overflow-x-auto rounded-2xl border border-[#E5D9BD] bg-[#ECE7DB] p-3">
            <div
              id="smart-voucher-a5-sheet"
              className="mx-auto box-border h-[148mm] w-[210mm] overflow-hidden bg-white px-[10mm] py-[9mm] font-serif text-[13pt] leading-[1.3] text-black shadow-sm"
            >
              <div className="border-b-2 border-black pb-3 text-center">
                <h3 className="text-[22pt] font-bold">高雄晨光扶輪社</h3>
                <p className="mt-1 text-[17pt] font-bold">記帳傳票</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[13pt]">
                <p>傳票號碼：<strong>{savedVoucher?.voucherNo || "草稿"}</strong></p>
                <p className="text-right">日期：{formatDate(voucherDate)}</p>
                <p className="col-span-2">摘要：<strong>{description}</strong></p>
              </div>
              <table className="mt-3 w-full table-fixed border-collapse text-[13pt]">
                <thead><tr><A5Th className="w-[14%]">借／貸</A5Th><A5Th className="w-[38%]">會計科目</A5Th><A5Th className="w-[20%]">借方金額</A5Th><A5Th className="w-[20%]">貸方金額</A5Th></tr></thead>
                <tbody>
                  {displayLines.map((line) => (
                    <tr key={line.side}>
                      <A5Td>{line.side === "debit" ? "借" : "貸"}</A5Td>
                      <A5Td>{line.subject}</A5Td>
                      <A5Td align="right">{line.side === "debit" ? formatNumber(line.amount) : ""}</A5Td>
                      <A5Td align="right">{line.side === "credit" ? formatNumber(line.amount) : ""}</A5Td>
                    </tr>
                  ))}
                  <tr className="font-bold"><A5Td colSpan={2}>合計</A5Td><A5Td align="right">{formatNumber(draft.amount)}</A5Td><A5Td align="right">{formatNumber(draft.amount)}</A5Td></tr>
                </tbody>
              </table>
              <div className="mt-3 min-h-14 border border-black p-2 text-[12pt]">
                <p className="font-bold">備註</p>
                <p className="mt-1 whitespace-pre-wrap">{note || "無"}</p>
              </div>
              <div className="mt-3 rounded border border-black p-2 text-[11pt]">
                <p>系統建議：{draft.entryType === "income" ? "收入交易，借記收款帳戶、貸記收入科目。" : "支出交易，借記支出科目、貸記付款帳戶。"}</p>
                <p className="mt-1">借方合計 {formatCurrency(draft.amount)}｜貸方合計 {formatCurrency(draft.amount)}｜差額 0</p>
              </div>
              <div className="mt-7 grid grid-cols-4 gap-4 text-center text-[12pt]">
                {['社長', '秘書', '會計長', '製表'].map((label) => <div key={label}><div className="h-8 border-b border-black" /><p className="mt-1">{label}</p></div>)}
              </div>
              <p className="mt-5 text-center text-[10pt] text-gray-500">Rotary OS Beta 1.0｜Jadecode Studio</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={!savedVoucher || isExporting}
              onClick={() => void exportJpg()}
              className={`w-full rounded-2xl bg-[#F7C948] py-4 font-bold disabled:opacity-50 ${buttonShadow}`}
            >
              {isExporting ? "A5 JPG 產出中" : "匯出 A5 橫式 JPG"}
            </button>
            <button
              type="button"
              disabled={!savedVoucher}
              onClick={printVoucher}
              className={`w-full rounded-2xl bg-white py-4 font-bold disabled:opacity-50 ${buttonShadow}`}
            >
              列印 A5 橫式傳票
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 border-t border-[#E5D9BD] pt-4">
        <h3 className="font-bold">本日已建立傳票（{vouchers.length}）</h3>
        {isLoading ? <p className="mt-2 text-sm font-semibold">讀取中</p> : null}
        {!isLoading && vouchers.length === 0 ? <p className="mt-2 text-sm font-semibold text-[#173B73]/65">本日尚未建立傳票。</p> : null}
        <div className="mt-3 space-y-2">
          {vouchers.map((voucher) => (
            <button
              key={voucher.id}
              type="button"
              onClick={() => void loadSavedVoucher(voucher)}
              className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#F8F3E8] p-3 text-left"
            >
              <span className="min-w-0"><strong>{voucher.voucherNo}</strong><span className="ml-2 break-words text-sm">{voucher.description}</span></span>
              <span className="shrink-0 font-bold">{formatCurrency(voucher.totalDebit)}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function buildRpcLines(voucherId: string, draft: VoucherDraft, note: string) {
  const debitIsAccount = draft.entryType === "income";
  return [
    {
      id: crypto.randomUUID(), voucher_id: voucherId, line_no: 1, line_side: "debit",
      account_id: debitIsAccount ? draft.accountId : null,
      category_id: debitIsAccount ? null : draft.categoryId,
      amount: draft.amount, note,
    },
    {
      id: crypto.randomUUID(), voucher_id: voucherId, line_no: 2, line_side: "credit",
      account_id: debitIsAccount ? null : draft.accountId,
      category_id: debitIsAccount ? draft.categoryId : null,
      amount: draft.amount, note,
    },
  ];
}

function buildDisplayLines(draft: VoucherDraft, accountName: string, categoryName: string) {
  return draft.entryType === "income"
    ? [
        { side: "debit" as const, subject: accountName, amount: draft.amount },
        { side: "credit" as const, subject: categoryName, amount: draft.amount },
      ]
    : [
        { side: "debit" as const, subject: categoryName, amount: draft.amount },
        { side: "credit" as const, subject: accountName, amount: draft.amount },
      ];
}

function inferEntryType(input: string, mode: EntryMode): EntryType {
  if (mode !== "auto") return mode;
  const incomeWords = ["收到", "收入", "收款", "認捐", "捐款", "捐獻", "贊助", "社費", "利息", "退款收入"];
  const expenseWords = ["支付", "支出", "付款", "購買", "採購", "繳交", "匯給", "費用", "餐費", "場租"];
  const incomeScore = incomeWords.filter((word) => input.includes(word)).length;
  const expenseScore = expenseWords.filter((word) => input.includes(word)).length;
  return expenseScore > incomeScore ? "expense" : "income";
}

function suggestCategory(input: string, entryType: EntryType, categories: Category[]) {
  const candidates = categories.filter((category) => category.entryType === entryType);
  const normalized = input.toLowerCase().replace(/\s+/g, "");
  const exact = candidates.find((category) =>
    [category.name, category.groupName]
      .filter(Boolean)
      .some((value) => normalized.includes(value.toLowerCase().replace(/\s+/g, "")))
  );
  if (exact) return { category: exact, confidence: "高", reason: `交易文字直接符合「${exact.groupName}／${exact.name}」` };

  const aliases = [
    { inputs: ["認捐", "捐款", "捐獻", "贊助", "公益"], targets: ["捐", "基金", "公益", "服務"] },
    { inputs: ["社費", "常年費"], targets: ["社費", "常年"] },
    { inputs: ["餐費", "餐敘", "用餐", "餐廳"], targets: ["餐", "例會"] },
    { inputs: ["紅箱", "慶典"], targets: ["紅箱", "慶典"] },
    { inputs: ["扶輪基金"], targets: ["扶輪基金", "基金"] },
    { inputs: ["利息", "孳息"], targets: ["利息", "孳息"] },
    { inputs: ["文具", "印刷", "影印"], targets: ["文具", "印刷", "行政"] },
    { inputs: ["場租", "飯店", "旅館", "會議室"], targets: ["場租", "例會", "會議"] },
    { inputs: ["交通", "車資", "高鐵", "計程車"], targets: ["交通", "車資"] },
  ];
  let best: { category: Category; score: number } | null = null;
  for (const category of candidates) {
    const categoryText = `${category.groupName}${category.name}`;
    let score = 0;
    for (const alias of aliases) {
      if (alias.inputs.some((word) => normalized.includes(word))) {
        score += alias.targets.filter((word) => categoryText.includes(word)).length * 10;
      }
    }
    if (!best || score > best.score) best = { category, score };
  }
  if (best && best.score > 0) {
    return { category: best.category, confidence: "中", reason: `依交易關鍵字建議「${best.category.groupName}／${best.category.name}」` };
  }
  const fallback = candidates.find((category) => /其他|雜項/.test(`${category.groupName}${category.name}`)) ?? candidates[0];
  return { category: fallback, confidence: "低", reason: fallback ? `未找到明確關鍵字，暫列「${fallback.groupName}／${fallback.name}」，請人工確認` : "沒有可用科目" };
}

function extractAmount(input: string) {
  const matches = input.match(/\d[\d,]*/g) ?? [];
  return Math.max(0, ...matches.map((value) => Number(value.replace(/,/g, ""))).filter(Number.isFinite));
}

function mapVoucher(row: Row): VoucherSummary {
  return {
    id: text(row.id),
    voucherNo: text(row.voucher_no),
    voucherDate: text(row.voucher_date),
    description: text(row.description),
    sourceEntryId: text(row.source_entry_id),
    totalDebit: toNumber(row.total_debit),
    totalCredit: toNumber(row.total_credit),
    smartInput: text(row.smart_input),
    smartConfidence: text(row.smart_confidence),
    note: text(row.note),
  };
}

function Field({ label, children }: React.PropsWithChildren<{ label: string }>) {
  return <label className="block min-w-0"><span className="text-sm font-bold">{label}</span>{children}</label>;
}
function Notice({ tone, children }: React.PropsWithChildren<{ tone: "error" | "success" | "warning" }>) {
  const style = tone === "error" ? "bg-red-50 text-red-700" : tone === "success" ? "bg-green-50 text-green-700" : "bg-[#FFF6D6] text-[#805500]";
  return <p className={`mt-4 rounded-2xl p-4 text-sm font-bold ${style}`}>{children}</p>;
}
function Th({ children }: React.PropsWithChildren) { return <th className="border border-[#E5D9BD] px-3 py-2 text-left">{children}</th>; }
function Td({ children, colSpan }: React.PropsWithChildren<{ colSpan?: number }>) { return <td colSpan={colSpan} className="border border-[#E5D9BD] px-3 py-2 font-semibold">{children}</td>; }
function A5Th({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) { return <th className={`border border-black px-2 py-2 text-center ${className}`}>{children}</th>; }
function A5Td({ children, align = "left", colSpan }: React.PropsWithChildren<{ align?: "left" | "right"; colSpan?: number }>) { return <td colSpan={colSpan} className={`border border-black px-2 py-3 ${align === "right" ? "text-right" : "text-left"}`}>{children}</td>; }
function text(value: unknown) { return typeof value === "string" ? value : value == null ? "" : String(value); }
function toNumber(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function formatNumber(value: number) { return new Intl.NumberFormat("zh-TW").format(value); }
function formatCurrency(value: number) { return `NT$${formatNumber(value)}`; }
function formatDate(value: string) { const [year, month, day] = value.split("-"); return year && month && day ? `${year}/${month}/${day}` : value; }
function defaultVoucherDate(month: string, cutoffDate: string) { const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" }); return today.startsWith(`${month}-`) ? today : cutoffDate; }
function safeFileName(value: string) { return value.replace(/[\\/:*?"<>|\s]+/g, ""); }
function getErrorMessage(error: unknown, fallback: string) { return error instanceof Error ? `${fallback}：${error.message}` : fallback; }
