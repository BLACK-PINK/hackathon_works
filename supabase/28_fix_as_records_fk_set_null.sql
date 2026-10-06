-- ============================================================
-- Migration 28: as_records project_id FK → CASCADE에서 SET NULL로 변경
-- ============================================================
-- 이유: AS는 현장(project)과 독립적으로 존재해야 함
--   - 현장 등록 전 고객 AS (직접입력 site_name)
--   - 현장 삭제 후에도 AS 기록은 보존 필요
-- ============================================================

ALTER TABLE as_records
  DROP CONSTRAINT IF EXISTS as_records_project_id_fkey;
ALTER TABLE as_records
  ADD CONSTRAINT as_records_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
