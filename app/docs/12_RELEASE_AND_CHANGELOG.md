# Release 與 Changelog

## 已知版本

### Rotary OS v1.0

可確認內容：

- 品牌文字與 Footer 已建立
- About 頁已建立
- 基礎模組包含活動、行事曆、程序表、社友、社費、捐獻

日期：需至 git history 確認。

### Rotary OS v1.1

可確認內容：

- 年度管理與未來年度規則調整
- 社費批次、未繳查詢、個人 JPG 通知
- Jade AI 助理
- 會計收支、年度預算、月報、月結鎖定
- 正式會計科目與 Excel 預算匯入

日期：需至 git history 確認。

### Rotary OS current

目前狀態以程式與 docs 為準。

## 後續更新格式

```md
## YYYY-MM-DD / Version

新增功能：
- 

修改功能：
- 

資料庫 migration：
- 

環境變數：
- 

部署結果：
- 

驗收結果：
- 

已知問題：
- 
```

## 2026-07-17 / Rotary OS Beta 1.0

新增功能：
- 年度交接精靈與交易式交接 RPC
- 程序模板、程序區塊、活動類型與年度設定資料架構
- 年度職務預覽與社費費率衝突處理
- 歷屆累計餘絀人工確認帶入
- 長假社友單場參加與本日例會出席用餐名單 JPG／列印

修改功能：
- Accounting V3.5 與月底檢查架構納入年度交接
- 全站版本集中至 `lib/appVersion.ts`
- Footer、About、metadata 與 PWA manifest 統一為 Rotary OS Beta 1.0／Jadecode Studio／Jade AI

資料庫 migration：
- `supabase/migrations/20260717_rotary_year_transition.sql`

環境變數：
- 無新增

安全說明：
- 不刪除或覆蓋歷史年度
- 不複製實際活動、出席、社費、付款、會計交易、資產負債快照或月結紀錄
- 目標年度既有設定只新增缺少資料，職務與衝突需人工確認
