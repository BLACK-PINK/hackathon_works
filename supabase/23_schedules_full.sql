-- ══════════════════════════════════════════════
--  schedules 전체 설정 (21 + 22 합본)
--  Supabase SQL Editor에서 전체 복붙 후 실행
-- ══════════════════════════════════════════════

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS schedules (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
  date         DATE NOT NULL,
  process      TEXT NOT NULL,
  worker_name  TEXT,
  memo         TEXT,
  color        TEXT DEFAULT '#007AFF',
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  -- v2 컬럼 (처음부터 같이 생성)
  row_index    INTEGER DEFAULT 0,
  row_type     TEXT DEFAULT 'process',
  start_date   DATE,
  end_date     DATE,
  status       TEXT DEFAULT '예정',
  share_text   TEXT
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_schedules_company_id  ON schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_schedules_date        ON schedules(date);
CREATE INDEX IF NOT EXISTS idx_schedules_project_id  ON schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_schedules_row_index   ON schedules(project_id, row_index);

-- 3. RLS 활성화
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책
DROP POLICY IF EXISTS "schedules_select" ON schedules;
DROP POLICY IF EXISTS "schedules_insert" ON schedules;
DROP POLICY IF EXISTS "schedules_update" ON schedules;
DROP POLICY IF EXISTS "schedules_delete" ON schedules;

CREATE POLICY "schedules_select" ON schedules
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY "schedules_insert" ON schedules
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND is_owner_or_manager()
  );

CREATE POLICY "schedules_update" ON schedules
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND is_owner_or_manager()
  );

CREATE POLICY "schedules_delete" ON schedules
  FOR DELETE USING (
    company_id = get_my_company_id()
    AND is_owner_or_manager()
  );

-- 5. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS schedules_updated_at ON schedules;
CREATE TRIGGER schedules_updated_at
  BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION update_schedules_updated_at();
