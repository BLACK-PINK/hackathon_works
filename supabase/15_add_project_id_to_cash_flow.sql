-- ─────────────────────────────────────────────
-- Migration 15: cash_flow_schedules에 project_id 컬럼 추가
--   매출예정 항목에서 현장(project)을 연결할 수 있도록
-- ─────────────────────────────────────────────

ALTER TABLE cash_flow_schedules
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- 인덱스 추가 (현장별 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_cash_flow_schedules_project_id
  ON cash_flow_schedules(project_id);

COMMENT ON COLUMN cash_flow_schedules.project_id IS '연결된 현장 ID (매출예정에서 주로 사용)';
