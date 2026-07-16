import { memberRoleLabel, MemberRoleType } from "@/lib/memberFeeRules";
import { supabase } from "@/src/lib/supabase";

export type TransitionModuleKey =
  | "program_templates"
  | "program_blocks"
  | "event_types"
  | "accounting_income"
  | "accounting_expense"
  | "balance_categories"
  | "fee_rules"
  | "budget_structure"
  | "member_roles"
  | "senior_roles"
  | "accounting_accounts"
  | "checklist_templates"
  | "report_settings"
  | "brand_settings"
  | "language_settings";

export const transitionModuleOptions: Array<{
  key: TransitionModuleKey;
  label: string;
}> = [
  { key: "program_templates", label: "程序表模板" },
  { key: "program_blocks", label: "程序區塊" },
  { key: "event_types", label: "活動類型" },
  { key: "accounting_income", label: "會計收入科目" },
  { key: "accounting_expense", label: "會計支出科目" },
  { key: "balance_categories", label: "資產負債基本科目" },
  { key: "fee_rules", label: "社費費率規則" },
  { key: "budget_structure", label: "年度預算架構" },
  { key: "member_roles", label: "社友年度職務" },
  { key: "senior_roles", label: "社友資深身分" },
  { key: "accounting_accounts", label: "固定會計帳戶" },
  { key: "checklist_templates", label: "月底檢查清單" },
  { key: "report_settings", label: "報表設定" },
  { key: "brand_settings", label: "社徽與品牌設定" },
  { key: "language_settings", label: "語言設定" },
];

export type TransitionSelections = Record<TransitionModuleKey, boolean>;

export const defaultTransitionSelections = Object.fromEntries(
  transitionModuleOptions.map((option) => [option.key, true])
) as TransitionSelections;

export type TransitionTargetDraft = {
  name: string;
  displayName: string;
  startDate: string;
  endDate: string;
};

export type TransitionRoleMapping = {
  sourceRoleId: string;
  memberId: string;
  memberName: string;
  sourceRoleType: MemberRoleType;
  sourceRoleLabel: string;
  targetRoleType: MemberRoleType | "";
  targetRoleName: string;
  include: boolean;
  startDate: string;
  endDate: string;
};

export type TransitionFeeRule = {
  id: string;
  feeType: string;
  conditionType: string;
  conditionValue: string;
  amount: number;
  priority: number;
  isActive: boolean;
  targetExists: boolean;
  targetAmount: number | null;
};

export type TransitionPreview = {
  counts: Record<TransitionModuleKey | "program_block_count", number>;
  targetCounts: Record<TransitionModuleKey | "program_block_count", number>;
  roleMappings: TransitionRoleMapping[];
  feeRules: TransitionFeeRule[];
  retainedSurplus: number | null;
  targetHasData: boolean;
};

export type TransitionExecutionInput = {
  sourceYearId: string;
  targetYearId: string | null;
  targetYear: TransitionTargetDraft | null;
  selections: TransitionSelections;
  roleMappings: TransitionRoleMapping[];
  budgetMode: "structure_only" | "with_amounts";
  feeConflictMode: "skip" | "insert_missing" | "update_selected";
  feeRuleUpdateIds: string[];
  carryForwardAmount: number | null;
  note: string;
};

type Row = Record<string, unknown>;

