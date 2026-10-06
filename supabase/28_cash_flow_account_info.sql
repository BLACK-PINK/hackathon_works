-- ─────────────────────────────────────────────────────────────────────────
-- Migration 28: cash_flow_schedules 계좌정보 컬럼 추가
--
-- 결제예정 등록 시 수취인 계좌정보를 저장하기 위한 컬럼 3개 추가.
-- 주로 결제예정(flow_type='payment')에서 사용되지만 매출예정에도 적용 가능.
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 아래 전체 복사 후 Run
--
-- idempotent(중복 실행 안전): ADD COLUMN IF NOT EXISTS 사용
-- ─────────────────────────────────────────────────────────────────────────

-- 1) bank_name: 은행명 (예: 국민은행, 하나은행 등)
ALTER TABLE cash_flow_schedules
  ADD COLUMN IF NOT EXISTS bank_name TEXT;

-- 2) account_holder: 예금주명
ALTER TABLE cash_flow_schedules
  ADD COLUMN IF NOT EXISTS account_holder TEXT;

-- 3) account_number: 계좌번호
ALTER TABLE cash_flow_schedules
  ADD COLUMN IF NOT EXISTS account_number TEXT;

-- 완료 확인용
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'cash_flow_schedules'
ORDER BY ordinal_position;
