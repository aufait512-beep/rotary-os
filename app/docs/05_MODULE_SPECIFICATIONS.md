# 模組規格

## 首頁工作台

路由：`/`。  
功能：進入各管理模組。  
資料來源：無。  
不可破壞規則：保留 Rotary OS、高雄晨光扶輪社智慧秘書系統品牌文字。

## 年度管理

路由：`/calendar`。  
資料表：`rotary_years`, `events`。  
功能：年度卡片、新增/編輯/刪除年度、active 年度。  
規則：不可刪除已有活動的年度；未來年度不再由前端自動補建。

## 年度行事曆

路由：`/calendar`。  
資料來源：`events`。  
功能：月曆總覽、年度活動清單、活動定位。  
手機：月曆格只顯示例會數字，避免破版。

## 活動管理

路由：`/events`。  
資料表：`events`, `rotary_years`。  
功能：新增、編輯、刪除、收合列表。  
預設時間：餐敘 `18:30`、開會 `19:15`、結束 `20:10`。

## 程序表

路由：`/programs`。  
資料表：`events`, `programs`。  
匯出：列印、PDF。  
規則：A4 固定模板、白底黑字、固定流程。A4 內不顯示 App 卡片風格。

## 社友管理

路由：`/members`。  
資料表：`members`。  
功能：新增、編輯、刪除、搜尋、JSON 匯入、CSV。  
名稱格式：`中文姓名 社名`。  
規則：JSON 匯入忽略舊 uuid 不相容 id，以 `chinese_name + rotary_name` 判斷更新。

## 社費管理

路由：`/dues`。  
資料表：`members`, `dues_records`, `dues_line_items`。  
功能：新增、編輯、刪除、篩選、CSV、個人通知 JPG。  
計算：`previous_balance + current_due - paid_amount`。顯示負數時以 `Math.max(0, balance)`。

## 未繳社費查詢

路由：`/assistant`。  
資料表：`dues_records`, `members`。  
功能：依月份列出尚欠金額大於 0 的社友，CSV 匯出。  
不呼叫 OpenAI。

## 每月社費批次建立

路由：`/assistant`。  
資料表：`members`, `dues_records`, `dues_line_items`。  
流程：預覽 → 人工確認 → 寫入。  
規則：同會員同月份不可重複建立；已有紀錄顯示略過。

## 個人社費 JPG 通知

路由：`/dues` 與 `/assistant` 批次。  
套件：`html2canvas` dynamic import。  
格式：一位社友一張 JPG，白底，高解析度，適合 LINE 傳送。

## 全體社費應繳總表

路由：`/assistant`。  
資料表：`dues_records`, `dues_line_items`, `members`。  
匯出：CSV、列印、批次 JPG。  
手機：表格使用局部橫向捲動。

## 年度捐獻計畫

路由：`/donations`, `/donate`。  
資料表：`donation_plans`, `donation_records`, `members`。  
功能：三大分類、計畫管理、公開登記、付款狀態、CSV。

## 會計收支登錄

路由：`/accounting`。  
資料表：`accounting_entries`, `accounting_categories`。  
功能：收支新增、編輯、刪除、CSV。  
規則：已鎖定月份不可修改或刪除。

## 年度預算

路由：`/accounting`。  
資料表：`accounting_categories`。  
功能：年度選擇、Excel 匯入、預覽、手動新增、編輯、啟用/停用、刪除無交易科目。  
規則：有交易科目不可刪除，只可停用。

## Excel 預算匯入

路由：`/accounting`。  
套件：`xlsx`。  
流程：上傳 → 解析預覽 → 人工確認 → 寫入。  
不可匯入每月實際收支、銀行餘額、資產負債金額。

## 每月收支報表

路由：`/accounting`。  
資料表：`accounting_entries`, `accounting_categories`, `balance_sheet_items`。  
計算：本月實際與年度累計只來自 `accounting_entries`。  
匯出：列印、JPG、CSV。

## 資產負債摘要

路由：`/accounting`。  
資料表：`balance_sheet_items` 與年度累計結餘。  
規則：不平衡時顯示差額警告。

## 暫付款／代收付

路由：`/accounting`。  
資料來源：`accounting_entries`，條件是 `is_pass_through = true` 或科目/摘要包含暫付款、代收付。

## 月結鎖定

路由：`/accounting`。  
資料表：`accounting_month_closes`, `accounting_month_close_logs`。  
規則：鎖定後不可修改/delete 該月 `accounting_entries`；解除需原因。

## Jade AI

路由：`/assistant` 與 `/api/assistant/parse`。  
資料表：`events`。  
流程：自然語言 → AI JSON → 可編輯預覽 → 人工確認 → 寫入。  
規則：不串接 LINE、不自動建立活動、不暴露 API key。

## 年度交接精靈（Beta 1.0）

路由：`/year-transition`。Migration：`20260717_rotary_year_transition.sql`。

功能：建立或選擇目標年度、勾選交接模組、預覽來源與目標數量、人工確認年度職務與社費規則衝突、選擇是否帶入預算金額及歷屆累計餘絀、交易式執行、保存交接歷程、完成後人工切換 active 年度。

安全規則：只新增缺少設定，不靜默覆蓋目標年度；來源年度不修改；實際活動、程序表、出席、社費、付款、會計交易、資產負債快照與月結資料不複製。

## Beta 1.0 模組補充

- Accounting V3.5：收支、帳戶、對帳、資產負債快照與月底檢查整合。
- 社費費率：依年度、身分、職務、資深與長假規則帶入。
- 年度職務：使用具日期範圍的 `member_roles` 保存歷程。
- 長假單場參加：只覆寫單一例會出席，不修改長假期間。
- 本日例會名單：可預覽、篩選、匯出 JPG 與 A4 列印。
- 程序模板：模板與實際 `programs` 分離保存。
