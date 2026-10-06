-- ─────────────────────────────────────────────────────────────────────────
-- Migration 29: 시재이동 레코드 type 수정 + 시재 잔액 재계산
--
-- 문제:
--   이전 버전에서 시재이동(is_internal_transfer=true)이 type='expense'로
--   저장된 레코드가 있어 팀원 시재 잔액이 마이너스가 됨.
--   (트리거: expense → current_balance - amount)
--
-- 해결 방법:
--   1) 잘못된 레코드를 type='income'으로 수정
--   2) 영향받은 시재 계좌의 잔액을 transactions 기준으로 전면 재계산
--      (current_balance = SUM(income) - SUM(expense), voided 제외)
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 아래 전체 복사 후 Run
--   ★ 먼저 STEP 1 SELECT만 실행해서 몇 건인지 확인 후 전체 실행 권장
-- ─────────────────────────────────────────────────────────────────────────

-- ── STEP 1: 잘못된 레코드 미리보기 (확인용) ──────────────────────────
SELECT
  t.id,
  t.description,
  t.amount,
  t.type           AS current_type,
  'income'         AS will_be_changed_to,
  t.transaction_date,
  ca.name          AS account_name,
  ca.current_balance AS account_current_balance
FROM transactions t
LEFT JOIN cash_accounts ca ON ca.id = t.cash_account_id
WHERE t.is_internal_transfer = true
  AND t.type = 'expense'
  AND t.is_voided = false
ORDER BY t.transaction_date DESC;

-- ── STEP 2: type 수정 expense → income ───────────────────────────────
UPDATE transactions
SET type = 'income'
WHERE is_internal_transfer = true
  AND type = 'expense'
  AND is_voided = false;

-- ── STEP 3: 영향받은 시재 계좌 잔액 전면 재계산 ──────────────────────
-- transactions 내역 전체를 기준으로 정확한 잔액으로 덮어씀
UPDATE cash_accounts ca
SET current_balance = (
  SELECT
    COALESCE(SUM(CASE WHEN t.type = 'income'  AND NOT t.is_voided THEN t.amount ELSE 0 END), 0)
  - COALESCE(SUM(CASE WHEN t.type = 'expense' AND NOT t.is_voided THEN t.amount ELSE 0 END), 0)
  FROM transactions t
  WHERE t.cash_account_id = ca.id
)
WHERE ca.id IN (
  SELECT DISTINCT cash_account_id
  FROM transactions
  WHERE is_internal_transfer = true
    AND is_voided = false
    AND cash_account_id IS NOT NULL
);

-- ── STEP 4: 결과 확인 ────────────────────────────────────────────────
SELECT
  ca.name                AS account_name,
  ca.current_balance     AS new_balance,
  COALESCE(SUM(CASE WHEN t.type = 'income'  AND NOT t.is_voided THEN t.amount ELSE 0 END), 0)
  - COALESCE(SUM(CASE WHEN t.type = 'expense' AND NOT t.is_voided THEN t.amount ELSE 0 END), 0)
                         AS calculated_balance,
  COUNT(CASE WHEN t.is_internal_transfer AND NOT t.is_voided THEN 1 END) AS internal_transfer_count
FROM cash_accounts ca
LEFT JOIN transactions t ON t.cash_account_id = ca.id
WHERE ca.id IN (
  SELECT DISTINCT cash_account_id
  FROM transactions
  WHERE is_internal_transfer = true AND is_voided = false
)
GROUP BY ca.id, ca.name, ca.current_balance
ORDER BY ca.name;
