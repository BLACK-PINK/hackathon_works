-- ============================================================
-- 13_seed_recurring_expenses.sql
-- 정기지출 추천 항목 seed
-- ⚠️ company_id를 실제 값으로 교체 후 실행하세요
-- 
-- company_id 확인 방법:
--   SELECT id, name FROM companies;
-- ============================================================

-- 아래 'YOUR_COMPANY_ID'를 실제 company_id UUID로 교체하세요
-- 예: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

DO $$
DECLARE
  v_company_id UUID := 'YOUR_COMPANY_ID';  -- ← 여기를 실제 company_id로 교체
  v_owner_id   UUID;
BEGIN
  -- owner_id 자동 조회
  SELECT up.id INTO v_owner_id
  FROM user_profiles up
  WHERE up.company_id = v_company_id AND up.role = 'owner'
  LIMIT 1;

  -- ── 고정비 항목 (billing_day 기준 정렬) ──────────────────
  INSERT INTO recurring_expenses
    (company_id, name, expense_type, sub_category, amount, billing_day, memo, is_active, created_by)
  VALUES
    -- 급여·4대보험 (10일)
    (v_company_id, '직원 급여',    'fixed', 'SGA', 0, 10, '매월 10일 지급',     true, v_owner_id),
    (v_company_id, '임원 급여',    'fixed', 'SGA', 0, 10, '매월 10일 지급',     true, v_owner_id),
    (v_company_id, '4대보험',      'fixed', 'SGA', 0, 10, '국민연금·건강·고용', true, v_owner_id),
    -- 임차·관리 (20일)
    (v_company_id, '사무실 임차료','fixed', 'SGA', 0, 20, '건물주 계좌이체',    true, v_owner_id),
    -- 통신·구독 (25일)
    (v_company_id, '통신비',       'fixed', 'SGA', 0, 25, '인터넷+휴대폰',      true, v_owner_id),
    (v_company_id, '소프트웨어 구독료','fixed','SGA',0,25,'각종 SaaS 구독',   true, v_owner_id),
    -- 차량·보험 (말일)
    (v_company_id, '차량 할부금',  'fixed', 'SGA', 0, 25, '리스/할부',          true, v_owner_id),
    (v_company_id, '보험료',       'fixed', 'SGA', 0, 15, '산재·고용보험',      true, v_owner_id)
  ON CONFLICT DO NOTHING;

  -- ── 변동비 항목 ─────────────────────────────────────────
  INSERT INTO recurring_expenses
    (company_id, name, expense_type, sub_category, amount, billing_day, memo, is_active, created_by)
  VALUES
    (v_company_id, '유류비',              'variable', 'SGA', 0, NULL, NULL, true, v_owner_id),
    (v_company_id, '회식비',              'variable', 'SGA', 0, NULL, NULL, true, v_owner_id),
    (v_company_id, '직원 인센티브',       'variable', 'SGA', 0, NULL, NULL, true, v_owner_id),
    (v_company_id, '소모품',              'variable', 'SGA', 0, NULL, NULL, true, v_owner_id),
    (v_company_id, '접대비',              'variable', 'SGA', 0, NULL, NULL, true, v_owner_id),
    (v_company_id, '식대지출',            'variable', 'SGA', 0, NULL, NULL, true, v_owner_id),
    (v_company_id, '사업자 대출이자지급', 'variable', 'SGA', 0, NULL, NULL, true, v_owner_id),
    (v_company_id, '사무실 관리비',       'variable', 'SGA', 0, NULL, NULL, true, v_owner_id),
    (v_company_id, '교육비',              'variable', 'SGA', 0, NULL, NULL, true, v_owner_id),
    (v_company_id, '교통비',              'variable', 'SGA', 0, NULL, NULL, true, v_owner_id),
    (v_company_id, '숙소비',              'variable', 'SGA', 0, NULL, NULL, true, v_owner_id),
    (v_company_id, '출장비',              'variable', 'SGA', 0, NULL, NULL, true, v_owner_id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✅ 정기지출 추천 항목 seed 완료 (company_id: %)', v_company_id;
END $$;
