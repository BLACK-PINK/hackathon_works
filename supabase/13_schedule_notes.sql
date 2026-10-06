-- 현장별 공정표 하단 텍스트 저장 테이블
CREATE TABLE IF NOT EXISTS schedule_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_notes  TEXT NOT NULL DEFAULT '',
  worker_notes TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id)
);

ALTER TABLE schedule_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedule_notes_select" ON schedule_notes;
DROP POLICY IF EXISTS "schedule_notes_insert" ON schedule_notes;
DROP POLICY IF EXISTS "schedule_notes_update" ON schedule_notes;

CREATE POLICY "schedule_notes_select" ON schedule_notes
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY "schedule_notes_insert" ON schedule_notes
  FOR INSERT WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "schedule_notes_update" ON schedule_notes
  FOR UPDATE USING (company_id = get_my_company_id());
