# Database 與 Migrations

## Supabase 專案用途

Supabase 是 Rotary OS 的正式資料來源。Vercel 只負責部署，不是資料庫備份。

## Supabase client

檔案：`src/lib/supabase.ts`

使用：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 或 `NEXT_PUBLIC_SUPABASE_ANON_KEY`

目前程式實際 fallback 為 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? NEXT_PUBLIC_SUPABASE_ANON_KEY`。

## 主要資料表

以下依 migration 與程式整理。未出現在目前 migration 但由程式使用者，需至 Supabase 確認實際結構。

### `rotary_years`

用途：扶輪年度管理。  
主鍵：`id uuid`。  
重要欄位：`name`, `display_name`, `start_date`, `end_date`, `is_active`, `created_at`。  
Unique：`name`。  
RLS：migration 啟用，public read/insert/update/delete policy。

### `events`

用途：活動與例會資料。  
程式欄位：`id`, `rotary_year_id`, `title`, `event_type`, `meeting_no`, `date`, `weekday`, `dinner_time`, `meeting_time`, `end_time`, `location`, `room`, `topic`, `speaker`, `fellowship_chair`, `sergeant_at_arms`, `description`, `note`。  
外鍵：`rotary_year_id -> rotary_years.id` 由 migration 新增。  
Index：`idx_events_rotary_year_id`, `idx_events_date_time`。  
RLS：需至 Supabase 確認原始 table policy。

### `members`

用途：社友資料。  
程式欄位：`chinese_name`, `rotary_name`, `english_name`, `rotary_title`, `annual_role`, `spouse`, `join_date`, `birthday`, `birthday_month`, `anniversary`, `classification`, `organization`, `work_address`, `home_address`, `phone`, `mobile`, `fax`, `email`, `little_rotary`, `ri_no`, `status`, `note`。  
RLS、主鍵、index：需至 Supabase 確認。

### `programs`

用途：程序表資料。  
程式欄位：`event_id`, `title`, `date`, `dinner_time`, `meeting_time`, `location`, `room`, `topic`, `speaker`, `fellowship_chair`, `sergeant_at_arms`。  
RLS、主鍵、index：需至 Supabase 確認。

### `dues_records`

用途：社費主檔。  
程式欄位：`member_id`, `period_month`, `previous_balance`, `current_due`, `paid_amount`, `discount_amount`, `payment_date`, `payment_method`, `note`, `created_at`。  
關聯：`dues_line_items.dues_record_id`。  
RLS、主鍵、index：需至 Supabase 確認。

### `dues_line_items`

用途：社費明細。  
主鍵：`id uuid`。  
外鍵：`dues_record_id -> dues_records.id on delete cascade`。  
欄位：`item_type`, `item_name`, `service_date`, `quantity`, `unit_amount`, `amount`, `note`, `created_at`。  
Check：`item_type in ('meal','annual_fee','special_donation','red_box','rotary_foundation','pass_through')`。  
Index：`idx_dues_line_items_dues_record_id`。  
RLS：migration 啟用，public policies。

### `donation_plans`

用途：年度捐獻計畫。  
程式欄位：`category`, `title`, `description`, `suggested_amount_text`, `start_date`, `end_date`, `status`, `sort_order`。  
RLS、主鍵、index：需至 Supabase 確認。

### `donation_records`

用途：捐獻登記。  
程式欄位：`plan_id`, `donor_name`, `club_name`, `donor_type`, `amount`, `transfer_last_five`, `note`, `payment_status`, `created_at`。  
RLS、主鍵、index：需至 Supabase 確認。

### `accounting_categories`

用途：年度預算科目。  
主鍵：`id uuid`。  
外鍵：`rotary_year_id -> rotary_years.id on delete set null`。  
欄位：`entry_type`, `group_name`, `name`, `annual_budget`, `sort_order`, `is_active`, `created_at`。  
Index：`idx_accounting_categories_year`。  
RLS：migration 啟用，public policies。

### `accounting_entries`

用途：會計收支交易。  
主鍵：`id uuid`。  
外鍵：`rotary_year_id`, `category_id`, `member_id`, `dues_record_id`, `donation_record_id`。  
欄位：`entry_date`, `entry_type`, `category`, `description`, `amount`, `payment_method`, `reference_no`, `is_pass_through`, `note`, `created_at`。  
Unique partial index：`accounting_entries_dues_record_id_unique` when `dues_record_id is not null`。  
Index：`idx_accounting_entries_year_month`, `idx_accounting_entries_category`。  
Trigger：`prevent_locked_accounting_entry_update`, `prevent_locked_accounting_entry_delete`。  
RLS：migration 啟用，public policies。

### `accounting_accounts`

用途：會計帳戶設定。  
主鍵：`id uuid`。  
欄位：`account_type`, `name`, `opening_balance`, `sort_order`, `is_active`, `created_at`。  
Index：`idx_accounting_accounts_year`。  
RLS：migration 啟用，public policies。

### `balance_sheet_items`

用途：資產負債表項目。  
主鍵：`id uuid`。  
欄位：`item_type`, `group_name`, `name`, `amount`, `sort_order`, `note`, `created_at`。  
Check：`item_type in ('asset','liability','fund')`。  
Index：`idx_balance_sheet_items_year`。  
RLS：migration 啟用，public policies。

### `accounting_month_closes`

用途：會計月結狀態。  
主鍵：`id uuid`。  
Unique：`(rotary_year_id, report_month)`。  
欄位：`status`, `closed_at`, `closed_by`, `note`, `created_at`, `updated_at`。  
RLS：migration 啟用，public policies。

### `accounting_month_close_logs`

用途：月結解除鎖定紀錄。  
主鍵：`id uuid`。  
外鍵：`month_close_id -> accounting_month_closes.id on delete cascade`。  
欄位：`action`, `reason`, `created_at`。  
RLS：migration 啟用，public policies。

## Migration 清單與建議順序

1. `20260710_rotary_v1_1.sql`
   - 建立 `rotary_years`, `dues_line_items`, accounting tables, `balance_sheet_items`
   - 新增 `events.rotary_year_id`
   - 建立 indexes, RLS policies
   - 安全重跑：大多使用 `if not exists` 與 `on conflict`
   - 是否已執行：需至 Supabase 確認

2. `20260710_add_future_rotary_years.sql`
   - 早期新增未來年度
   - 後續需求改為不自動補未來年度
   - 是否已執行：需至 Supabase 確認

3. `20260711_remove_unused_future_rotary_years.sql`
   - 僅在未來年度沒有 events 時刪除 2027-2028 至 2031-2032
   - 不刪 events
   - 是否已執行：需至 Supabase 確認

4. `20260711_add_jade_ai_event_fields.sql`
   - 新增 `events.fellowship_chair`, `sergeant_at_arms`, `description`
   - 安全重跑：`add column if not exists`
   - 是否已執行：需至 Supabase 確認

5. `20260711_accounting_month_close.sql`
   - 建立月結 tables、logs、trigger
   - 鎖定月份後阻擋 `accounting_entries` update/delete
   - 是否已執行：需至 Supabase 確認

6. `20260711_accounting_official_budget.sql`
   - 建立 2026-2027 正式會計科目結構
   - `annual_budget` 初始為 0
   - 不匯入任何月實際金額
   - 是否已執行：需至 Supabase 確認

## 注意

不要假設 migration 已執行。任何部署或換機後，應至 Supabase SQL editor 或 migration history 確認。
