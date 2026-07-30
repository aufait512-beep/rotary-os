import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://vmwjmtrugqlhyecovysl.supabase.co";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_cZAZwCZXU9eXTGCdP6SJIA_ipsTnfL_";

export const supabase = createClient(supabaseUrl, supabaseKey);

