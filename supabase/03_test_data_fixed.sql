DO $BODY$
DECLARE
  v_owner_id        UUID;
  v_manager_id      UUID;
  v_worker_id       UUID;
  v_company_id      UUID;
  v_proj1_id        UUID;
  v_proj2_id        UUID;
  v_proj3_id        UUID;
  v_acct_manager_id UUID;
  v_acct_worker_id  UUID;
BEGIN

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'owner@chapterworks.test') THEN
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'owner@chapterworks.test', crypt('Test1234!', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"kimowner"}'::jsonb, 'authenticated', 'authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'manager@chapterworks.test') THEN
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'manager@chapterworks.test', crypt('Test1234!', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"leemanager"}'::jsonb, 'authenticated', 'authenticated');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'worker@chapterworks.test') THEN
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, aud, role)
    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'worker@chapterworks.test', crypt('Test1234!', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"name":"parkworker"}'::jsonb, 'authenticated', 'authenticated');
  END IF;

  SELECT id INTO v_owner_id   FROM auth.users WHERE email = 'owner@chapterworks.test';
  SELECT id INTO v_manager_id FROM auth.users WHERE email = 'manager@chapterworks.test';
  SELECT id INTO v_worker_id  FROM auth.users WHERE email = 'worker@chapterworks.test';

  IF NOT EXISTS (SELECT 1 FROM companies WHERE invite_code = 'CWTEST01') THEN
    INSERT INTO companies (id, name, business_number, phone, address, invite_code, owner_id)
    VALUES (gen_random_uuid(), 'ChapterWorks Interior', '123-45-67890', '02-1234-5678', 'Seoul Gangnam', 'CWTEST01', v_owner_id);
  END IF;

  SELECT id INTO v_company_id FROM companies WHERE invite_code = 'CWTEST01';

  INSERT INTO user_profiles (id, company_id, name, phone, role) VALUES
    (v_owner_id,   v_company_id, 'Kim Owner',   '010-1111-0001', 'owner'),
    (v_manager_id, v_company_id, 'Lee Manager', '010-2222-0002', 'manager'),
    (v_worker_id,  v_company_id, 'Park Worker', '010-3333-0003', 'worker')
  ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id, name = EXCLUDED.name, role = EXCLUDED.role;

  IF NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Gangnam Apartment' AND company_id = v_company_id) THEN
    INSERT INTO projects (id, company_id, name, address, status, contract_amount, vat_type, start_date, end_date, client_name, client_phone, description, created_by)
    VALUES (gen_random_uuid(), v_company_id, 'Gangnam Apartment', 'Seoul Gangnam Samseong-dong 101-1', 'active', 85000000, 'excluded', '2025-04-01', '2025-06-30', 'Hong Gildong', '010-9999-0001', 'Living room, kitchen, 2 bedrooms full remodel', v_owner_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Songpa Officetel' AND company_id = v_company_id) THEN
    INSERT INTO projects (id, company_id, name, address, status, contract_amount, vat_type, start_date, end_date, client_name, client_phone, description, created_by)
    VALUES (gen_random_uuid(), v_company_id, 'Songpa Officetel', 'Seoul Songpa Jamsil-dong 200-5', 'active', 42000000, 'included', '2025-05-01', '2025-05-31', 'Lee Sunsin', '010-8888-0002', 'Studio full option interior', v_manager_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM projects WHERE name = 'Mapo Cafe' AND company_id = v_company_id) THEN
    INSERT INTO projects (id, company_id, name, address, status, contract_amount, vat_type, start_date, end_date, client_name, client_phone, description, created_by)
    VALUES (gen_random_uuid(), v_company_id, 'Mapo Cafe', 'Seoul Mapo Hongdae 55-3', 'completed', 120000000, 'excluded', '2025-02-01', '2025-03-31', 'Kang Gamchan', '010-7777-0003', 'Cafe full interior completed', v_owner_id);
  END IF;

  SELECT id INTO v_proj1_id FROM projects WHERE name = 'Gangnam Apartment' AND company_id = v_company_id;
  SELECT id INTO v_proj2_id FROM projects WHERE name = 'Songpa Officetel'  AND company_id = v_company_id;
  SELECT id INTO v_proj3_id FROM projects WHERE name = 'Mapo Cafe'         AND company_id = v_company_id;

  INSERT INTO daily_tasks (company_id, project_id, date, title, content, status, priority, assigned_to, created_by) VALUES
    (v_company_id, v_proj1_id, CURRENT_DATE,     'Tile work prep',        'Check tile materials delivery',        'todo',        'high',   v_worker_id,  v_manager_id),
    (v_company_id, v_proj1_id, CURRENT_DATE,     'Electrical inspection', 'Check wiring before light replacement','todo',        'normal', v_worker_id,  v_manager_id),
    (v_company_id, v_proj1_id, CURRENT_DATE - 1, 'Wallpaper done',        'Living room wallpaper complete',       'done',        'normal', v_worker_id,  v_worker_id),
    (v_company_id, v_proj2_id, CURRENT_DATE,     'Window schedule',       'Coordinate window install date',       'todo',        'high',   v_manager_id, v_manager_id),
    (v_company_id, NULL,       CURRENT_DATE,     'Material order check',  'Review next week material order list', 'todo',        'normal', v_manager_id, v_owner_id);

  INSERT INTO site_logs (company_id, project_id, date, process, workers_count, worker_names, work_content, special_notes, weather, created_by) VALUES
    (v_company_id, v_proj1_id, CURRENT_DATE,     'Demolition', 3, 'Park, Choi, Kim', 'Living room floor demolition complete. Moisture found.', 'Moisture barrier needed', 'Sunny', v_worker_id),
    (v_company_id, v_proj1_id, CURRENT_DATE - 1, 'Carpentry',  2, 'Park, Lee',       'Kitchen upper cabinet frame installed.',                  NULL,                      'Cloudy', v_worker_id),
    (v_company_id, v_proj2_id, CURRENT_DATE,     'Wallpaper',  2, 'Park, Jeon',      'All rooms base layer complete.',                          NULL,                      'Sunny', v_worker_id);

  INSERT INTO as_records (company_id, project_id, received_date, completed_date, status, content, resolution, client_name, client_phone, assigned_to, created_by) VALUES
    (v_company_id, v_proj3_id, CURRENT_DATE - 10, CURRENT_DATE - 5, 'completed',   'Cabinet door misaligned',   'Hinge adjusted and door replaced', 'Kang Gamchan', '010-7777-0003', v_worker_id, v_manager_id),
    (v_company_id, v_proj1_id, CURRENT_DATE - 2,  NULL,             'in_progress', 'Bathroom faucet leak',      'Site check, faucet replacement',   'Hong Gildong', '010-9999-0001', v_worker_id, v_manager_id),
    (v_company_id, v_proj2_id, CURRENT_DATE,       NULL,             'received',    'Front door lock malfunction','To be checked',                    'Lee Sunsin',   '010-8888-0002', NULL,        v_manager_id);

  INSERT INTO work_orders (company_id, project_id, title, content, status, priority, assigned_to, created_by, due_date) VALUES
    (v_company_id, v_proj1_id, 'Moisture barrier work',    'Moisture found in site log. Install moisture barrier and report.', 'unconfirmed', 'urgent', v_worker_id,  v_manager_id, CURRENT_DATE + 2),
    (v_company_id, v_proj1_id, 'Sink installation prep',   'Check sink delivery schedule. Re-verify pipe locations.',          'in_progress', 'high',   v_worker_id,  v_manager_id, CURRENT_DATE + 5),
    (v_company_id, v_proj2_id, 'Window install photo',     'After window install, submit 3+ site photos.',                     'unconfirmed', 'normal', v_worker_id,  v_owner_id,   CURRENT_DATE + 7),
    (v_company_id, NULL,       'May material cost submit', 'Compile all material purchase receipts for this month.',           'unconfirmed', 'high',   v_manager_id, v_owner_id,   CURRENT_DATE + 3);

  INSERT INTO cash_accounts (company_id, user_id, name, initial_balance, current_balance) VALUES
    (v_company_id, v_manager_id, 'Lee Manager Corp Card', 500000, 320000),
    (v_company_id, v_worker_id,  'Park Worker Cash',      200000, 85000)
  ON CONFLICT (company_id, user_id) DO NOTHING;

  SELECT id INTO v_acct_manager_id FROM cash_accounts WHERE company_id = v_company_id AND user_id = v_manager_id;
  SELECT id INTO v_acct_worker_id  FROM cash_accounts WHERE company_id = v_company_id AND user_id = v_worker_id;

  INSERT INTO transactions (company_id, project_id, cash_account_id, category, sub_category, type, amount, description, memo, transaction_date, is_site_expense, payment_method, created_by) VALUES
    (v_company_id, v_proj3_id, NULL,              'REVENUE', 'Construction', 'income',  60000000, 'Mapo Cafe 1st payment',       'Deposit 50%',   '2025-02-15',     false, 'transfer', v_owner_id),
    (v_company_id, v_proj3_id, NULL,              'REVENUE', 'Construction', 'income',  60000000, 'Mapo Cafe 2nd payment',       'Balance',       '2025-03-28',     false, 'transfer', v_owner_id),
    (v_company_id, v_proj1_id, NULL,              'REVENUE', 'Construction', 'income',  42500000, 'Gangnam Apt deposit',         'Contract 50%',  '2025-04-01',     false, 'transfer', v_owner_id),
    (v_company_id, v_proj3_id, NULL,              'COGS',    'Materials',    'expense', 35000000, 'Mapo Cafe materials total',   NULL,            '2025-03-15',     false, 'transfer', v_owner_id),
    (v_company_id, v_proj1_id, NULL,              'COGS',    'Materials',    'expense', 12000000, 'Gangnam Apt 1st materials',   NULL,            '2025-04-10',     false, 'transfer', v_owner_id),
    (v_company_id, v_proj1_id, NULL,              'COGS',    'Labor',        'expense',  8000000, 'Gangnam Apt April labor',     'Subcontract',   '2025-04-30',     false, 'transfer', v_owner_id),
    (v_company_id, v_proj1_id, v_acct_worker_id,  'COGS',    'Site expense', 'expense',    45000, 'Site lunch',                  '4 people',      CURRENT_DATE,     true,  'cash',     v_worker_id),
    (v_company_id, v_proj1_id, v_acct_worker_id,  'COGS',    'Site expense', 'expense',    28000, 'Material transport taxi',     NULL,            CURRENT_DATE,     true,  'cash',     v_worker_id),
    (v_company_id, v_proj2_id, v_acct_manager_id, 'COGS',    'Site expense', 'expense',    89000, 'Hardware store supplies',     'Screws, etc',   CURRENT_DATE - 1, true,  'card',     v_manager_id),
    (v_company_id, v_proj1_id, v_acct_manager_id, 'COGS',    'Site expense', 'expense',   120000, 'Evening meal for workers',    'Overtime meal', CURRENT_DATE - 1, true,  'cash',     v_manager_id),
    (v_company_id, NULL,       NULL,              'SGA',     'Office',       'expense',    35000, 'Printer paper purchase',      NULL,            CURRENT_DATE - 3, false, 'card',     v_owner_id),
    (v_company_id, NULL,       NULL,              'SGA',     'Telecom',      'expense',   110000, 'April corporate phone bill',  NULL,            '2025-04-25',     false, 'transfer', v_owner_id);

  INSERT INTO payments (company_id, project_id, title, amount, scheduled_date, received_date, status, memo, created_by) VALUES
    (v_company_id, v_proj1_id, 'Gangnam Apt 2nd payment', 42500000, CURRENT_DATE + 30, NULL,         'pending',  '70% progress milestone', v_owner_id),
    (v_company_id, v_proj1_id, 'Gangnam Apt balance',     85000000, CURRENT_DATE + 60, NULL,         'pending',  'After final inspection',  v_owner_id),
    (v_company_id, v_proj2_id, 'Songpa deposit',          21000000, '2025-05-01',      '2025-05-01', 'received', NULL,                      v_owner_id),
    (v_company_id, v_proj2_id, 'Songpa balance',          21000000, CURRENT_DATE + 10, NULL,         'pending',  NULL,                      v_owner_id),
    (v_company_id, v_proj3_id, 'Mapo Cafe final',          5000000, '2025-04-15',      NULL,         'overdue',  'AS pending hold',         v_owner_id);

END;
$BODY$ LANGUAGE plpgsql;

SELECT '=== Test data created ===' as result;

SELECT email, raw_user_meta_data->>'name' as name
FROM auth.users WHERE email LIKE '%chapterworks.test%' ORDER BY email;

SELECT
  (SELECT count(*)::text FROM user_profiles)  || ' users'        as staff,
  (SELECT count(*)::text FROM projects)        || ' projects'     as projects,
  (SELECT count(*)::text FROM daily_tasks)     || ' daily_tasks'  as daily_tasks,
  (SELECT count(*)::text FROM site_logs)       || ' site_logs'    as site_logs,
  (SELECT count(*)::text FROM as_records)      || ' as_records'   as as_records,
  (SELECT count(*)::text FROM work_orders)     || ' work_orders'  as work_orders,
  (SELECT count(*)::text FROM transactions)    || ' transactions' as transactions,
  (SELECT count(*)::text FROM payments)        || ' payments'     as payments;
