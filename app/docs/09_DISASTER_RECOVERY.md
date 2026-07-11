# 災難復原

## 新電腦或舊電腦損壞

1. 安裝 Git、Node.js、VS Code
2. 從 GitHub clone repository
3. 進入 `rotary-os/app`
4. `npm install`
5. 建立 `.env.local`
6. `npm run lint`
7. `npm run build`
8. `npm run dev`

GitHub 只能復原已 push 的程式碼，無法復原未推送的本機修改。

## 本機專案遺失

從 GitHub 重新 clone。若本機有未 push 修改，GitHub 無法復原。

## GitHub 程式誤刪

可用 Git history 還原已提交內容。若整個 repository 被刪除，需依 GitHub 帳號與備份政策處理。

## Vercel 部署失敗

1. 查看 Vercel Build Logs
2. 本機執行 `npm run build`
3. 確認 Root Directory 是 `app`
4. 確認環境變數存在
5. 修正後 push 再部署

Vercel 不是資料庫備份。

## Supabase 資料誤刪

1. 立即停止相關操作
2. 檢查 Supabase Logs
3. 檢查是否有 Supabase 備份或匯出
4. 若是 migration 造成，先不要重跑 migration
5. 從備份復原或人工重建

## API Key 外洩

1. 到 OpenAI Platform 立即停用外洩 key
2. 建立新 key
3. 更新本機 `.env.local`
4. 更新 Vercel Environment Variables
5. Redeploy

## OpenAI API quota 用完

Jade AI 會顯示 API 錯誤。活動管理仍可手動新增。到 OpenAI Platform 檢查 quota 與 billing。

## Migration 執行失敗

1. 保存錯誤訊息
2. 不要重複亂跑
3. 查看 SQL 是否已部分執行
4. 檢查 table/column 是否已存在
5. 編寫補救 migration，不刪資料

## 網站顯示資料讀取失敗

1. 檢查 Vercel env
2. 檢查 Supabase URL/anon key
3. 檢查 RLS policy
4. 檢查 table/column 是否存在
5. 查看 Browser Console、Vercel Logs、Supabase Logs