export async function fetchYearTransitionPreview(
  sourceYearId: string,
  targetYearId: string | null,
  targetStartDate: string,
  targetEndDate: string
): Promise<TransitionPreview> {
  try {
    const [source, target] = await Promise.all([
      fetchYearModuleData(sourceYearId),
      targetYearId ? fetchYearModuleData(targetYearId) : emptyYearModuleData(),
    ]);

    const sourceTemplateIds = source.programTemplates.map((row) => text(row.id));
    const targetTemplateIds = target.programTemplates.map((row) => text(row.id));
    const [sourceBlocks, targetBlocks, retainedSurplus] = await Promise.all([
      fetchProgramBlocks(sourceTemplateIds),
      fetchProgramBlocks(targetTemplateIds),
      fetchRetainedSurplus(sourceYearId),
    ]);

    const targetFeeMap = new Map(
      target.feeRules.map((row) => [feeRuleKey(row), row])
    );
    const feeRules = source.feeRules.map((row): TransitionFeeRule => {
      const targetRow = targetFeeMap.get(feeRuleKey(row));
      return {
        id: text(row.id),
        feeType: text(row.fee_type),
        conditionType: text(row.condition_type),
        conditionValue: text(row.condition_value),
        amount: number(row.amount),
        priority: number(row.priority),
        isActive: row.is_active !== false,
        targetExists: Boolean(targetRow),
        targetAmount: targetRow ? number(targetRow.amount) : null,
      };
    });

    const roleMappings = source.roles.map((row): TransitionRoleMapping => {
      const sourceRoleType = text(row.role_type) as MemberRoleType;
      const suggestion = suggestTargetRole(sourceRoleType);
      return {
        sourceRoleId: text(row.id),
        memberId: text(row.member_id),
        memberName: joinedMemberName(row.members),
        sourceRoleType,
        sourceRoleLabel: memberRoleLabel(sourceRoleType, text(row.role_name)),
        targetRoleType: suggestion,
        targetRoleName: suggestion === "other" ? text(row.role_name) : "",
        include: sourceRoleType === "president_elect" || sourceRoleType === "senior_member",
        startDate: targetStartDate,
        endDate: targetEndDate,
      };
    });

    const counts = buildCounts(source, sourceBlocks.length);
    const targetCounts = buildCounts(target, targetBlocks.length);

    return {
      counts,
      targetCounts,
      roleMappings,
      feeRules,
      retainedSurplus,
      targetHasData: Object.values(targetCounts).some((count) => count > 0),
    };
  } catch (error) {
    throw new Error(
      `年度交接預覽讀取失敗：${errorMessage(error)}。請確認已執行 20260717_rotary_year_transition.sql。`
    );
  }
}

export async function executeYearTransition(input: TransitionExecutionInput) {
  const selectedModules: Record<string, unknown> = {
    ...input.selections,
    fee_rule_update_ids: input.feeRuleUpdateIds,
  };
  const roleMappings = input.roleMappings.map((mapping) => ({
    source_role_id: mapping.sourceRoleId,
    member_id: mapping.memberId,
    role_type: mapping.targetRoleType,
    role_name: mapping.targetRoleName,
    include: mapping.include && Boolean(mapping.targetRoleType),
    start_date: mapping.startDate,
    end_date: mapping.endDate,
  }));

  const { data, error } = await supabase.rpc("execute_rotary_year_transition", {
    p_source_year_id: input.sourceYearId,
    p_target_year_id: input.targetYearId,
    p_target_year: input.targetYear
      ? {
          name: input.targetYear.name,
          display_name: input.targetYear.displayName,
          start_date: input.targetYear.startDate,
          end_date: input.targetYear.endDate,
        }
      : null,
    p_selected_modules: selectedModules,
    p_role_mappings: roleMappings,
    p_budget_mode: input.budgetMode,
    p_fee_conflict_mode: input.feeConflictMode,
    p_carry_forward_amount: input.carryForwardAmount,
    p_note: input.note || null,
  });
  if (error) throw error;
  return data as {
    transition_id: string;
    target_year_id: string;
    status: string;
    summary: Record<string, unknown>;
  };
}

export async function fetchYearTransitionHistory() {
  const { data, error } = await supabase
    .from("rotary_year_transitions")
    .select("*, source:rotary_years!source_year_id(display_name,name), target:rotary_years!target_year_id(display_name,name)")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as Row[];
}

