-- ============================================
-- 10: transactions 테이블에 has_vat 컬럼 추가
-- 부가세 발행 여부 (시재 기입 시 사용)
-- ============================================

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS has_vat BOOLEAN DEFAULT false;

COMMENT ON COLUMN transactions.has_vat IS '부가세 발행 여부';
