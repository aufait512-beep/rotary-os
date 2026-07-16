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
  emptyMemberLeavePeriod,
  getMemberLeaveLabel,
  isMemberOnLeave,
  MemberLeavePeriod,
} from "@/lib/memberLeave";
import {
  emptyMemberRole,
  isRoleActiveOnDate,
  memberRoleLabel,
  memberRoleOptions,
  MemberRole,
} from "@/lib/memberFeeRules";
import { RotaryYear } from "@/lib/events";
import {
  deleteMember,
  fetchMemberLeavePeriods,
  fetchMembers,
  fetchMemberRoles,
  fetchRotaryYears,
  insertMember,
  upsertMemberLeavePeriod,
  upsertMemberRole,
  upsertMember,
} from "@/lib/supabaseData";

type MemberFormState = Omit<Member, "id" | "createdAt" | "note">;
type MemberField = keyof MemberFormState;
type LeaveFormState = Omit<MemberLeavePeriod, "id" | "memberId" | "createdAt" | "updatedAt">;
type LeaveFilter = "all" | "normal" | "on_leave";
type RoleFormState = Omit<MemberRole, "id" | "memberId" | "createdAt" | "updatedAt">;

const buttonShadow =
  "shadow-[6px_6px_12px_rgba(0,0,0,0.18),-4px_-4px_10px_rgba(255,255,255,0.85)] active:translate-y-1 active:shadow-inner";

