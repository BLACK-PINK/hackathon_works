-- ══════════════════════════════════════════════
--  schedules 테이블 — 현장 스케줄러
-- ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS schedules (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,  -- 현장
  date         DATE NOT NULL,                                      -- 스케줄 날짜
  process      TEXT NOT NULL,                                      -- 공정명
  worker_name  TEXT,                                               -- 담당자 (자유입력)
  memo         TEXT,                                               -- 메모
  color        TEXT DEFAULT '#007AFF',                             -- 카드 색상
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_schedules_company_id ON schedules(company_id);
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);
CREATE INDEX IF NOT EXISTS idx_schedules_project_id ON schedules(project_id);

-- RLS
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

-- 같은 회사 멤버는 모두 조회 가능
CREATE POLICY "schedules_select" ON schedules
  FOR SELECT USING (company_id = get_my_company_id());

-- owner/manager만 등록/수정 가능
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

-- owner/manager만 삭제 가능
CREATE POLICY "schedules_delete" ON schedules
  FOR DELETE USING (
    company_id = get_my_company_id()
    AND is_owner_or_manager()
  );

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER schedules_updated_at
  BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION update_schedules_updated_at();