async function fetchYearModuleData(yearId: string) {
  const queries = await Promise.all([
    supabase.from("program_templates").select("*").eq("rotary_year_id", yearId),
    supabase.from("event_types").select("*").eq("rotary_year_id", yearId),
    supabase.from("accounting_categories").select("*").eq("rotary_year_id", yearId),
    supabase.from("accounting_balance_categories").select("*").eq("rotary_year_id", yearId),
    supabase.from("member_fee_rules").select("*").eq("rotary_year_id", yearId),
    supabase
      .from("member_roles")
      .select("*, members(chinese_name,rotary_name)")
      .eq("rotary_year_id", yearId),
    supabase.from("accounting_accounts").select("*").eq("rotary_year_id", yearId),
    supabase.from("accounting_checklist_templates").select("*").eq("rotary_year_id", yearId),
    supabase.from("rotary_year_settings").select("*").eq("rotary_year_id", yearId),
  ]);
  const failed = queries.find((result) => result.error);
  if (failed?.error) throw failed.error;

  return {
    programTemplates: (queries[0].data ?? []) as Row[],
    eventTypes: (queries[1].data ?? []) as Row[],
    accountingCategories: (queries[2].data ?? []) as Row[],
    balanceCategories: (queries[3].data ?? []) as Row[],
    feeRules: (queries[4].data ?? []) as Row[],
    roles: (queries[5].data ?? []) as Row[],
    accounts: (queries[6].data ?? []) as Row[],
    checklistTemplates: (queries[7].data ?? []) as Row[],
    settings: (queries[8].data ?? []) as Row[],
  };
}

function emptyYearModuleData() {
  return Promise.resolve({
    programTemplates: [] as Row[],
    eventTypes: [] as Row[],
    accountingCategories: [] as Row[],
    balanceCategories: [] as Row[],
    feeRules: [] as Row[],
    roles: [] as Row[],
    accounts: [] as Row[],
    checklistTemplates: [] as Row[],
    settings: [] as Row[],
  });
}

async function fetchProgramBlocks(templateIds: string[]) {
  if (templateIds.length === 0) return [] as Row[];
  const { data, error } = await supabase
    .from("program_template_blocks")
    .select("*")
    .in("template_id", templateIds);
  if (error) throw error;
  return (data ?? []) as Row[];
}

async function fetchRetainedSurplus(yearId: string) {
  const { data: snapshot, error: snapshotError } = await supabase
    .from("accounting_balance_snapshots")
    .select("id")
    .eq("rotary_year_id", yearId)
    .order("report_month", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (snapshotError) throw snapshotError;
  if (!snapshot) return null;

  const { data, error } = await supabase
    .from("accounting_balance_values")
    .select("amount, accounting_balance_categories(name)")
    .eq("snapshot_id", snapshot.id);
  if (error) throw error;

  return (data ?? []).reduce((total, row) => {
    const category = row.accounting_balance_categories as
      | { name?: string }
      | Array<{ name?: string }>
      | null;
    const name = Array.isArray(category) ? category[0]?.name : category?.name;
    return name === "歷屆累計餘絀" || name === "本年度累積結餘"
      ? total + number(row.amount)
      : total;
  }, 0);
}

function buildCounts(
  data: Awaited<ReturnType<typeof fetchYearModuleData>>,
  blockCount: number
) {
  return {
    program_templates: data.programTemplates.length,
    program_blocks: blockCount,
    program_block_count: blockCount,
    event_types: data.eventTypes.length,
    accounting_income: data.accountingCategories.filter(
      (row) => row.entry_type === "income"
    ).length,
    accounting_expense: data.accountingCategories.filter(
      (row) => row.entry_type === "expense"
    ).length,
    balance_categories: data.balanceCategories.length,
    fee_rules: data.feeRules.length,
    budget_structure: data.accountingCategories.length,
    member_roles: data.roles.filter((row) => row.role_type !== "senior_member").length,
    senior_roles: data.roles.filter((row) => row.role_type === "senior_member").length,
    accounting_accounts: data.accounts.length,
    checklist_templates: data.checklistTemplates.length,
    report_settings: data.settings.filter((row) => text(row.setting_key).startsWith("report.")).length,
    brand_settings: data.settings.filter((row) => text(row.setting_key).startsWith("brand.")).length,
    language_settings: data.settings.filter((row) => text(row.setting_key).startsWith("language.")).length,
  };
}

function suggestTargetRole(roleType: MemberRoleType): MemberRoleType | "" {
  if (roleType === "president_elect") return "president";
  if (roleType === "senior_member") return "senior_member";
  return "";
}

function feeRuleKey(row: Row) {
  return [row.fee_type, row.condition_type, row.condition_value].join("|");
}

function joinedMemberName(value: unknown) {
  const member = Array.isArray(value) ? value[0] : value;
  if (!member || typeof member !== "object") return "未命名社友";
  const row = member as Row;
  return [text(row.chinese_name), text(row.rotary_name)].filter(Boolean).join(" ") || "未命名社友";
}

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
