"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  emptyMember,
  formatMemberName,
  Member,
  MemberStatus,
  normalizeMember,
  sortMembersByName,
} from "@/lib/members";
import {
  deleteMember,
  fetchMembers,
  insertMember,
  upsertMember,
} from "@/lib/supabaseData";

type MemberFormState = Omit<Member, "id" | "createdAt">;
type MemberField = keyof MemberFormState;

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

const memberFields: {
  name: MemberField;
  label: string;
  type?: string;
  required?: boolean;
}[] = [
  { name: "rotaryName", label: "社名" },
  { name: "chineseName", label: "中文姓名", required: true },
  { name: "englishName", label: "英文姓名" },
  { name: "title", label: "社內職務" },
  { name: "rotaryTitle", label: "扶輪職稱" },
  { name: "birthdayMonth", label: "生日月份", type: "number" },
  { name: "joinDate", label: "入社日期", type: "date" },
  { name: "birthday", label: "生日", type: "date" },
  { name: "anniversary", label: "結婚紀念日", type: "date" },
  { name: "classification", label: "職業分類" },
  { name: "organization", label: "服務單位" },
  { name: "workAddress", label: "服務地址" },
  { name: "homeAddress", label: "住址" },
  { name: "phone", label: "電話", type: "tel" },
  { name: "mobile", label: "行動電話", type: "tel" },
  { name: "fax", label: "傳真" },
  { name: "email", label: "E-mail", type: "email" },
  { name: "spouse", label: "夫人" },
  { name: "littleRotary", label: "小扶輪" },
  { name: "riNo", label: "RI 編號" },
];