const emptyMemberForm: MemberFormState = {
  chineseName: emptyMember.chineseName,
  englishName: emptyMember.englishName,
  rotaryName: emptyMember.rotaryName,
  title: emptyMember.title,
  rotaryTitle: emptyMember.rotaryTitle,
  birthdayMonth: emptyMember.birthdayMonth,
  phone: emptyMember.phone,
  mobile: emptyMember.mobile,
  email: emptyMember.email,
  spouse: emptyMember.spouse,
  joinDate: emptyMember.joinDate,
  birthday: emptyMember.birthday,
  anniversary: emptyMember.anniversary,
  classification: emptyMember.classification,
  organization: emptyMember.organization,
  workAddress: emptyMember.workAddress,
  homeAddress: emptyMember.homeAddress,
  fax: emptyMember.fax,
  littleRotary: emptyMember.littleRotary,
  riNo: emptyMember.riNo,
  status: emptyMember.status,
};

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
];

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [leavePeriods, setLeavePeriods] = useState<MemberLeavePeriod[]>([]);
  const [memberRoles, setMemberRoles] = useState<MemberRole[]>([]);
  const [years, setYears] = useState<RotaryYear[]>([]);
  const [form, setForm] = useState<MemberFormState>(emptyMemberForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [leaveFilter, setLeaveFilter] = useState<LeaveFilter>("all");
  const [expandedLeaveMemberId, setExpandedLeaveMemberId] = useState("");
  const [expandedRoleMemberId, setExpandedRoleMemberId] = useState("");
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
  const today = getTodayDate();
  const leaveStats = useMemo(() => {
    const onLeaveCount = members.filter(
      (member) => isMemberOnLeave(member.id, today, leavePeriods).isOnLeave
    ).length;
    return {
      total: members.length,
      onLeave: onLeaveCount,
      normal: members.length - onLeaveCount,
    };
  }, [leavePeriods, members, today]);
  const filteredMembers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const sortedMembers = sortMembersByName(members);

    if (!keyword) {
      return sortedMembers;
    }

    return sortedMembers.filter((member) => {
      const isOnLeave = isMemberOnLeave(member.id, today, leavePeriods).isOnLeave;
      if (leaveFilter === "normal" && isOnLeave) return false;
      if (leaveFilter === "on_leave" && !isOnLeave) return false;

      return [
        member.rotaryName,
        member.chineseName,
        member.englishName,
        member.classification,
        member.organization,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [leaveFilter, leavePeriods, members, searchTerm, today]);

  async function loadMembers() {
    try {
      setErrorMessage("");
      const [loadedMembers, loadedLeavePeriods, loadedRoles, loadedYears] = await Promise.all([
        fetchMembers(),
        fetchMemberLeavePeriods(),
        fetchMemberRoles(),
        fetchRotaryYears(),
      ]);
      setMembers(loadedMembers);
      setLeavePeriods(loadedLeavePeriods);
      setMemberRoles(loadedRoles);
      setYears(loadedYears);
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
    setForm(emptyMemberForm);
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

  function handleLeaveSaved(savedPeriod: MemberLeavePeriod) {
    setLeavePeriods((currentPeriods) => {
      const exists = currentPeriods.some((period) => period.id === savedPeriod.id);
      return exists
        ? currentPeriods.map((period) =>
            period.id === savedPeriod.id ? savedPeriod : period
          )
        : [savedPeriod, ...currentPeriods];
    });
  }

  function handleRoleSaved(savedRole: MemberRole) {
    setMemberRoles((currentRoles) => {
      const exists = currentRoles.some((role) => role.id === savedRole.id);
      return exists
        ? currentRoles.map((role) => (role.id === savedRole.id ? savedRole : role))
        : [savedRole, ...currentRoles];
    });
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

          <div className="grid grid-cols-3 gap-2 text-center text-sm font-bold">
            <StatTile label="社友總數" value={leaveStats.total} />
            <StatTile label="長假人數" value={leaveStats.onLeave} />
            <StatTile label="正常人數" value={leaveStats.normal} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["all", "全部"],
                ["normal", "正常"],
                ["on_leave", "請長假"],
              ] as [LeaveFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setLeaveFilter(value)}
                className={`rounded-2xl py-3 text-sm font-bold ${buttonShadow} ${
                  leaveFilter === value ? "bg-[#F7C948]" : "bg-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredMembers.length === 0 ? (
            <div className="rounded-3xl bg-white/75 p-5 text-center font-semibold text-[#173B73]/70 shadow-[6px_6px_16px_rgba(0,0,0,0.1),-6px_-6px_16px_rgba(255,255,255,0.8)]">
              目前沒有符合條件的社友。
            </div>
          ) : (
            filteredMembers.map((member) => {
              const leaveStatus = isMemberOnLeave(member.id, today, leavePeriods);
              const leaveLabel = getMemberLeaveLabel(member.id, today, leavePeriods);
              const isLeaveOpen = expandedLeaveMemberId === member.id;
              const isRoleOpen = expandedRoleMemberId === member.id;
              const currentRoles = memberRoles.filter(
                (role) => role.memberId === member.id && isRoleActiveOnDate(role, today)
              );

              return (
                <article
                  key={member.id}
                  className="rounded-3xl bg-white/85 p-5 shadow-[8px_8px_20px_rgba(0,0,0,0.12),-8px_-8px_20px_rgba(255,255,255,0.9)]"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedMember(member)}
                    className="block w-full text-left"
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
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className="rounded-full bg-[#173B73] px-3 py-1 text-xs font-bold text-white">
                          {formatStatus(member.status)}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-bold text-white ${
                            leaveStatus.isOnLeave ? "bg-[#F47C6C]" : "bg-[#173B73]/70"
                          }`}
                        >
                          {leaveLabel}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-semibold text-[#173B73]/80">
                      <p>行動電話：{member.mobile || "-"}</p>
                      <p>生日月份：{member.birthdayMonth || "-"}</p>
                    </div>
                    {currentRoles.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {currentRoles.map((role) => (
                          <span key={role.id} className="rounded-full bg-[#F7C948] px-3 py-1 text-xs font-bold">
                            {memberRoleLabel(role.roleType, role.roleName)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setExpandedRoleMemberId((currentId) => currentId === member.id ? "" : member.id)}
                      className={`rounded-2xl bg-[#F7C948] py-3 text-sm font-bold ${buttonShadow}`}
                    >
                      {isRoleOpen ? "收合社費身分／職務" : "社費身分／職務"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedLeaveMemberId((currentId) => currentId === member.id ? "" : member.id)}
                      className={`rounded-2xl bg-white py-3 text-sm font-bold ${buttonShadow}`}
                    >
                      {isLeaveOpen ? "收合長假管理" : "長假管理"}
                    </button>
                  </div>
                  {isRoleOpen ? (
                    <MemberRolePanel
                      member={member}
                      years={years}
                      roles={memberRoles.filter((role) => role.memberId === member.id)}
                      onSaved={handleRoleSaved}
                    />
                  ) : null}
                  {isLeaveOpen ? (
                    <MemberLeavePanel
                      member={member}
                      periods={leavePeriods.filter((period) => period.memberId === member.id)}
                      onSaved={handleLeaveSaved}
                    />
                  ) : null}
                </article>
              );
            })
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

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/80 p-3">
      <p className="text-xs text-[#173B73]/70">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}


function MemberRolePanel({ member, years, roles, onSaved }: {
  member: Member;
  years: RotaryYear[];
  roles: MemberRole[];
  onSaved: (role: MemberRole) => void;
}) {
  const defaultYear = years.find((year) => year.isActive) ?? years[0];
  const blankForm = (): RoleFormState => ({
    ...emptyMemberRole,
    rotaryYearId: defaultYear?.id ?? "",
    startDate: defaultYear?.startDate ?? getTodayDate(),
  });
  const [form, setForm] = useState<RoleFormState>(blankForm);
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function resetRoleForm() {
    setForm(blankForm());
    setEditingId("");
  }

  function editRole(role: MemberRole) {
    setEditingId(role.id);
    setForm({
      rotaryYearId: role.rotaryYearId,
      roleType: role.roleType,
      roleName: role.roleName,
      startDate: role.startDate,
      endDate: role.endDate,
      isActive: role.isActive,
    });
    setMessage("");
    setErrorMessage("");
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");
    if (!form.rotaryYearId || !form.startDate) {
      setErrorMessage("請選擇年度並填寫開始日期。");
      return;
    }
    if (form.endDate && form.endDate < form.startDate) {
      setErrorMessage("結束日期不可早於開始日期。");
      return;
    }
    const now = new Date().toISOString();
    try {
      const saved = await upsertMemberRole({
        ...form,
        id: editingId,
        memberId: member.id,
        roleName: form.roleName.trim(),
        createdAt: now,
        updatedAt: now,
      });
      onSaved(saved);
      setMessage(editingId ? "職務紀錄已更新。" : "職務紀錄已新增。");
      resetRoleForm();
    } catch (error) {
      setErrorMessage(`職務紀錄儲存失敗：${getRawErrorMessage(error)}`);
    }
  }

  async function updateRole(role: MemberRole, changes: Partial<MemberRole>, success: string) {
    setMessage("");
    setErrorMessage("");
    try {
      const saved = await upsertMemberRole({ ...role, ...changes, updatedAt: new Date().toISOString() });
      onSaved(saved);
      setMessage(success);
      if (editingId === role.id) resetRoleForm();
    } catch (error) {
      setErrorMessage(`職務紀錄更新失敗：${getRawErrorMessage(error)}`);
    }
  }

  return (
    <section className="mt-4 space-y-4 rounded-2xl border border-[#173B73]/15 bg-[#F8F3E8]/70 p-4">
      <div>
        <h4 className="font-bold">社友職務與資深身分</h4>
        <p className="mt-1 text-xs font-semibold text-[#173B73]/65">
          費率依計費月份 1 日仍有效的職務、資深身分及長假狀態判定。
        </p>
      </div>
      <form onSubmit={saveRole} className="space-y-3 rounded-2xl bg-white p-4">
        <label className="block">
          <span className="text-sm font-bold">扶輪年度</span>
          <select required value={form.rotaryYearId}
            onChange={(event) => setForm((current) => ({ ...current, rotaryYearId: event.target.value }))}
            className="mt-2 w-full rounded-xl border border-[#E5D9BD] bg-white px-3 py-3">
            <option value="">請選擇年度</option>
            {years.map((year) => <option key={year.id} value={year.id}>{year.displayName || year.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold">身分／職務</span>
          <select value={form.roleType}
            onChange={(event) => setForm((current) => ({ ...current, roleType: event.target.value as MemberRole["roleType"] }))}
            className="mt-2 w-full rounded-xl border border-[#E5D9BD] bg-white px-3 py-3">
            {memberRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-bold">職務名稱</span>
          <input value={form.roleName}
            onChange={(event) => setForm((current) => ({ ...current, roleName: event.target.value }))}
            placeholder="例如：理事、監事、出席主委"
            className="mt-2 w-full rounded-xl border border-[#E5D9BD] bg-white px-3 py-3" />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold">開始日期</span>
            <input required type="date" value={form.startDate}
              onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
              className="mt-2 w-full rounded-xl border border-[#E5D9BD] bg-white px-3 py-3" />
          </label>
          <label className="block">
            <span className="text-sm font-bold">結束日期</span>
            <input type="date" value={form.endDate}
              onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
              className="mt-2 w-full rounded-xl border border-[#E5D9BD] bg-white px-3 py-3" />
          </label>
        </div>
        <label className="flex items-center gap-3 text-sm font-bold">
          <input type="checkbox" checked={form.isActive}
            onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
            className="h-5 w-5" />
          啟用此職務紀錄
        </label>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className={`rounded-xl bg-[#F7C948] px-4 py-3 text-sm font-bold ${buttonShadow}`}>
            {editingId ? "儲存職務修改" : "新增職務紀錄"}
          </button>
          {editingId ? <button type="button" onClick={resetRoleForm}
            className={`rounded-xl bg-white px-4 py-3 text-sm font-bold ${buttonShadow}`}>取消編輯</button> : null}
        </div>
      </form>
      {message ? <p className="text-sm font-bold text-emerald-700">{message}</p> : null}
      {errorMessage ? <p className="text-sm font-bold text-red-700">{errorMessage}</p> : null}
      <div className="space-y-3">
        {roles.length === 0 ? <p className="rounded-xl bg-white p-3 text-sm">尚無職務歷程。</p> :
          [...roles].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((role) => {
            const year = years.find((item) => item.id === role.rotaryYearId);
            return (
              <article key={role.id} className="rounded-xl bg-white p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{memberRoleLabel(role.roleType, role.roleName)}</p>
                    <p className="mt-1 text-[#173B73]/70">
                      {year?.displayName || year?.name || "未指定年度"} · {role.startDate}
                      {role.endDate ? ` 至 ${role.endDate}` : " 起"}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold text-white ${role.isActive ? "bg-[#173B73]" : "bg-gray-500"}`}>
                    {role.isActive ? "啟用" : "已停用"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => editRole(role)}
                    className={`rounded-xl bg-[#F7C948] px-3 py-2 text-xs font-bold ${buttonShadow}`}>編輯</button>
                  {role.isActive ? <>
                    <button type="button" onClick={() => updateRole(role, { endDate: getTodayDate() }, "職務結束日期已更新。")}
                      className={`rounded-xl bg-white px-3 py-2 text-xs font-bold ${buttonShadow}`}>今日結束</button>
                    <button type="button" onClick={() => updateRole(role, { isActive: false }, "錯誤職務紀錄已停用。")}
                      className={`rounded-xl bg-white px-3 py-2 text-xs font-bold text-red-700 ${buttonShadow}`}>停用錯誤紀錄</button>
                  </> : <button type="button" onClick={() => updateRole(role, { isActive: true }, "職務紀錄已重新啟用。")}
                    className={`rounded-xl bg-white px-3 py-2 text-xs font-bold ${buttonShadow}`}>重新啟用</button>}
                </div>
              </article>
            );
          })}
      </div>
    </section>
  );
}

function MemberLeavePanel({
  member,
  periods,
  onSaved,
}: {
  member: Member;
  periods: MemberLeavePeriod[];
  onSaved: (period: MemberLeavePeriod) => void;
}) {
  const [form, setForm] = useState<LeaveFormState>(emptyMemberLeavePeriod);
  const [editingId, setEditingId] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const sortedPeriods = [...periods].sort((firstPeriod, secondPeriod) =>
    secondPeriod.startDate.localeCompare(firstPeriod.startDate)
  );
  const currentLeave = isMemberOnLeave(member.id, getTodayDate(), periods).leavePeriod;

  function resetLeaveForm() {
    setForm(emptyMemberLeavePeriod);
    setEditingId("");
  }

  function editPeriod(period: MemberLeavePeriod) {
    setEditingId(period.id);
    setForm({
      startDate: period.startDate,
      endDate: period.endDate,
      reason: period.reason,
      annualFeeAmount: period.annualFeeAmount,
      isActive: period.isActive,
      note: period.note,
    });
  }

  async function saveLeavePeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setMessage("");

    if (form.endDate && form.endDate < form.startDate) {
      setErrorMessage("結束日期不可早於開始日期。");
      return;
    }

    try {
      const currentPeriod = periods.find((period) => period.id === editingId);
      const savedPeriod = await upsertMemberLeavePeriod({
        ...form,
        id: editingId,
        memberId: member.id,
        createdAt: currentPeriod?.createdAt ?? new Date().toISOString(),
        updatedAt: currentPeriod?.updatedAt ?? new Date().toISOString(),
      });
      onSaved(savedPeriod);
      setMessage(editingId ? "長假紀錄已更新。" : "已新增長假紀錄。");
      resetLeaveForm();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "長假紀錄儲存失敗"));
    }
  }

  async function patchPeriod(period: MemberLeavePeriod, patch: Partial<MemberLeavePeriod>) {
    try {
      setErrorMessage("");
      setMessage("");
      const savedPeriod = await upsertMemberLeavePeriod({
        ...period,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      onSaved(savedPeriod);
      setMessage("長假紀錄已更新。");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "長假紀錄更新失敗"));
    }
  }

  return (
    <section className="mt-4 space-y-4 rounded-3xl bg-[#F8F3E8] p-4">
      {currentLeave ? (
        <div className="rounded-2xl bg-white p-4 text-sm font-bold">
          <div className="mb-2 inline-flex rounded-full bg-[#F47C6C] px-3 py-1 text-xs text-white">
            請長假
          </div>
          <p>開始日期：{currentLeave.startDate}</p>
          <p>結束日期：{currentLeave.endDate || "未定"}</p>
          <p>原因：{currentLeave.reason || "-"}</p>
          <p>常年費：{formatCurrency(currentLeave.annualFeeAmount || 1000)}</p>
          <p>備註：{currentLeave.note || "-"}</p>
        </div>
      ) : null}

      {message ? (
        <p className="rounded-2xl border border-green-200 bg-green-50 p-3 text-sm font-bold text-green-700">
          {message}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <form onSubmit={saveLeavePeriod} className="space-y-3">
        <h4 className="font-bold">{editingId ? "編輯長假" : "新增長假"}</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold">開始日期</span>
            <input
              required
              type="date"
              value={form.startDate}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  startDate: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-3 py-3"
            />
          </label>
          <label className="block">
            <span className="text-sm font-bold">結束日期</span>
            <input
              type="date"
              value={form.endDate}
              onChange={(event) =>
                setForm((currentForm) => ({
                  ...currentForm,
                  endDate: event.target.value,
                }))
              }
              className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-3 py-3"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-bold">原因</span>
          <input
            value={form.reason}
            onChange={(event) =>
              setForm((currentForm) => ({ ...currentForm, reason: event.target.value }))
            }
            className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-3 py-3"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold">常年費</span>
          <input
            type="number"
            min={0}
            value={form.annualFeeAmount}
            onChange={(event) =>
              setForm((currentForm) => ({
                ...currentForm,
                annualFeeAmount: Number(event.target.value) || 0,
              }))
            }
            className="mt-2 w-full rounded-2xl border border-[#E5D9BD] bg-white px-3 py-3"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold">備註</span>
          <textarea
            rows={2}
            value={form.note}
            onChange={(event) =>
              setForm((currentForm) => ({ ...currentForm, note: event.target.value }))
            }
            className="mt-2 w-full resize-none rounded-2xl border border-[#E5D9BD] bg-white px-3 py-3"
          />
        </label>
        <label className="flex items-center gap-3 rounded-2xl bg-white p-3 font-bold">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) =>
              setForm((currentForm) => ({
                ...currentForm,
                isActive: event.target.checked,
              }))
            }
            className="h-5 w-5"
          />
          啟用此長假紀錄
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="submit"
            className={`rounded-2xl bg-[#F7C948] py-3 font-bold ${buttonShadow}`}
          >
            {editingId ? "儲存長假" : "新增長假"}
          </button>
          <button
            type="button"
            onClick={resetLeaveForm}
            className={`rounded-2xl bg-white py-3 font-bold ${buttonShadow}`}
          >
            取消
          </button>
        </div>
      </form>

      <div className="space-y-3">
        <h4 className="font-bold">長假歷史</h4>
        {sortedPeriods.length === 0 ? (
          <p className="rounded-2xl bg-white p-3 text-sm font-bold text-[#173B73]/70">
            尚未建立長假紀錄。
          </p>
        ) : (
          sortedPeriods.map((period) => (
            <article key={period.id} className="rounded-2xl bg-white p-3 text-sm font-bold">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {period.startDate} - {period.endDate || "未定"}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs text-white ${
                    period.isActive ? "bg-[#173B73]" : "bg-gray-400"
                  }`}
                >
                  {period.isActive ? "啟用" : "停用"}
                </span>
              </div>
              <p className="mt-2">原因：{period.reason || "-"}</p>
              <p>常年費：{formatCurrency(period.annualFeeAmount || 1000)}</p>
              <p>備註：{period.note || "-"}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <SmallButton onClick={() => editPeriod(period)}>編輯</SmallButton>
                <SmallButton onClick={() => editPeriod(period)}>延長長假</SmallButton>
                <SmallButton
                  onClick={() =>
                    void patchPeriod(period, {
                      endDate: getTodayDate(),
                      isActive: true,
                    })
                  }
                >
                  提前結束
                </SmallButton>
                <SmallButton
                  onClick={() => void patchPeriod(period, { isActive: false })}
                >
                  停用錯誤紀錄
                </SmallButton>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function SmallButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl bg-white px-3 py-2 text-sm font-bold ${buttonShadow}`}
    >
      {children}
    </button>
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function getTodayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
