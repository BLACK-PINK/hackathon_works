-- ============================================
-- 26: transactions 테이블에 부가세 관련 컬럼 추가
-- supply_amount: 공급가 (부가세 제외)
-- vat_amount: 부가세 금액
-- vat_type: 'issued' | 'not_issued'
-- ============================================

-- 공급가 (부가세 제외 금액)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS supply_amount NUMERIC(15,2) DEFAULT 0;

-- 부가세 금액
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(15,2) DEFAULT 0;

-- 부가세 발행 구분 ('issued' = 발행, 'not_issued' = 미발행)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS vat_type TEXT DEFAULT 'not_issued'
CHECK (vat_type IN ('issued', 'not_issued'));

-- 기존 데이터 마이그레이션: amount → supply_amount 복사
-- (기존 amount는 공급가로 간주)
UPDATE transactions
SET supply_amount = amount,
    vat_type = CASE WHEN has_vat THEN 'issued' ELSE 'not_issued' END
WHERE supply_amount = 0;

COMMENT ON COLUMN transactions.supply_amount IS '공급가 (부가세 제외)';
COMMENT ON COLUMN transactions.vat_amount IS '부가세 금액';
COMMENT ON COLUMN transactions.vat_type IS '부가세 발행 여부: issued(발행) | not_issued(미발행)';
