-- ─────────────────────────────────────────────────────────────────────────
-- Migration 17: cash_flow_schedules 전체 컬럼 보완 (누락된 컬럼 한번에 추가)
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 아래 전체 복사 후 Run
--
-- 이 스크립트는 idempotent(중복 실행 안전)합니다.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) project_id: 현장 연결
ALTER TABLE cash_flow_schedules
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- 2) supply_amount: 공급가액 (부가세 제외)
ALTER TABLE cash_flow_schedules
  ADD COLUMN IF NOT EXISTS supply_amount BIGINT;

-- 3) vat_amount: 부가세액
ALTER TABLE cash_flow_schedules
  ADD COLUMN IF NOT EXISTS vat_amount BIGINT NOT NULL DEFAULT 0;

-- 4) vat_type: 세금계산서 발행 여부
ALTER TABLE cash_flow_schedules
  ADD COLUMN IF NOT EXISTS vat_type TEXT NOT NULL DEFAULT 'not_issued'
    CHECK (vat_type IN ('issued', 'not_issued'));

-- 5) transaction_id: 완료 처리 후 생성된 원장 ID
ALTER TABLE cash_flow_schedules
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

-- 6) 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_cash_flow_project_id
  ON cash_flow_schedules(project_id);

CREATE INDEX IF NOT EXISTS idx_cash_flow_transaction_id
  ON cash_flow_schedules(transaction_id);

-- 7) RLS 정책 수정: profiles → user_profiles (실제 테이블명)
--    기존 정책 삭제 후 재생성
DROP POLICY IF EXISTS "cash_flow_schedules_select" ON cash_flow_schedules;
DROP POLICY IF EXISTS "cash_flow_schedules_insert" ON cash_flow_schedules;
DROP POLICY IF EXISTS "cash_flow_schedules_update" ON cash_flow_schedules;
DROP POLICY IF EXISTS "cash_flow_schedules_delete" ON cash_flow_schedules;

CREATE POLICY "cash_flow_schedules_select" ON cash_flow_schedules
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "cash_flow_schedules_insert" ON cash_flow_schedules
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "cash_flow_schedules_update" ON cash_flow_schedules
  FOR UPDATE USING (
    created_by = auth.uid()
    OR company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid() AND role = 'owner'
    )
  );

CREATE POLICY "cash_flow_schedules_delete" ON cash_flow_schedules
  FOR DELETE USING (
    created_by = auth.uid()
    OR company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- 완료 확인용
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'cash_flow_schedules'
ORDER BY ordinal_position;
