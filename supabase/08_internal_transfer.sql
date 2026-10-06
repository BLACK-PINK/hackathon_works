-- ============================================
-- 08: transactions 테이블에 is_internal_transfer 컬럼 추가
-- 시재 → 대표 개인 이동 등 내부 자금 이동은 손익에 포함되지 않아야 함
-- ============================================

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS is_internal_transfer BOOLEAN DEFAULT false;

COMMENT ON COLUMN transactions.is_internal_transfer IS 
  '내부 자금 이동 여부 (예: 시재→대표 통장). true이면 손익 계산에서 제외됨.';

-- 인덱스 추가 (손익 집계 쿼리 최적화)
CREATE INDEX IF NOT EXISTS idx_transactions_is_internal_transfer
  ON transactions(is_internal_transfer)
  WHERE is_internal_transfer = true;
