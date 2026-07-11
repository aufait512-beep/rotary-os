# 備份政策

## 程式碼

GitHub 是主要遠端版本庫。每次功能完成後，應 commit 並 push。

## 正式資料

Supabase 是正式資料來源。重大 migration 前，需確認 Supabase 備份或先匯出重要資料。

## 部署

Vercel 是部署平台，不是資料庫備份。

## Secret

不得放 GitHub。由 Jane 使用密碼管理器安全保存。

## 參考 Excel

`reference/` 目前出現在工作樹，包含會計參考 Excel。若不希望進 Git，建議加入 `.gitignore`，並將檔案保存在私人雲端與本機備份。此文件建立時未刪除任何 reference 檔。

## 建議頻率

- 每次功能完成：git commit + push
- 每月月結後：匯出重要會計資料
- 每年度結束：完整匯出年度資料
- 重大 migration 前：先確認 Supabase 備份或匯出
