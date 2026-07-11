# 環境變數

不可在文件、GitHub、聊天訊息或 screenshot 中暴露真實值。

## 安全範例

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENAI_API_KEY=
```

## `NEXT_PUBLIC_SUPABASE_URL`

用途：Supabase 專案 URL。  
本機位置：`.env.local`。  
Vercel 位置：Project Settings → Environment Variables。  
是否可公開：是，前端 Supabase client 需要。  
遺失後如何重建：登入 Supabase Dashboard 查詢 Project URL。

## `NEXT_PUBLIC_SUPABASE_ANON_KEY`

用途：Supabase anon key。  
本機位置：`.env.local`。  
Vercel 位置：Project Settings → Environment Variables。  
是否可公開：可公開於前端，但仍不應隨意貼在文件中。  
遺失後如何重建：登入 Supabase Dashboard → API settings。

## `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

程式支援 fallback：`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? NEXT_PUBLIC_SUPABASE_ANON_KEY`。目前 `.env.example` 使用 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。

## `OPENAI_API_KEY`

用途：Jade AI server-side API route 呼叫 OpenAI。  
本機位置：`.env.local`。  
Vercel 位置：Project Settings → Environment Variables。  
是否可公開：不可公開，只能 server-side。  
重要規則：不可使用 `NEXT_PUBLIC_OPENAI_API_KEY`，不可放到前端。  
遺失或外洩後如何處理：到 OpenAI Platform 建立新 key、停用舊 key，更新本機與 Vercel。
