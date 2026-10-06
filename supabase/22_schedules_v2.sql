-- schedules 테이블 row_index 컬럼 추가
-- row_index: 0~3 공정행, 4~7 챕터할일행
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS row_index INTEGER DEFAULT 0;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS row_type  TEXT DEFAULT 'process'; -- 'process' | 'task'
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS end_date   DATE;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS status     TEXT DEFAULT '예정';    -- '예정' | '진행중' | '완료'
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS share_text TEXT;

-- start_date/end_date 없으면 date 컬럼으로 채우기
UPDATE schedules SET start_date = date, end_date = date WHERE start_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_schedules_row_index ON schedules(project_id, row_index);
