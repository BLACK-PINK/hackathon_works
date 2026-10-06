-- ============================================================
-- Migration 27: 현장(project) 삭제 시 연관 데이터 전체 CASCADE 삭제
-- ============================================================
-- 대상 테이블별 기존 FK → SET NULL이었던 것을 CASCADE로 변경
-- (site_logs, payments는 이미 CASCADE)
--
-- 변경 대상:
--   transactions          project_id  SET NULL → CASCADE
--   as_records            project_id  SET NULL → CASCADE
--   daily_tasks           project_id  SET NULL → CASCADE
--   work_orders           project_id  SET NULL → CASCADE
--   work_order_comments   (work_orders CASCADE 타고 자동)
--   schedules             project_id  SET NULL → CASCADE
--   cash_flow_schedules   project_id  SET NULL → CASCADE
-- ============================================================

-- 1) transactions
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_project_id_fkey;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 2) as_records
ALTER TABLE as_records
  DROP CONSTRAINT IF EXISTS as_records_project_id_fkey;
ALTER TABLE as_records
  ADD CONSTRAINT as_records_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 3) daily_tasks
ALTER TABLE daily_tasks
  DROP CONSTRAINT IF EXISTS daily_tasks_project_id_fkey;
ALTER TABLE daily_tasks
  ADD CONSTRAINT daily_tasks_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 4) work_orders
ALTER TABLE work_orders
  DROP CONSTRAINT IF EXISTS work_orders_project_id_fkey;
ALTER TABLE work_orders
  ADD CONSTRAINT work_orders_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 5) schedules
ALTER TABLE schedules
  DROP CONSTRAINT IF EXISTS schedules_project_id_fkey;
ALTER TABLE schedules
  ADD CONSTRAINT schedules_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- 6) cash_flow_schedules
ALTER TABLE cash_flow_schedules
  DROP CONSTRAINT IF EXISTS cash_flow_schedules_project_id_fkey;
ALTER TABLE cash_flow_schedules
  ADD CONSTRAINT cash_flow_schedules_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- ============================================================
-- "테스트" 현장 잔여 고아 데이터 정리
-- (현장 삭제 후 project_id = NULL이 된 孤兒 레코드 제거)
-- ※ company_id로 범위를 제한하지 않으면 전체 삭제되므로
--   직접 Supabase SQL Editor에서 company_id 확인 후 실행할 것
-- ============================================================

-- [주의] 아래 쿼리를 실행하기 전에
--   SELECT id, name FROM companies;
--   를 먼저 실행해서 본인 company_id를 확인하세요.
--
-- 이미 삭제된 "테스트" 현장에 속했던 고아 레코드 정리:
-- (project_id IS NULL이 된 것들 중 company 기준으로만 식별 가능)
-- → 아래는 참고용 쿼리이며, 실제로는 company_id를 입력해서 실행하세요.

-- -- transactions (project_id = NULL인 것들 조회 먼저)
-- SELECT id, description, amount, transaction_date FROM transactions
-- WHERE company_id = '<YOUR_COMPANY_ID>' AND project_id IS NULL;
--
-- -- 확인 후 삭제
-- DELETE FROM transactions
-- WHERE company_id = '<YOUR_COMPANY_ID>' AND project_id IS NULL;
--
-- -- as_records
-- DELETE FROM as_records
-- WHERE company_id = '<YOUR_COMPANY_ID>' AND project_id IS NULL;
--
-- -- cash_flow_schedules
-- DELETE FROM cash_flow_schedules
-- WHERE company_id = '<YOUR_COMPANY_ID>' AND project_id IS NULL;
--
-- -- daily_tasks
-- DELETE FROM daily_tasks
-- WHERE company_id = '<YOUR_COMPANY_ID>' AND project_id IS NULL;
--
-- -- schedules
-- DELETE FROM schedules
-- WHERE company_id = '<YOUR_COMPANY_ID>' AND project_id IS NULL;
--
-- -- work_orders
-- DELETE FROM work_orders
-- WHERE company_id = '<YOUR_COMPANY_ID>' AND project_id IS NULL;
