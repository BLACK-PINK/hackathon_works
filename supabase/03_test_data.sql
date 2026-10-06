-- ============================================
-- Chapter Works - PART 3: 테스트 데이터
-- Supabase SQL Editor에 붙여넣고 실행하세요
-- (PART 1, 2 실행 완료 후 실행)
-- ⚠️  실제 고객/직원/재무 정보 없음 - 개발 테스트용 가상 데이터
-- ============================================

-- ============================================
-- STEP 1: 테스트 유저 3명 생성 (Auth)
-- ============================================
-- 아래 함수로 auth.users에 직접 삽입합니다

DO $$
DECLARE
  v_owner_id    UUID := gen_random_uuid();
  v_manager_id  UUID := gen_random_uuid();
  v_worker_id   UUID := gen_random_uuid();
  v_company_id  UUID := gen_random_uuid();
BEGIN

  -- ① auth.users 에 테스트 계정 삽입
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    aud, role
  ) VALUES
  (
    v_owner_id,
    '00000000-0000-0000-0000-000000000000',
    'owner@chapterworks.test',
    crypt('Test1234!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"김대표"}'::jsonb,
    'authenticated', 'authenticated'
  ),
  (
    v_manager_id,
    '00000000-0000-0000-0000-000000000000',
    'manager@chapterworks.test',
    crypt('Test1234!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"이팀장"}'::jsonb,
    'authenticated', 'authenticated'
  ),
  (
    v_worker_id,
    '00000000-0000-0000-0000-000000000000',
    'worker@chapterworks.test',
    crypt('Test1234!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"박기사"}'::jsonb,
    'authenticated', 'authenticated'
  )
  ON CONFLICT (email) DO NOTHING;

  -- 실제 삽입된 ID 재조회 (이미 있을 경우 대비)
  SELECT id INTO v_owner_id   FROM auth.users WHERE email = 'owner@chapterworks.test';
  SELECT id INTO v_manager_id FROM auth.users WHERE email = 'manager@chapterworks.test';
  SELECT id INTO v_worker_id  FROM auth.users WHERE email = 'worker@chapterworks.test';

  -- ② 회사 생성
  INSERT INTO companies (id, name, business_number, phone, address, invite_code, owner_id)
  VALUES (
    v_company_id,
    '챕터웍스 인테리어',
    '123-45-67890',
    '02-1234-5678',
    '서울시 강남구 테헤란로 123',
    'CWTEST01',
    v_owner_id
  )
  ON CONFLICT DO NOTHING;

  -- ③ user_profiles 생성
  INSERT INTO user_profiles (id, company_id, name, phone, role)
  VALUES
    (v_owner_id,   v_company_id, '김대표', '010-1111-0001', 'owner'),
    (v_manager_id, v_company_id, '이팀장', '010-2222-0002', 'manager'),
    (v_worker_id,  v_company_id, '박기사', '010-3333-0003', 'worker')
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    name = EXCLUDED.name,
    role = EXCLUDED.role;

  -- ④ 현장(projects) 3개 생성
  INSERT INTO projects (
    id, company_id, name, address, status,
    contract_amount, vat_type, start_date, end_date,
    client_name, client_phone, description, created_by
  ) VALUES
  (
    gen_random_uuid(), v_company_id,
    '강남 아파트 인테리어',
    '서울시 강남구 삼성동 101-1',
    'active',
    85000000, 'excluded',
    '2025-04-01', '2025-06-30',
    '홍길동', '010-9999-0001',
    '거실, 주방, 침실 2개 전체 리모델링',
    v_owner_id
  ),
  (
    gen_random_uuid(), v_company_id,
    '송파 오피스텔 시공',
    '서울시 송파구 잠실동 200-5',
    'active',
    42000000, 'included',
    '2025-05-01', '2025-05-31',
    '이순신', '010-8888-0002',
    '원룸 풀옵션 인테리어',
    v_manager_id
  ),
  (
    gen_random_uuid(), v_company_id,
    '마포 카페 인테리어',
    '서울시 마포구 홍대입구 55-3',
    'completed',
    120000000, 'excluded',
    '2025-02-01', '2025-03-31',
    '강감찬', '010-7777-0003',
    '카페 내부 전체 인테리어 공사 완료',
    v_owner_id
  );

  -- 변수용 project_id 조회
  DECLARE
    v_proj1_id UUID;
    v_proj2_id UUID;
    v_proj3_id UUID;
  BEGIN
    SELECT id INTO v_proj1_id FROM projects WHERE name = '강남 아파트 인테리어' AND company_id = v_company_id;
    SELECT id INTO v_proj2_id FROM projects WHERE name = '송파 오피스텔 시공'    AND company_id = v_company_id;
    SELECT id INTO v_proj3_id FROM projects WHERE name = '마포 카페 인테리어'    AND company_id = v_company_id;

    -- ⑤ 업무일지 (daily_tasks)
    INSERT INTO daily_tasks (company_id, project_id, date, title, content, status, priority, assigned_to, created_by)
    VALUES
      (v_company_id, v_proj1_id, CURRENT_DATE,     '타일 시공 준비',       '욕실 타일 자재 입고 확인 및 배치',           'todo',     'high',   v_worker_id,  v_manager_id),
      (v_company_id, v_proj1_id, CURRENT_DATE,     '전기 배선 점검',       '조명 교체 전 기존 배선 상태 확인',           'in_progress' , 'normal', v_worker_id, v_manager_id),
      (v_company_id, v_proj1_id, CURRENT_DATE - 1, '도배 완료 보고',       '거실 도배 작업 완료 / 하자 없음',            'done',     'normal', v_worker_id,  v_worker_id),
      (v_company_id, v_proj2_id, CURRENT_DATE,     '창호 설치 일정 조율',  '창호 업체와 설치 날짜 협의',                 'todo',     'high',   v_manager_id, v_manager_id),
      (v_company_id, NULL,       CURRENT_DATE,     '자재 발주 확인',       '다음 주 현장 자재 발주 리스트 검토',         'todo',     'normal', v_manager_id, v_owner_id);

    -- ⑥ 현장일지 (site_logs)
    INSERT INTO site_logs (company_id, project_id, date, process, workers_count, worker_names, work_content, special_notes, weather, created_by)
    VALUES
      (v_company_id, v_proj1_id, CURRENT_DATE,     '철거',   3, '박기사, 최씨, 김씨', '거실 기존 바닥재 철거 완료. 하부 습기 발견.', '하부 방습 처리 필요 — 자재 추가 발주 예정', '맑음', v_worker_id),
      (v_company_id, v_proj1_id, CURRENT_DATE - 1, '목공',   2, '박기사, 이씨',       '주방 상부장 프레임 설치 완료.',               NULL,                                        '흐림', v_worker_id),
      (v_company_id, v_proj2_id, CURRENT_DATE,     '도배',   2, '박기사, 전씨',       '전 실 초배 완료, 정배 내일 예정.',            NULL,                                        '맑음', v_worker_id);

    -- ⑦ A/S 기록 (as_records)
    INSERT INTO as_records (company_id, project_id, received_date, completed_date, status, content, resolution, client_name, client_phone, assigned_to, created_by)
    VALUES
      (v_company_id, v_proj3_id, CURRENT_DATE - 10, CURRENT_DATE - 5, 'completed',
       '카운터 하부장 문짝 틀어짐', '힌지 재조정 및 문짝 교체 완료', '강감찬', '010-7777-0003', v_worker_id, v_manager_id),
      (v_company_id, v_proj1_id, CURRENT_DATE - 2, NULL, 'in_progress',
       '욕실 수전 누수 의심', '현장 확인 후 수전 교체 예정', '홍길동', '010-9999-0001', v_worker_id, v_manager_id),
      (v_company_id, v_proj2_id, CURRENT_DATE, NULL, 'received',
       '현관 중문 잠금장치 불량', '확인 예정', '이순신', '010-8888-0002', NULL, v_manager_id);

    -- ⑧ 업무지시 (work_orders)
    INSERT INTO work_orders (company_id, project_id, title, content, status, priority, assigned_to, created_by, due_date)
    VALUES
      (v_company_id, v_proj1_id,
       '욕실 방습 처리 추가 시공',
       '현장일지 확인 — 하부 습기 발견. 방습 필름 추가 시공 후 보고 바람.',
       'unconfirmed', 'urgent', v_worker_id, v_manager_id, CURRENT_DATE + 2),
      (v_company_id, v_proj1_id,
       '주방 싱크대 설치 준비',
       '싱크대 입고 일정 확인 후 설치 준비. 배관 위치 재확인 필수.',
       'in_progress', 'high', v_worker_id, v_manager_id, CURRENT_DATE + 5),
      (v_company_id, v_proj2_id,
       '창호 설치 완료 후 사진 보고',
       '창호 설치 완료 시 현장 사진 3장 이상 첨부하여 보고.',
       'unconfirmed', 'normal', v_worker_id, v_owner_id, CURRENT_DATE + 7),
      (v_company_id, NULL,
       '5월 자재비 정산 자료 제출',
       '이번 달 자재 구매 영수증 전체 정리 후 제출.',
       'unconfirmed', 'high', v_manager_id, v_owner_id, CURRENT_DATE + 3);

    -- ⑨ 시재 계좌 (cash_accounts)
    INSERT INTO cash_accounts (company_id, user_id, name, initial_balance, current_balance)
    VALUES
      (v_company_id, v_manager_id, '이팀장 법인카드', 500000, 320000),
      (v_company_id, v_worker_id,  '박기사 현금',     200000, 85000)
    ON CONFLICT (company_id, user_id) DO NOTHING;

    DECLARE
      v_acct_manager_id UUID;
      v_acct_worker_id  UUID;
    BEGIN
      SELECT id INTO v_acct_manager_id FROM cash_accounts WHERE company_id = v_company_id AND user_id = v_manager_id;
      SELECT id INTO v_acct_worker_id  FROM cash_accounts WHERE company_id = v_company_id AND user_id = v_worker_id;

      -- ⑩ 거래내역 (transactions)
      INSERT INTO transactions (
        company_id, project_id, cash_account_id,
        category, sub_category, type, amount, description, memo,
        transaction_date, is_site_expense, payment_method, created_by
      ) VALUES
      -- 매출 (owner만 조회 가능)
      (v_company_id, v_proj3_id, NULL, 'REVENUE', '공사대금', 'income',  60000000, '마포 카페 1차 기성금',      '계약금 50%',    '2025-02-15', false, 'transfer', v_owner_id),
      (v_company_id, v_proj3_id, NULL, 'REVENUE', '공사대금', 'income',  60000000, '마포 카페 2차 기성금',      '잔금',          '2025-03-28', false, 'transfer', v_owner_id),
      (v_company_id, v_proj1_id, NULL, 'REVENUE', '공사대금', 'income',  42500000, '강남 아파트 계약금',        '계약 50%',      '2025-04-01', false, 'transfer', v_owner_id),

      -- 매출원가 (owner만 조회 가능)
      (v_company_id, v_proj3_id, NULL, 'COGS', '자재비', 'expense', 35000000, '마포 카페 자재비 합계',     NULL,            '2025-03-15', false, 'transfer', v_owner_id),
      (v_company_id, v_proj1_id, NULL, 'COGS', '자재비', 'expense', 12000000, '강남 아파트 1차 자재비',    NULL,            '2025-04-10', false, 'transfer', v_owner_id),
      (v_company_id, v_proj1_id, NULL, 'COGS', '노무비', 'expense',  8000000, '강남 아파트 4월 노무비',    '외주팀 지급',   '2025-04-30', false, 'transfer', v_owner_id),

      -- 현장경비 (모두 조회 가능) — is_site_expense = true
      (v_company_id, v_proj1_id, v_acct_worker_id,  'COGS', '현장경비', 'expense',  45000, '현장 점심식대',             '4명',           CURRENT_DATE,     true, 'cash',     v_worker_id),
      (v_company_id, v_proj1_id, v_acct_worker_id,  'COGS', '현장경비', 'expense',  28000, '자재 운반 택시비',          NULL,            CURRENT_DATE,     true, 'cash',     v_worker_id),
      (v_company_id, v_proj2_id, v_acct_manager_id, 'COGS', '현장경비', 'expense',  89000, '철물점 소모품 구매',        '나사, 실리콘 등', CURRENT_DATE - 1, true, 'card',     v_manager_id),
      (v_company_id, v_proj1_id, v_acct_manager_id, 'COGS', '현장경비', 'expense', 120000, '현장 인부 식대 (저녁)',     '야근 특식',     CURRENT_DATE - 1, true, 'cash',     v_manager_id),

      -- 판관비 (owner만 조회 가능)
      (v_company_id, NULL, NULL, 'SGA', '사무용품', 'expense',   35000, '프린터 용지 구매',          NULL,            CURRENT_DATE - 3, false, 'card',     v_owner_id),
      (v_company_id, NULL, NULL, 'SGA', '통신비',   'expense',  110000, '4월 법인 휴대폰 요금',      NULL,            '2025-04-25',     false, 'transfer', v_owner_id);

      -- ⑪ 결제 일정 (payments)
      INSERT INTO payments (company_id, project_id, title, amount, scheduled_date, received_date, status, memo, created_by)
      VALUES
        (v_company_id, v_proj1_id, '강남 아파트 2차 기성금',  42500000, CURRENT_DATE + 30, NULL,           'pending',  '공정률 70% 달성 후', v_owner_id),
        (v_company_id, v_proj1_id, '강남 아파트 잔금',        85000000, CURRENT_DATE + 60, NULL,           'pending',  '준공 검사 후',       v_owner_id),
        (v_company_id, v_proj2_id, '송파 오피스텔 계약금',    21000000, '2025-05-01',      '2025-05-01',   'received', NULL,                 v_owner_id),
        (v_company_id, v_proj2_id, '송파 오피스텔 잔금',      21000000, CURRENT_DATE + 10, NULL,           'pending',  NULL,                 v_owner_id),
        (v_company_id, v_proj3_id, '마포 카페 최종 정산',      5000000, '2025-04-15',      NULL,           'overdue',  '추가 공사 하자보수 보류', v_owner_id);

    END;
  END;

END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 결과 확인
-- ============================================
SELECT '=== 테스트 데이터 생성 완료 ===' as result;

SELECT '테스트 계정' as category, email, raw_user_meta_data->>'name' as name
FROM auth.users
WHERE email LIKE '%chapterworks.test%'
ORDER BY email;

SELECT '회사' as category, name, invite_code FROM companies WHERE name = '챕터웍스 인테리어';

SELECT '현장' as category, name, status, contract_amount FROM projects WHERE name IN ('강남 아파트 인테리어','송파 오피스텔 시공','마포 카페 인테리어');

SELECT
  '데이터 현황' as category,
  (SELECT count(*) FROM user_profiles)::text       || '명' as 직원,
  (SELECT count(*) FROM projects)::text             || '개' as 현장,
  (SELECT count(*) FROM daily_tasks)::text          || '건' as 업무일지,
  (SELECT count(*) FROM site_logs)::text            || '건' as 현장일지,
  (SELECT count(*) FROM as_records)::text           || '건' as AS,
  (SELECT count(*) FROM work_orders)::text          || '건' as 업무지시,
  (SELECT count(*) FROM transactions)::text         || '건' as 거래내역,
  (SELECT count(*) FROM payments)::text             || '건' as 결제일정;
