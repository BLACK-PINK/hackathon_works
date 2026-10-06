-- transactions 테이블에 is_modified 컬럼 추가
-- 시재 거래 당일 수정 여부를 표시하기 위한 플래그
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_modified BOOLEAN DEFAULT false;

-- 인덱스 (수정된 거래 조회 성능)
CREATE INDEX IF NOT EXISTS idx_transactions_is_modified ON transactions(is_modified) WHERE is_modified = true;
