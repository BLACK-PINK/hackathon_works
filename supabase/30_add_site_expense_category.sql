-- ─────────────────────────────────────────────────────────────────────────
-- Migration 30: transactions.category CHECK 제약에 SITE_EXPENSE 추가
--
-- 문제:
--   transactions 테이블의 category 컬럼 CHECK 제약이
--   ('REVENUE', 'COGS', 'SGA', 'NON_OPERATING', 'TAX') 만 허용하고 있어
--   'SITE_EXPENSE' 저장 시 constraint violation 에러 발생.
--
-- 해결:
--   기존 CHECK 제약 삭제 후 SITE_EXPENSE 포함한 새 제약으로 재생성.
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 전체 복사 후 Run
-- ─────────────────────────────────────────────────────────────────────────

-- 1) 기존 CHECK 제약 삭제
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_category_check;

-- 2) SITE_EXPENSE 포함한 새 CHECK 제약 추가
ALTER TABLE transactions
  ADD CONSTRAINT transactions_category_check
  CHECK (category IN ('REVENUE', 'COGS', 'SGA', 'NON_OPERATING', 'TAX', 'SITE_EXPENSE'));

-- 3) 확인
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'transactions_category_check';
