import { supabase } from "@/src/lib/supabase";

export type ProgramTemplateBlock = {
  id: string;
  templateId: string;
  blockKey: string;
  title: string;
  content: string;
  startTime: string;
  sortOrder: number;
  isActive: boolean;
};

export type ProgramTemplate = {
  id: string;
  rotaryYearId: string;
  templateType: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  blocks: ProgramTemplateBlock[];
};

type Row = Record<string, unknown>;

export async function fetchProgramTemplates(rotaryYearId?: string): Promise<ProgramTemplate[]> {
  let query = supabase
    .from("program_templates")
    .select("*, program_template_blocks(*)")
    .order("sort_order", { ascending: true });
  if (rotaryYearId) query = query.eq("rotary_year_id", rotaryYearId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapTemplate);
}

export async function updateProgramTemplateBlock(block: ProgramTemplateBlock) {
  const { data, error } = await supabase
    .from("program_template_blocks")
    .update({
      title: block.title,
      content: block.content,
      start_time: block.startTime || null,
      sort_order: block.sortOrder,
      is_active: block.isActive,
    })
    .eq("id", block.id)
    .select()
    .single();
  if (error) throw error;
  return mapBlock(data as Row);
}

function mapTemplate(row: Row): ProgramTemplate {
  const rawBlocks = Array.isArray(row.program_template_blocks)
    ? (row.program_template_blocks as Row[])
    : [];
  return {
    id: text(row.id),
    rotaryYearId: text(row.rotary_year_id),
    templateType: text(row.template_type),
    name: text(row.name),
    description: text(row.description),
    sortOrder: number(row.sort_order),
    isActive: row.is_active !== false,
    blocks: rawBlocks.map(mapBlock).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

function mapBlock(row: Row): ProgramTemplateBlock {
  return {
    id: text(row.id),
    templateId: text(row.template_id),
    blockKey: text(row.block_key),
    title: text(row.title),
    content: text(row.content),
    startTime: text(row.start_time).slice(0, 5),
    sortOrder: number(row.sort_order),
    isActive: row.is_active !== false,
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
