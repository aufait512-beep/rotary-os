-- Rotary OS Beta 1.0 program templates.
-- Safe to rerun: only inserts missing blocks and never overwrites existing edits.

with block_defaults(template_type, block_key, title, content, start_time, sort_order) as (
  values
    ('regular', 'fellowship', '餐敘聯誼', '', '18:30'::time, 10),
    ('regular', 'opening', '會議開始／社長鳴鐘', '', '19:15'::time, 20),
    ('regular', 'rotary_song', '唱扶輪頌', '', null, 30),
    ('regular', 'welcome_song', '扶輪社友，我們歡迎您', '友社來賓參與時唱', null, 40),
    ('regular', 'four_way_test', '請社長帶領社友朗讀 四大考驗', '四大考驗－我們所想、所說、所做的事應事先捫心自問：\n1. 是否一切屬於真實？\n2. 是否各方得到公平？\n3. 能否促進親善友誼？\n4. 能否兼顧彼此利益？', null, 50),
    ('regular', 'introduce_guests', '介紹社友及來賓', '', null, 60),
    ('regular', 'introduce_speaker', '介紹主講人', '{{speaker}}', null, 70),
    ('regular', 'president_secretary', '社長致詞／秘書報告', '', '19:25'::time, 80),
    ('regular', 'keynote', '專題演講', '{{topic}}', '19:35'::time, 90),
    ('regular', 'qa', 'Q&A', '', '20:10'::time, 100),
    ('regular', 'sergeant', '糾察時間', '', '20:15'::time, 110),
    ('regular', 'closing', '社長鳴鐘閉會', '', '20:20'::time, 120),
    ('regular', 'upcoming_events', '活動預告', '{{upcoming_events}}', null, 130),

    ('birthday', 'fellowship', '餐敘聯誼', '', '18:30'::time, 10),
    ('birthday', 'opening', '會議開始／社長鳴鐘', '', '19:15'::time, 20),
    ('birthday', 'celebration', '慶生暨結婚紀念祝福', '', null, 30),
    ('birthday', 'club_reports', '社長致詞／秘書報告', '', null, 40),
    ('birthday', 'keynote', '專題分享', '{{topic}}', null, 50),
    ('birthday', 'closing', '社長鳴鐘閉會', '', null, 60),
    ('birthday', 'upcoming_events', '活動預告', '{{upcoming_events}}', null, 70),

    ('board', 'opening', '主席宣布開會', '', null, 10),
    ('board', 'previous_minutes', '確認上次會議紀錄', '', null, 20),
    ('board', 'finance_report', '財務報告', '', null, 30),
    ('board', 'proposals', '提案討論與決議', '', null, 40),
    ('board', 'motions', '臨時動議', '', null, 50),
    ('board', 'closing', '主席宣布散會', '', null, 60),

    ('service', 'gathering', '集合與工作說明', '', null, 10),
    ('service', 'opening', '活動開始', '', null, 20),
    ('service', 'service_work', '服務活動', '{{topic}}', null, 30),
    ('service', 'photo', '合照與成果紀錄', '', null, 40),
    ('service', 'closing', '活動結束', '', null, 50),

    ('induction', 'opening', '典禮開始／社長鳴鐘', '', null, 10),
    ('induction', 'introduction', '介紹新社員', '{{speaker}}', null, 20),
    ('induction', 'induction', '新社員入社儀式', '', null, 30),
    ('induction', 'badge', '授證與佩章', '', null, 40),
    ('induction', 'remarks', '新社員致詞', '', null, 50),
    ('induction', 'welcome', '全體社友歡迎', '', null, 60),
    ('induction', 'closing', '社長鳴鐘閉會', '', null, 70)
)
insert into public.program_template_blocks (
  template_id, block_key, title, content, start_time, display_condition, sort_order, is_active
)
select t.id, d.block_key, d.title, d.content, d.start_time, '{}'::jsonb, d.sort_order, true
from public.program_templates t
join block_defaults d on d.template_type = t.template_type
where t.is_active = true
on conflict (template_id, block_key) do nothing;

-- Retire the original one-line placeholder after detailed blocks exist.
update public.program_template_blocks b
set is_active = false, updated_at = now()
from public.program_templates t
where b.template_id = t.id
  and b.block_key = 'main_agenda'
  and exists (
    select 1 from public.program_template_blocks detailed
    where detailed.template_id = t.id and detailed.block_key <> 'main_agenda'
  );
