export type AppRole = "executive_secretary" | "president" | "member";

export type AppUserProfile = {
  userId: string;
  email: string;
  displayName: string;
  role: AppRole;
  memberId: string;
  isActive: boolean;
};

export const roleLabels: Record<AppRole, string> = {
  executive_secretary: "執行秘書",
  president: "社長",
  member: "一般社友",
};

export function canManageEvents(role: AppRole | undefined) {
  return role === "executive_secretary" || role === "president";
}

export function isExecutiveSecretary(role: AppRole | undefined) {
  return role === "executive_secretary";
}

