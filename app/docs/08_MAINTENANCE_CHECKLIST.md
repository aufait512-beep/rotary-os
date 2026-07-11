# 維護檢查清單

## 每日

- [ ] 確認正式網站可開啟
- [ ] 確認 Supabase 無明顯錯誤
- [ ] 確認 Vercel 部署狀態 Ready

## 每月

- [ ] 建立上月份社費
- [ ] 查詢未繳名單
- [ ] 匯出個人社費 JPG
- [ ] 登錄本月收支
- [ ] 產生月底收支報表
- [ ] 檢查資產負債是否平衡
- [ ] 檢查暫付款與代收付
- [ ] 月結鎖定
- [ ] 匯出重要會計資料備份

## 每年度

- [ ] 新增下一扶輪年度
- [ ] 系統依日期提示切換 active 年度
- [ ] 人工確認後切換 active 年度
- [ ] 保留舊年度
- [ ] 建立或匯入新年度預算
- [ ] 檢查年度行事曆
- [ ] 不自動刪除舊年度

## 程式更新後

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] 檢查首頁
- [ ] 檢查主要路由
- [ ] 檢查手機版 375px、390px、430px

## Supabase migration 後

- [ ] 確認 migration SQL 無 destructive 操作
- [ ] 確認備份或匯出
- [ ] 至 Supabase 確認 table/column/index/policy
- [ ] 驗證對應頁面

## Vercel 部署後

- [ ] Deployment 狀態 Ready
- [ ] 查看 Build Logs
- [ ] 打開正式網址
- [ ] 測試 `/assistant`
- [ ] 測試 Supabase 資料讀寫
