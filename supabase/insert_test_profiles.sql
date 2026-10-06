-- =====================================================
-- Supabase SQL Editor에서 실행하세요
-- Authentication > Users 에 있는 유저 기준으로 프로필 생성
-- =====================================================

DO $$
DECLARE
  v_owner_id      uuid;
  v_manager_id    uuid;
  v_worker_id     uuid;
  v_company_id    uuid := gen_random_uuid();
BEGIN

  -- auth.users에서 ID 가져오기 (.test 계정 우선, 없으면 .dev)
  SELECT id INTO v_owner_id   FROM auth.users 
    WHERE email IN ('owner@chapterworks.test','owner@chapterworks.dev') 
    ORDER BY created_at LIMIT 1;

  SELECT id INTO v_manager_id FROM auth.users 
    WHERE email IN ('manager@chapterworks.test','manager@chapterworks.dev') 
    ORDER BY created_at LIMIT 1;

  SELECT id INTO v_worker_id  FROM auth.users 
    WHERE email IN ('worker@chapterworks.test','worker@chapterworks.dev') 
    ORDER BY created_at LIMIT 1;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION '유저를 찾을 수 없습니다. Authentication > Users 확인 필요';
  END IF;

  -- 회사 생성
  INSERT INTO companies (id, name, business_number, phone, address, invite_code, owner_id)
  VALUES (
    v_company_id,
    '챕터웍스 인테리어',
    '123-45-67890',
    '02-1234-5678',
    '서울시 강남구 테헤란로 123',
    'CW2024',
    v_owner_id
  )
  ON CONFLICT DO NOTHING;

  -- 대표 프로필
  INSERT INTO user_profiles (id, company_id, name, role, is_active)
  VALUES (v_owner_id, v_company_id, '김대표', 'owner', true)
  ON CONFLICT (id) DO UPDATE SET company_id = v_company_id, role = 'owner', is_active = true;

  -- 팀장 프로필 (있을 때만)
  IF v_manager_id IS NOT NULL THEN
    INSERT INTO user_profiles (id, company_id, name, role, is_active)
    VALUES (v_manager_id, v_company_id, '이팀장', 'manager', true)
    ON CONFLICT (id) DO UPDATE SET company_id = v_company_id, role = 'manager', is_active = true;
  END IF;

  -- 기사 프로필 (있을 때만)
  IF v_worker_id IS NOT NULL THEN
    INSERT INTO user_profiles (id, company_id, name, role, is_active)
    VALUES (v_worker_id, v_company_id, '박기사', 'worker', true)
    ON CONFLICT (id) DO UPDATE SET company_id = v_company_id, role = 'worker', is_active = true;
  END IF;

  -- 샘플 현장
  INSERT INTO projects (company_id, name, address, client_name, client_phone, contract_amount, vat_type, status, start_date, end_date, created_by)
  VALUES
    (v_company_id, '강남 논현동 아파트 인테리어', '서울시 강남구 논현동 123-4', '홍길동', '010-1234-5678', 35000000, 'excluded', 'active', '2025-04-01', '2025-06-30', v_owner_id),
    (v_company_id, '마포 공덕동 사무실 리모델링', '서울시 마포구 공덕동 56-7', '김철수', '010-9876-5432', 28000000, 'excluded', 'active', '2025-05-01', '2025-07-31', v_owner_id),
    (v_company_id, '송파 잠실 카페 인테리어', '서울시 송파구 잠실동 89', '이영희', '010-5555-7777', 15000000, 'included', 'completed', '2025-02-01', '2025-03-31', v_owner_id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✅ 완료! company_id: %', v_company_id;
  RAISE NOTICE '✅ owner_id: %', v_owner_id;

END $$;
