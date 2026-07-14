export type MemberLeavePeriod = {
  id: string;
  memberId: string;
  startDate: string;
  endDate: string;
  reason: string;
  annualFeeAmount: number;
  isActive: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type MemberLeaveStatus = {
  isOnLeave: boolean;
  leavePeriod?: MemberLeavePeriod;
  annualFeeAmount: number;
};

export const emptyMemberLeavePeriod: Omit<
  MemberLeavePeriod,
  "id" | "memberId" | "createdAt" | "updatedAt"
> = {
  startDate: "",
  endDate: "",
  reason: "",
  annualFeeAmount: 1000,
  isActive: true,
  note: "",
};

export function isMemberOnLeave(
  memberId: string,
  targetDate: string,
  leavePeriods: MemberLeavePeriod[]
): MemberLeaveStatus {
  const leavePeriod = leavePeriods.find((period) => {
    if (period.memberId !== memberId || !period.isActive || !period.startDate) {
      return false;
    }

    return (
      targetDate >= period.startDate &&
      (!period.endDate || targetDate <= period.endDate)
    );
  });

  return {
    isOnLeave: Boolean(leavePeriod),
    leavePeriod,
    annualFeeAmount: leavePeriod?.annualFeeAmount ?? 0,
  };
}

export function isMemberOnLeaveDuringMonth(
  memberId: string,
  periodMonth: string,
  leavePeriods: MemberLeavePeriod[]
): MemberLeaveStatus {
  const monthStart = `${periodMonth}-01`;
  const monthEnd = getMonthEndDate(periodMonth);
  const leavePeriod = leavePeriods.find((period) => {
    if (period.memberId !== memberId || !period.isActive || !period.startDate) {
      return false;
    }

    return period.startDate <= monthEnd && (!period.endDate || period.endDate >= monthStart);
  });

  return {
    isOnLeave: Boolean(leavePeriod),
    leavePeriod,
    annualFeeAmount: leavePeriod?.annualFeeAmount ?? 0,
  };
}

export function getMemberLeaveLabel(
  memberId: string,
  targetDate: string,
  leavePeriods: MemberLeavePeriod[]
) {
  if (isMemberOnLeave(memberId, targetDate, leavePeriods).isOnLeave) {
    return "請長假";
  }

  const hasHistory = leavePeriods.some((period) => period.memberId === memberId);
  return hasHistory ? "長假已結束" : "正常";
}

export function sortMembersByLeaveStatus<T extends { id: string }>(
  members: T[],
  targetDate: string,
  leavePeriods: MemberLeavePeriod[]
) {
  return [...members].sort((firstMember, secondMember) => {
    const firstOnLeave = isMemberOnLeave(
      firstMember.id,
      targetDate,
      leavePeriods
    ).isOnLeave;
    const secondOnLeave = isMemberOnLeave(
      secondMember.id,
      targetDate,
      leavePeriods
    ).isOnLeave;

    return Number(firstOnLeave) - Number(secondOnLeave);
  });
}

function getMonthEndDate(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  if (!year || !month) return periodMonth;
  const date = new Date(year, month, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
