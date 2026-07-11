# Jade AI 規格

## 路由

- UI：`/assistant`
- API：`/api/assistant/parse`

## 功能

Jade AI 讓秘書貼上社長、幹部或群組傳來的自然語言活動文字，由 AI 整理成活動欄位。

## 可辨識欄位

- `event_type`
- `event_name`
- `meeting_no`
- `date`
- `dinner_time`
- `meeting_time`
- `end_time`
- `location`
- `speaker`
- `topic`
- `fellowship_chair`
- `sergeant_at_arms`
- `description`
- `note`
- `warnings`

## 預設時間

- 餐敘：`18:30`
- 開會：`19:15`
- 結束：`20:10`

## 規則

- 日期輸出 `YYYY-MM-DD`
- 例會次數只保留數字
- 不輸出 `undefined` 或 `null`
- AI warning 只提醒，使用者仍須確認欄位
- 寫入前檢查同日期與同例會次數，避免重複

## 寫入流程

貼上文字 → 呼叫 `/api/assistant/parse` → 顯示可編輯預覽 → 人工確認 → 寫入 `events`。

AI 不可自動建立活動，不可繞過人工確認。

## 安全

`OPENAI_API_KEY` 只能存在 server-side。不可使用 `NEXT_PUBLIC_OPENAI_API_KEY`，不可在前端或 GitHub 暴露。

## 錯誤處理

- 未設定 key：顯示 Jade AI 尚未設定
- OpenAI quota 或 API error：顯示錯誤訊息
- 無法解析 JSON：顯示解析失敗
- 缺欄位：以 warnings 提示

## 禁止事項

- 不串接 LINE
- 不自動建立活動
- 不把 API Key 放前端
- 不在 docs 或 commit 中放真實 key
