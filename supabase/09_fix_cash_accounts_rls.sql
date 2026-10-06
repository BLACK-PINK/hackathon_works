-- ============================================
-- 09: cash_accounts RLS 정책 수정
-- INSERT: owner만 → is_owner_or_manager로 확장
-- SELECT: 전체 팀원이 회사 시재 전체 조회 가능하도록 변경
-- ============================================

-- SELECT: 같은 회사면 전체 조회 가능 (owner/manager/worker 모두)
DROP POLICY IF EXISTS "cash_accounts_select" ON cash_accounts;
CREATE POLICY "cash_accounts_select" ON cash_accounts
  FOR SELECT USING (company_id = get_my_company_id());

-- INSERT: owner + manager도 가능하도록 확장
DROP POLICY IF EXISTS "cash_accounts_insert" ON cash_accounts;
CREATE POLICY "cash_accounts_insert" ON cash_accounts
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND is_owner_or_manager()
  );

-- UPDATE: owner + manager도 가능하도록 확장
DROP POLICY IF EXISTS "cash_accounts_update" ON cash_accounts;
CREATE POLICY "cash_accounts_update" ON cash_accounts
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND is_owner_or_manager()
  );
