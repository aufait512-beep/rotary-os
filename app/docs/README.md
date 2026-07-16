# Rotary OS 文件中心

本資料夾是 Rotary OS 的可攜式系統藍圖、交接、換機與災難復原文件。所有文件使用繁體中文；技術名稱、路徑、資料表與欄位名稱保留英文。

## Rotary OS 簡介

Rotary OS 是「高雄晨光扶輪社年度社務管理系統」，由 Jadecode Studio 開發，整合年度行事曆、活動管理、程序表、社友管理、社費管理、年度捐獻、會計收支與 Jade AI 助理。

## 系統目前狀態

- 前端：Next.js App Router、TypeScript、Tailwind CSS
- 資料庫：Supabase
- 部署：Vercel
- AI：Jade AI 使用 OpenAI server-side API route
- 匯出：CSV、JPG、程序表 PDF、列印

## 文件導覽

- 新電腦開始：先讀 `03_DEPLOYMENT_AND_NEW_COMPUTER.md` 與 `NEW_COMPUTER_CHECKLIST.md`
- 新 Codex 對話開始：先讀 `10_CODEX_MASTER_CONTEXT.md`
- 系統架構：讀 `01_ROTARY_OS_SYSTEM_BLUEPRINT.md`
- 資料庫與 migration：讀 `02_DATABASE_AND_MIGRATIONS.md`
- 環境變數：讀 `04_ENVIRONMENT_VARIABLES.md`
- 模組規格：讀 `05_MODULE_SPECIFICATIONS.md`
- 會計規則：讀 `06_ACCOUNTING_RULES.md`
- Jade AI：讀 `07_JADE_AI_SPEC.md`
- 維護：讀 `08_MAINTENANCE_CHECKLIST.md`
- 故障復原：讀 `09_DISASTER_RECOVERY.md`
- 資產清單：讀 `11_SYSTEM_INVENTORY.md`
- 版本紀錄：讀 `12_RELEASE_AND_CHANGELOG.md`
- 備份策略：讀 `BACKUP_POLICY.md`

## 故障時先看哪份

網站打不開或資料讀取失敗：先看 `09_DISASTER_RECOVERY.md`。  
換電腦或重新安裝：先看 `03_DEPLOYMENT_AND_NEW_COMPUTER.md`。  
不確定專案規則：先看 `10_CODEX_MASTER_CONTEXT.md`。

## Beta 1.0 文件狀態

Rotary OS Beta 1.0 將版本資訊集中於 `lib/appVersion.ts`，並新增 `/year-transition` 年度交接精靈。交接精靈可安全帶入程序模板、活動類型、會計與資產負債科目、社費規則、年度職務、固定帳戶、月底清單與年度設定；不複製活動、程序表、出席、社費實際紀錄、會計交易、快照或月結資料。

Beta 1.0 同步包含 Accounting V3.5、社費費率規則、年度職務歷程、長假單場參加、本日例會名單匯出、程序模板架構與版本資訊集中管理。
