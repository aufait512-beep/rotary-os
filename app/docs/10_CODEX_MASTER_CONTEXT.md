# Codex Master Context

本文件供未來新的 Codex 對話使用。開始任何 Rotary OS 工作前，請先完整閱讀本文件。

## Jane 的系統目標

Rotary OS 要成為高雄晨光扶輪社可長期維護的年度社務管理系統，也可由 Jadecode Studio 複製成其他組織管理系統。

## 系統定位

Rotary OS：高雄晨光扶輪社年度社務管理系統。  
開發品牌：Jadecode Studio。  
AI 助理：Jade AI。

## 技術架構

- Next.js App Router `16.2.10`
- React `19.2.4`
- TypeScript
- Tailwind CSS
- Supabase
- Vercel
- OpenAI server-side API route
- `xlsx`, `html2pdf.js`, `html2canvas`

## 專案路徑

本機專案路徑：`E:\rotary-os\app`。  
Repository 根層：`E:\rotary-os`。  
Vercel Root Directory：`app`。

## 路由

`/`, `/about`, `/assistant`, `/calendar`, `/events`, `/programs`, `/members`, `/dues`, `/donations`, `/donate`, `/accounting`。

API：`/api/assistant/parse`。

## 重要資料表

`rotary_years`, `events`, `members`, `programs`, `dues_records`, `dues_line_items`, `donation_plans`, `donation_records`, `accounting_categories`, `accounting_entries`, `accounting_accounts`, `balance_sheet_items`, `accounting_month_closes`, `accounting_month_close_logs`。

## 商業規則

- 不刪除既有資料
- 不重建已有資料表
- migration 必須安全、可重跑
- 新增功能不可破壞手機版
- AI 寫入資料前必須人工確認

## 年度規則

年度由 `rotary_years` 管理。未來年度由使用者在 `/calendar` 新增，不由前端自動補建。

## 活動規則

活動存在 `events`。預設時間為 18:30、19:15、20:10。Jade AI 可解析活動，但需人工確認。

## 社費規則

社費主檔 `dues_records`，明細 `dues_line_items`。尚欠金額為 `previous_balance + current_due - paid_amount`，畫面顯示不低於 0。

## 會計規則

每月實際金額只來自 `accounting_entries`。年度預算在 `accounting_categories`，可人工或 Excel 匯入。月結鎖定後不可直接修改或刪除該月交易。

## Jade AI 規則

`OPENAI_API_KEY` 只可 server-side。不得用 `NEXT_PUBLIC_OPENAI_API_KEY`。Jade AI 不串接 LINE、不自動建立活動。

## 匯出規則

程序表可 PDF/列印。社費通知 JPG。會計月報 JPG/CSV/列印。匯出不得包含管理按鈕與網站背景。

## 手機版規則

375px、390px、430px 必須驗證。表格可局部橫向捲動，但整頁不可破版。

## 安全規則

不把 Secret 寫入 Git。`.env.local` 不 commit。文件不得包含 API key、密碼、token 或 Supabase 私密金鑰。

## Git 規則

不要自行 commit，除非 Jane 明確要求。修改前先讀相關程式。完成後回報修改與驗證。

## 每次修改後驗證

- `npm run lint`
- `npm run build`
- 回報修改檔案
- 回報新增檔案
- 回報 migration
- 回報是否需執行 Supabase SQL
- 回報是否需新增 Vercel 環境變數

## 禁止事項

- 不可因方便而刪除歷史資料
- 不可重建正式資料表
- 不可執行未確認 migration
- 不可把 Secret 寫入文件或 Git
- 不可讓 AI 直接寫入資料

## 新 Codex 開場指令

請先完整閱讀 docs/10_CODEX_MASTER_CONTEXT.md、docs/01_ROTARY_OS_SYSTEM_BLUEPRINT.md、docs/02_DATABASE_AND_MIGRATIONS.md，再掃描目前專案與 git status。先回報你理解的目前架構、未提交變更、資料安全風險及本次修改計畫。在我確認前，不要修改檔案，不要執行 migration，不要 commit。
