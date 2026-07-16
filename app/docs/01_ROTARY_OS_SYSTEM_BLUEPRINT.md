# Rotary OS 系統藍圖

## 正式名稱

Rotary OS  
高雄晨光扶輪社年度社務管理系統

開發品牌：Jadecode Studio  
AI 助理：Jade AI

## 系統定位

Rotary OS 是扶輪社年度秘書、會計、社務與活動管理平台。目標是讓社務資料雲端同步、可列印、可匯出，並讓 Jade AI 協助將自然語言活動文字整理成正式活動資料。

## 技術架構

- Framework：Next.js `16.2.10`
- Router：Next.js App Router
- Language：TypeScript
- UI：Tailwind CSS
- React：`19.2.4`
- Database：Supabase
- Deploy：Vercel
- AI：OpenAI Responses API through server route `/api/assistant/parse`
- Excel：`xlsx`
- PDF：`html2pdf.js`，目前主要用於程序表
- JPG：`html2canvas` dynamic import

## 前端架構

專案根目錄是 `E:\rotary-os\app`。正式 App Router 位於 `app/`。

主要路由：

| 路由 | 用途 |
|---|---|
| `/` | 首頁工作台 |
| `/about` | About 與版本資訊 |
| `/assistant` | Jade AI 助理、未繳社費查詢、每月社費批次作業 |
| `/events` | 活動新增與管理 |
| `/calendar` | 年度行事曆與年度管理 |
| `/programs` | 程序表管理、A4 預覽、列印與 PDF |
| `/members` | 社友管理 |
| `/dues` | 社費管理與個人 JPG 通知 |
| `/donations` | 年度捐獻計畫管理 |
| `/donate` | 公開社友捐獻登記頁 |
| `/accounting` | 會計收支、年度預算、月報、月結 |

API route：

| API | 用途 |
|---|---|
| `/api/assistant/parse` | Jade AI 活動文字解析，只在 server-side 使用 `OPENAI_API_KEY` |

## 後端架構

Rotary OS 沒有自建後端伺服器。資料存取由前端透過 Supabase client 直接操作公開資料表。Jade AI 使用 Next.js API route 代理 OpenAI 呼叫，避免 API key 暴露到瀏覽器。

Supabase client 位於 `src/lib/supabase.ts`。資料映射集中在 `lib/supabaseData.ts`，頁面也有少量直接查詢 Supabase 的程式，例如 donation 與 accounting。

## Supabase 架構

核心資料表包含：

- `rotary_years`
- `events`
- `members`
- `programs`
- `dues_records`
- `dues_line_items`
- `donation_plans`
- `donation_records`
- `accounting_categories`
- `accounting_entries`
- `accounting_accounts`
- `balance_sheet_items`
- `accounting_month_closes`
- `accounting_month_close_logs`

詳細結構見 `02_DATABASE_AND_MIGRATIONS.md`。

## Vercel 部署架構

GitHub repository 根目錄預期是 `E:\rotary-os`，Next.js 專案位於 `app/`。Vercel Root Directory 應設定為 `app`。

- Install Command：`npm install`
- Build Command：`npm run build`
- Output：Next.js 預設

## GitHub 版本管理架構

GitHub 是程式碼主要遠端版本庫。不要把 `.env.local`、API key、密碼或 token 推上 GitHub。`reference/` 目前出現在工作樹，是否納入 Git 需由 Jane 決定。

## Jade AI 架構

`/assistant` 提供貼上自然語言活動文字的介面。文字送到 `/api/assistant/parse`，API route 使用 `OPENAI_API_KEY` 呼叫 OpenAI。AI 只回傳結構化 JSON，使用者必須確認後才寫入 `events`。

## 資料流

活動：Jade AI 或手動表單 → 人工確認 → `events`。  
程序表：`events` → `programs` → A4 預覽/列印/PDF。  
社費：`members` + `dues_records` + `dues_line_items` → 未繳查詢、通知 JPG、總表。  
捐獻：`donation_plans` → `/donate` → `donation_records` → `/donations` 管理。  
會計：`accounting_entries` + `accounting_categories` → 月報、預算、資產負債、月結。

## 已完成功能

- 首頁工作台與品牌化
- 年度管理與年度行事曆
- 活動管理
- 程序表固定 A4 模板、列印、PDF
- 社友管理與 JSON 匯入
- 社費管理、line items、JPG 通知
- Jade AI 活動解析
- 未繳社費查詢與每月社費批次
- 年度捐獻計畫
- 會計收支、年度預算 Excel 匯入、月報、月結鎖定

## 尚待驗收功能

- 以真實 Supabase 資料驗證所有 migration 是否已執行
- 以手機 375px、390px、430px 完整驗收
- 年度預算 Excel 匯入後人工核對科目
- 會計資產負債表初始數字由會計人工確認

## 未來可擴充方向

- 登入與權限
- Supabase 備份自動化
- 會計資料匯出年度封存
- 多社複製模板
- Jade AI 擴充為會議記錄或公告草稿，但仍需人工確認

## Beta 1.0 年度交接架構

路由：`/year-transition`。版本來源：`lib/appVersion.ts`。

交接流程固定為：選擇來源與目標年度 → 選擇模組 → 只讀預覽 → 職務／衝突人工確認 → 二次確認 → 單一 Supabase RPC 交易 → 手動切換目前年度。

設定資料可由 `program_templates`、`program_template_blocks`、`event_types`、`accounting_categories`、`accounting_balance_categories`、`member_fee_rules`、`member_roles`、`accounting_accounts`、`accounting_checklist_templates` 與 `rotary_year_settings` 帶入。`rotary_year_transitions` 保存完成歷程，`accounting_year_opening_balances` 保存人工確認的期初歷屆累計餘絀。

交接 RPC 不讀寫 `events`、`programs`、`meeting_attendance`、`dues_records`、`dues_line_items`、`accounting_entries`、`accounting_balance_snapshots`、`accounting_balance_values` 或月結資料，因此不會把上一年度實際紀錄複製到新年度。
