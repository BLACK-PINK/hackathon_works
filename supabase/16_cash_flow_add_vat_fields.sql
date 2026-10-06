-- ─────────────────────────────────────────────
-- Migration 16: cash_flow_schedules 필드 확장
--   공급가액, 부가세액, 세금계산서 발행 여부 추가
-- ─────────────────────────────────────────────

-- 공급가액 (세금 제외 금액)
ALTER TABLE cash_flow_schedules
  ADD COLUMN IF NOT EXISTS supply_amount BIGINT;

-- 부가세액
ALTER TABLE cash_flow_schedules
  ADD COLUMN IF NOT EXISTS vat_amount BIGINT NOT NULL DEFAULT 0;

-- 세금계산서 발행 여부: 'issued'=발행, 'not_issued'=미발행
ALTER TABLE cash_flow_schedules
  ADD COLUMN IF NOT EXISTS vat_type TEXT NOT NULL DEFAULT 'not_issued'
    CHECK (vat_type IN ('issued', 'not_issued'));

-- 원장에 등록된 transaction_id (완료 처리 후 연결)
ALTER TABLE cash_flow_schedules
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_cash_flow_schedules_transaction_id
  ON cash_flow_schedules(transaction_id);

COMMENT ON COLUMN cash_flow_schedules.supply_amount IS '공급가액 (부가세 제외)';
COMMENT ON COLUMN cash_flow_schedules.vat_amount    IS '부가세액';
COMMENT ON COLUMN cash_flow_schedules.vat_type      IS 'issued=세금계산서발행, not_issued=미발행';
COMMENT ON COLUMN cash_flow_schedules.transaction_id IS '완료 처리 후 생성된 원장 transaction ID';