const detailFields: { label: string; value: (member: Member) => string }[] = [
  { label: "社名", value: (member) => member.rotaryName },
  { label: "中文姓名", value: (member) => member.chineseName },
  { label: "英文姓名", value: (member) => member.englishName },
  { label: "社內職務", value: (member) => member.title },
  { label: "扶輪職稱", value: (member) => member.rotaryTitle },
  { label: "生日月份", value: (member) => member.birthdayMonth },
  { label: "入社日期", value: (member) => member.joinDate },
  { label: "生日", value: (member) => member.birthday },
  { label: "結婚紀念日", value: (member) => member.anniversary },
  { label: "職業分類", value: (member) => member.classification },
  { label: "服務單位", value: (member) => member.organization },
  { label: "服務地址", value: (member) => member.workAddress },
  { label: "住址", value: (member) => member.homeAddress },
  { label: "電話", value: (member) => member.phone },
  { label: "行動電話", value: (member) => member.mobile },
  { label: "傳真", value: (member) => member.fax },
  { label: "E-mail", value: (member) => member.email },
  { label: "夫人", value: (member) => member.spouse },
  { label: "小扶輪", value: (member) => member.littleRotary },
  { label: "RI 編號", value: (member) => member.riNo },
  { label: "狀態", value: (member) => formatStatus(member.status) },
  { label: "備註", value: (member) => member.note },
];

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState<MemberFormState>(emptyMember);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentMonth = new Date().getMonth() + 1;
  const birthdayMembers = useMemo(
    () =>
      sortMembersByName(
        members.filter((member) => getMemberBirthdayMonth(member) === currentMonth)
      ),
    [currentMonth, members]
  );
  const anniversaryMembers = useMemo(
    () =>
      sortMembersByName(
        members.filter(
          (member) => getDateMonth(member.anniversary) === currentMonth
        )
      ),
    [currentMonth, members]
  );
  const filteredMembers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const sortedMembers = sortMembersByName(members);

    if (!keyword) {
      return sortedMembers;
    }

    return sortedMembers.filter((member) =>
      [
        member.rotaryName,
        member.chineseName,
        member.englishName,
        member.classification,
        member.organization,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [members, searchTerm]);

  async function loadMembers() {
    try {
      setErrorMessage("");
      setMembers(await fetchMembers());
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "社友資料讀取失敗"));
    }
  }

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadMembers();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  function updateField(field: MemberField, value: string) {
    setForm((currentForm) => ({ ...currentForm, [field]: value }));
  }

  function resetForm() {
    setForm(emptyMember);
    setEditingId(null);
    setIsFormOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    try {
      if (editingId) {
        const currentMember = members.find((member) => member.id === editingId);
        const savedMember = await upsertMember({
          ...form,
          id: editingId,
          createdAt: currentMember?.createdAt ?? new Date().toISOString(),
        });
        setMembers((currentMembers) =>
          currentMembers.map((member) =>
            member.id === editingId ? savedMember : member
          )
        );
      } else {
        const savedMember = await upsertMember({
          ...form,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        });
        setMembers((currentMembers) => [savedMember, ...currentMembers]);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "社友資料儲存失敗"));
      return;
    }

    resetForm();
  }

  function handleEdit(member: Member) {
    setForm({
      chineseName: member.chineseName,
      englishName: member.englishName,
      rotaryName: member.rotaryName,
      title: member.title,
      rotaryTitle: member.rotaryTitle,
      birthdayMonth: member.birthdayMonth,
      phone: member.phone,
      mobile: member.mobile,
      email: member.email,
      spouse: member.spouse,
      joinDate: member.joinDate,
      birthday: member.birthday,
      anniversary: member.anniversary,
      classification: member.classification,
      organization: member.organization,
      workAddress: member.workAddress,
      homeAddress: member.homeAddress,
      fax: member.fax,
      littleRotary: member.littleRotary,
      riNo: member.riNo,
      note: member.note,
      status: member.status,
    });
    setSelectedMember(null);
    setEditingId(member.id);
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(memberId: string) {
    const confirmed = window.confirm("確定要刪除這位社友嗎？");
    if (!confirmed) {
      return;
    }

    try {
      setErrorMessage("");
      await deleteMember(memberId);
      setMembers((currentMembers) =>
        currentMembers.filter((member) => member.id !== memberId)
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "社友資料刪除失敗"));
      return;
    }
    if (editingId === memberId) {
      resetForm();
    }
    setSelectedMember(null);
  }

  async function handleImportJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const rawText = await file.text();
      let parsedJson: unknown;

      try {
        parsedJson = JSON.parse(rawText);
      } catch (error) {
        setImportMessage(`JSON 格式錯誤：${getRawErrorMessage(error)}`);
        return;
      }

      const importedItems = getImportedMemberItems(parsedJson);
      if (!importedItems) {
        setImportMessage("找不到 members 陣列。請提供陣列，或 { members: [...] }。");
        return;
      }

      if (importedItems.length === 0) {
        setImportMessage("members 陣列沒有資料。");
        return;
      }

      const normalizedMembers = importedItems
        .map(normalizeMember)
        .filter((member) => member.chineseName || member.rotaryName);

      if (normalizedMembers.length === 0) {
        setImportMessage("members 陣列沒有可匯入的中文姓名或社名資料。");
        return;
      }

      const result = await mergeImportedMembers(members, normalizedMembers);
      setMembers(result.members);
      setImportMessage(
        `匯入成功：新增 ${result.createdCount} 筆，更新 ${result.updatedCount} 筆。`
      );
    } catch (error) {
      setImportMessage(`Supabase 寫入失敗：${getRawErrorMessage(error)}`);
    } finally {
      event.target.value = "";
    }
  }

  function exportCsv() {
    const headers = [
      "社名",
      "中文姓名",
      "英文姓名",
      "社內職務",
      "扶輪職稱",
      "行動電話",
      "生日月份",
      "狀態",
      "入社日期",
      "生日",
      "結婚紀念日",
      "職業分類",
      "服務單位",
      "服務地址",
      "住址",
      "電話",
      "傳真",
      "E-mail",
      "夫人",
      "小扶輪",
      "RI 編號",
      "備註",
      "建立時間",
    ];
    const rows = filteredMembers.map((member) => [
      member.rotaryName,
      member.chineseName,
      member.englishName,
      member.title,
      member.rotaryTitle,
      member.mobile,
      member.birthdayMonth,
      formatStatus(member.status),
      member.joinDate,
      member.birthday,
      member.anniversary,
      member.classification,
      member.organization,
      member.workAddress,
      member.homeAddress,
      member.phone,
      member.fax,
      member.email,
      member.spouse,
      member.littleRotary,
      member.riNo,
      member.note,
      member.createdAt,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "高雄晨光扶輪社_社友名錄.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-[#F8F3E8] px-4 py-6 text-[#173B73]">
      <section className="mx-auto max-w-md space-y-6">
        <header className="space-y-3">
          <Link href="/" className="text-sm font-bold text-[#173B73]/75">
            返回首頁
          </Link>
          <div>
            <p className="text-sm font-bold tracking-[0.18em] text-[#C99700]">
              高雄晨光扶輪社
            </p>
            <h1 className="mt-2 text-3xl font-bold">社友管理</h1>
          </div>
        </header>
        {errorMessage ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <section className="grid grid-cols-1 gap-3">
          <MonthPanel title="本月壽星" members={birthdayMembers} />
          <MonthPanel title="本月結婚紀念" members={anniversaryMembers} />
        </section>

        <section className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportJson}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`w-full rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}
          >
            匯入 JSON
          </button>
          {importMessage ? (
            <p className="rounded-2xl bg-white/75 p-3 text-sm font-bold text-[#173B73]/80">
              {importMessage}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setIsFormOpen((currentValue) => !currentValue)}
            className={`w-full rounded-2xl bg-[#F7C948] py-4 font-bold ${buttonShadow}`}
          >
            {isFormOpen ? "收合新增表單" : "➕ 新增社友"}
          </button>
        </section>

        {isFormOpen ? (
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">
              {editingId ? "編輯社友" : "新增社友"}
            </h2>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className={`rounded-2xl bg-white px-4 py-2 text-sm font-bold ${buttonShadow}`}
              >
                取消
              </button>
            ) : null}
          </div>

          {memberFields.map((field) => (
            <label key={field.name} className="block">
              <span className="text-sm font-bold">{field.label}</span>
              <input
                required={field.required}
                type={field.type ?? "text"}
                min={field.name === "birthdayMonth" ? 1 : undefined}
                max={field.name === "birthdayMonth" ? 12 : undefined}
                value={form[field.name]}
                onChange={(event) => updateField(field.name, event.target.value)}
                className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
              />
            </label>
          ))}

          <label className="block">
            <span className="text-sm font-bold">狀態</span>
            <select
              value={form.status}
              onChange={(event) =>
                updateField("status", event.target.value as MemberStatus)
              }
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
            >
              <option value="active">現任</option>
              <option value="inactive">停用</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-bold">備註</span>
            <textarea
              value={form.note}
              onChange={(event) => updateField("note", event.target.value)}
              rows={4}
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
            />
          </label>

          <button
            type="submit"
            className={`w-full rounded-2xl bg-[#F7C948] py-4 font-bold ${buttonShadow}`}
          >
            {editingId ? "儲存修改" : "新增社友"}
          </button>
        </form>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-bold">社友列表</h2>
            <button
              type="button"
              onClick={exportCsv}
              className={`rounded-2xl bg-[#F7C948] px-4 py-2 text-sm font-bold ${buttonShadow}`}
            >
              匯出 CSV
            </button>
          </div>

          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="搜尋社名、中文姓名、英文姓名、職業分類、服務單位"
            className="w-full rounded-2xl border border-[#E5D9BD] bg-white px-4 py-3 outline-none focus:border-[#173B73] focus:ring-2 focus:ring-[#F7C948]"
          />

          {filteredMembers.length === 0 ? (
            <div className="rounded-3xl bg-white/75 p-5 text-center font-semibold text-[#173B73]/70 shadow-[6px_6px_16px_rgba(0,0,0,0.1),-6px_-6px_16px_rgba(255,255,255,0.8)]">
              目前沒有符合條件的社友。
            </div>
          ) : (
            filteredMembers.map((member) => (
              <button
                type="button"
                key={member.id}
                onClick={() => setSelectedMember(member)}
                className="block w-full rounded-3xl bg-white/85 p-5 text-left shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="mt-1 text-xl font-bold">
                      {formatMemberName(member) || "未命名社友"}
                    </h3>
                    <p className="text-sm font-semibold text-[#173B73]/70">
                      {member.title || "-"}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#173B73] px-3 py-1 text-xs font-bold text-white">
                    {formatStatus(member.status)}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-semibold text-[#173B73]/80">
                  <p>行動電話：{member.mobile || "-"}</p>
                  <p>生日月份：{member.birthdayMonth || "-"}</p>
                </div>
              </button>
            ))
          )}
        </section>
      </section>

      {selectedMember ? (
        <MemberDialog
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      ) : null}
    </main>
  );
}

function MonthPanel({ title, members }: { title: string; members: Member[] }) {
  return (
    <div className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]">
      <h2 className="text-xl font-bold">{title}</h2>
      {members.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-[#173B73]/70">
          本月暫無資料
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {members.map((member) => (
            <span
              key={`${title}-${member.id}`}
              className="rounded-full bg-[#F7C948] px-3 py-1 text-sm font-bold"
            >
              {formatMemberName(member)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MemberDialog({
  member,
  onClose,
  onEdit,
  onDelete,
}: {
  member: Member;
  onClose: () => void;
  onEdit: (member: Member) => void;
  onDelete: (memberId: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 px-4 py-6 sm:items-center">
      <dialog
        open
        className="mx-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-3xl bg-[#F8F3E8] p-0 text-[#173B73] shadow-2xl"
      >
        <div className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-[#C99700]">
                社友資料
              </p>
              <h2 className="mt-1 text-2xl font-bold">
                {formatMemberName(member) || "未命名社友"}
              </h2>
              <p className="text-sm font-semibold text-[#173B73]/70">
                {member.englishName || "-"} / {member.title || "-"}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-2xl bg-white px-4 py-2 text-sm font-bold ${buttonShadow}`}
            >
              關閉
            </button>
          </div>

          <div className="rounded-3xl bg-white/85 p-4">
            <div className="space-y-2 text-sm font-semibold">
              {detailFields.map((field) => (
                <p key={field.label}>
                  <span className="font-bold">{field.label}：</span>
                  {field.value(member) || "-"}
                </p>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onEdit(member)}
              className={`rounded-2xl bg-[#F7C948] py-3 font-bold ${buttonShadow}`}
            >
              編輯
            </button>
            <button
              type="button"
              onClick={() => onDelete(member.id)}
              className={`rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}
            >
              刪除
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

async function mergeImportedMembers(currentMembers: Member[], importedMembers: Member[]) {
  let createdCount = 0;
  let updatedCount = 0;
  const nextMembers = [...currentMembers];

  for (const importedMember of importedMembers) {
    const matchIndex = nextMembers.findIndex((member) =>
      isSameMember(member, importedMember)
    );

    if (matchIndex >= 0) {
      const savedMember = await upsertMember({
        ...nextMembers[matchIndex],
        ...importedMember,
        id: nextMembers[matchIndex].id,
        createdAt: nextMembers[matchIndex].createdAt,
      });
      nextMembers[matchIndex] = savedMember;
      updatedCount += 1;
    } else {
      const savedMember = await insertMember({
        ...importedMember,
        id: "",
        createdAt: importedMember.createdAt || new Date().toISOString(),
      });
      nextMembers.unshift(savedMember);
      createdCount += 1;
    }
  }

  return { members: nextMembers, createdCount, updatedCount };
}

function isSameMember(firstMember: Member, secondMember: Member) {
  const firstRotaryName = firstMember.rotaryName.trim().toLowerCase();
  const secondRotaryName = secondMember.rotaryName.trim().toLowerCase();
  const firstChineseName = firstMember.chineseName.trim().toLowerCase();
  const secondChineseName = secondMember.chineseName.trim().toLowerCase();

  return (
    firstChineseName !== "" &&
    secondChineseName !== "" &&
    firstRotaryName !== "" &&
    secondRotaryName !== "" &&
    firstChineseName === secondChineseName &&
    firstRotaryName === secondRotaryName
  );
}

function getMemberBirthdayMonth(member: Member) {
  const explicitMonth = Number(member.birthdayMonth);
  if (explicitMonth >= 1 && explicitMonth <= 12) {
    return explicitMonth;
  }

  return getDateMonth(member.birthday);
}

function getDateMonth(dateValue: string) {
  if (!dateValue) {
    return 0;
  }

  const month = Number(dateValue.split("-")[1]);
  return month >= 1 && month <= 12 ? month : 0;
}

function formatStatus(status: MemberStatus) {
  return status === "active" ? "現任" : "停用";
}

function escapeCsvValue(value: string) {
  const escapedValue = value.replaceAll('"', '""');
  return `"${escapedValue}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? `${fallback}：${error.message}` : fallback;
}

function getRawErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }

  return "未知錯誤";
}

function getImportedMemberItems(parsedJson: unknown) {
  if (Array.isArray(parsedJson)) {
    return parsedJson;
  }

  if (isRecord(parsedJson) && Array.isArray(parsedJson.members)) {
    return parsedJson.members;
  }

  return null;
}
