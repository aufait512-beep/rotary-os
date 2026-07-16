import { MemberLeavePeriod, isMemberOnLeave } from "@/lib/memberLeave";

export type MemberRoleType =
  | "president"
  | "secretary"
  | "president_elect"
  | "board_member"
  | "committee_member"
  | "senior_member"
  | "other";

export type MemberRole = {
  id: string;
  memberId: string;
  rotaryYearId: string;
  roleType: MemberRoleType;
  roleName: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FeeType = "annual_fee" | "special_donation";
export type FeeConditionType = "general" | "senior" | "long_leave" | "role";

export type MemberFeeRule = {
  id: string;
  rotaryYearId: string;
  feeType: FeeType;
  conditionType: FeeConditionType;
  conditionValue: string;
  amount: number;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AppliedFeeRule = {
  amount: number;
  source: string;
  rule?: MemberFeeRule;
};

export type MemberFeeAssessment = {
  identity: string;
  identityKey: string;
  annualFee: AppliedFeeRule;
  specialDonation: AppliedFeeRule;
  isOnLeave: boolean;
  isSenior: boolean;
  activeRoles: MemberRole[];
  leavePeriod?: MemberLeavePeriod;
};

export const memberRoleOptions: Array<{ value: MemberRoleType; label: string }> = [
  { value: "president", label: "社長" },
  { value: "secretary", label: "秘書" },
  { value: "president_elect", label: "社長當選人" },
  { value: "board_member", label: "理監事" },
  { value: "committee_member", label: "委員" },
  { value: "senior_member", label: "資深社友" },
  { value: "other", label: "其他" },
];

export const emptyMemberRole: Omit<MemberRole, "id" | "memberId" | "createdAt" | "updatedAt"> = {
  rotaryYearId: "",
  roleType: "other",
  roleName: "",
  startDate: "",
  endDate: "",
  isActive: true,
};

export function assessMemberFees({
  memberId,
  rotaryYearId,
  periodMonth,
  roles,
  rules,
  leavePeriods,
}: {
  memberId: string;
  rotaryYearId: string;
  periodMonth: string;
  roles: MemberRole[];
  rules: MemberFeeRule[];
  leavePeriods: MemberLeavePeriod[];
}): MemberFeeAssessment {
  const targetDate = `${periodMonth}-01`;
  const leaveStatus = isMemberOnLeave(memberId, targetDate, leavePeriods);
  const activeRoles = roles.filter(
    (role) =>
      role.memberId === memberId &&
      role.rotaryYearId === rotaryYearId &&
      role.isActive &&
      role.startDate <= targetDate &&
      (!role.endDate || role.endDate >= targetDate)
  );
  const isSenior = activeRoles.some((role) => role.roleType === "senior_member");
  const identityKey = resolveIdentityKey(leaveStatus.isOnLeave, isSenior, activeRoles);

  return {
    identity: identityLabel(identityKey),
    identityKey,
    annualFee: resolveFeeRule("annual_fee", identityKey, activeRoles, rules, rotaryYearId),
    specialDonation: resolveFeeRule("special_donation", identityKey, activeRoles, rules, rotaryYearId),
    isOnLeave: leaveStatus.isOnLeave,
    isSenior,
    activeRoles,
    leavePeriod: leaveStatus.leavePeriod,
  };
}

export function isRoleActiveOnDate(role: MemberRole, targetDate: string) {
  return role.isActive && role.startDate <= targetDate && (!role.endDate || role.endDate >= targetDate);
}

export function memberRoleLabel(roleType: MemberRoleType, roleName = "") {
  if (["board_member", "committee_member", "other"].includes(roleType) && roleName.trim()) {
    return roleName.trim();
  }
  return (memberRoleOptions.find((option) => option.value === roleType)?.label ?? roleName) || "其他";
}

export function feeTypeLabel(feeType: FeeType) {
  return feeType === "annual_fee" ? "常年費" : "特別捐";
}

export function feeConditionLabel(rule: Pick<MemberFeeRule, "conditionType" | "conditionValue">) {
  if (rule.conditionType === "long_leave") return "長假社友";
  if (rule.conditionType === "senior") return "資深社友";
  if (rule.conditionType === "general") return "一般社友";
  return memberRoleLabel(rule.conditionValue as MemberRoleType);
}

function resolveIdentityKey(isOnLeave: boolean, isSenior: boolean, roles: MemberRole[]) {
  if (isOnLeave) return "long_leave";
  if (isSenior) return "senior";
  const orderedRoles: MemberRoleType[] = [
    "president",
    "secretary",
    "president_elect",
    "board_member",
    "committee_member",
  ];
  return orderedRoles.find((roleType) => roles.some((role) => role.roleType === roleType)) ?? "general";
}

function resolveFeeRule(
  feeType: FeeType,
  identityKey: string,
  activeRoles: MemberRole[],
  rules: MemberFeeRule[],
  rotaryYearId: string
): AppliedFeeRule {
  const activeRules = rules
    .filter((rule) => rule.rotaryYearId === rotaryYearId && rule.feeType === feeType && rule.isActive)
    .filter((rule) => ruleMatches(rule, identityKey, activeRoles))
    .sort((first, second) => first.priority - second.priority);
  const rule = activeRules[0];
  return rule
    ? { amount: rule.amount, source: `${feeConditionLabel(rule)}費率`, rule }
    : { amount: 0, source: "尚未設定費率" };
}

function ruleMatches(rule: MemberFeeRule, identityKey: string, activeRoles: MemberRole[]) {
  if (rule.conditionType === "general") return true;
  if (rule.conditionType === "long_leave") return identityKey === "long_leave";
  if (rule.conditionType === "senior") return identityKey === "senior";
  if (rule.conditionType === "role") {
    if (identityKey === "long_leave" || identityKey === "senior") return false;
    return activeRoles.some((role) => role.roleType === rule.conditionValue);
  }
  return false;
}

function identityLabel(identityKey: string) {
  if (identityKey === "long_leave") return "長假社友";
  if (identityKey === "senior") return "資深社友";
  if (identityKey === "general") return "一般社友";
  return memberRoleLabel(identityKey as MemberRoleType);
}
