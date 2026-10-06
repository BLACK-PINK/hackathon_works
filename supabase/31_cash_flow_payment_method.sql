-- ─────────────────────────────────────────────────────────────────────────
-- Migration 31: cash_flow_schedules 에 payment_method 컬럼 추가
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 아래 전체 복사 후 Run
--
-- 이 스크립트는 idempotent(중복 실행 안전)합니다.
-- ─────────────────────────────────────────────────────────────────────────

-- payment_method: 결제방법 (계좌이체 / 현금)
ALTER TABLE cash_flow_schedules
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'transfer'
    CHECK (payment_method IN ('transfer', 'cash', 'card'));

-- 완료 확인용
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'cash_flow_schedules'
  AND column_name = 'payment_method';
