-- ============================================
-- Chapter Works - PART 2: RLS 정책
-- Supabase SQL Editor에 붙여넣고 실행하세요
-- (PART 1 실행 완료 후 실행)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE as_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'owner'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_owner_or_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('owner', 'manager')
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- COMPANIES
-- ============================================
DROP POLICY IF EXISTS "companies_select" ON companies;
DROP POLICY IF EXISTS "companies_insert" ON companies;
DROP POLICY IF EXISTS "companies_update" ON companies;

CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (id = get_my_company_id());

CREATE POLICY "companies_insert" ON companies
  FOR INSERT WITH CHECK (true);

CREATE POLICY "companies_update" ON companies
  FOR UPDATE USING (id = get_my_company_id() AND is_owner());

-- ============================================
-- USER PROFILES
-- ============================================
DROP POLICY IF EXISTS "user_profiles_select" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update" ON user_profiles;

CREATE POLICY "user_profiles_select" ON user_profiles
  FOR SELECT USING (company_id = get_my_company_id() OR id = auth.uid());

CREATE POLICY "user_profiles_insert" ON user_profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "user_profiles_update" ON user_profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR (company_id = get_my_company_id() AND is_owner())
  );

-- ============================================
-- PROJECTS
-- ============================================
DROP POLICY IF EXISTS "projects_select" ON projects;
DROP POLICY IF EXISTS "projects_insert" ON projects;
DROP POLICY IF EXISTS "projects_update" ON projects;
DROP POLICY IF EXISTS "projects_delete" ON projects;

CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (company_id = get_my_company_id() AND is_owner_or_manager());

CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (company_id = get_my_company_id() AND is_owner_or_manager());

CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (company_id = get_my_company_id() AND is_owner());

-- ============================================
-- DAILY TASKS
-- ============================================
DROP POLICY IF EXISTS "daily_tasks_select" ON daily_tasks;
DROP POLICY IF EXISTS "daily_tasks_insert" ON daily_tasks;
DROP POLICY IF EXISTS "daily_tasks_update" ON daily_tasks;
DROP POLICY IF EXISTS "daily_tasks_delete" ON daily_tasks;

CREATE POLICY "daily_tasks_select" ON daily_tasks
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY "daily_tasks_insert" ON daily_tasks
  FOR INSERT WITH CHECK (company_id = get_my_company_id() AND created_by = auth.uid());

CREATE POLICY "daily_tasks_update" ON daily_tasks
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND (created_by = auth.uid() OR assigned_to = auth.uid() OR is_owner_or_manager())
  );

CREATE POLICY "daily_tasks_delete" ON daily_tasks
  FOR DELETE USING (company_id = get_my_company_id() AND (created_by = auth.uid() OR is_owner()));

-- ============================================
-- SITE LOGS
-- ============================================
DROP POLICY IF EXISTS "site_logs_select" ON site_logs;
DROP POLICY IF EXISTS "site_logs_insert" ON site_logs;
DROP POLICY IF EXISTS "site_logs_update" ON site_logs;
DROP POLICY IF EXISTS "site_logs_delete" ON site_logs;

CREATE POLICY "site_logs_select" ON site_logs
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY "site_logs_insert" ON site_logs
  FOR INSERT WITH CHECK (company_id = get_my_company_id() AND created_by = auth.uid());

CREATE POLICY "site_logs_update" ON site_logs
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND (created_by = auth.uid() OR is_owner_or_manager())
  );

CREATE POLICY "site_logs_delete" ON site_logs
  FOR DELETE USING (company_id = get_my_company_id() AND (created_by = auth.uid() OR is_owner()));

-- ============================================
-- AS RECORDS
-- ============================================
DROP POLICY IF EXISTS "as_records_select" ON as_records;
DROP POLICY IF EXISTS "as_records_insert" ON as_records;
DROP POLICY IF EXISTS "as_records_update" ON as_records;
DROP POLICY IF EXISTS "as_records_delete" ON as_records;

CREATE POLICY "as_records_select" ON as_records
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY "as_records_insert" ON as_records
  FOR INSERT WITH CHECK (company_id = get_my_company_id() AND created_by = auth.uid());

CREATE POLICY "as_records_update" ON as_records
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND (created_by = auth.uid() OR assigned_to = auth.uid() OR is_owner_or_manager())
  );

CREATE POLICY "as_records_delete" ON as_records
  FOR DELETE USING (
    company_id = get_my_company_id()
    AND (created_by = auth.uid() OR is_owner_or_manager())
  );

-- ============================================
-- WORK ORDERS
-- ============================================
DROP POLICY IF EXISTS "work_orders_select" ON work_orders;
DROP POLICY IF EXISTS "work_orders_insert" ON work_orders;
DROP POLICY IF EXISTS "work_orders_update" ON work_orders;
DROP POLICY IF EXISTS "work_orders_delete" ON work_orders;

CREATE POLICY "work_orders_select" ON work_orders
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND (created_by = auth.uid() OR assigned_to = auth.uid() OR is_owner_or_manager())
  );

CREATE POLICY "work_orders_insert" ON work_orders
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id() AND is_owner_or_manager() AND created_by = auth.uid()
  );

CREATE POLICY "work_orders_update" ON work_orders
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND (created_by = auth.uid() OR assigned_to = auth.uid() OR is_owner_or_manager())
  );

CREATE POLICY "work_orders_delete" ON work_orders
  FOR DELETE USING (company_id = get_my_company_id() AND (created_by = auth.uid() OR is_owner()));

-- ============================================
-- WORK ORDER COMMENTS
-- ============================================
DROP POLICY IF EXISTS "work_order_comments_select" ON work_order_comments;
DROP POLICY IF EXISTS "work_order_comments_insert" ON work_order_comments;
DROP POLICY IF EXISTS "work_order_comments_update" ON work_order_comments;
DROP POLICY IF EXISTS "work_order_comments_delete" ON work_order_comments;

CREATE POLICY "work_order_comments_select" ON work_order_comments
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY "work_order_comments_insert" ON work_order_comments
  FOR INSERT WITH CHECK (company_id = get_my_company_id() AND created_by = auth.uid());

CREATE POLICY "work_order_comments_update" ON work_order_comments
  FOR UPDATE USING (company_id = get_my_company_id() AND created_by = auth.uid());

CREATE POLICY "work_order_comments_delete" ON work_order_comments
  FOR DELETE USING (
    company_id = get_my_company_id()
    AND (created_by = auth.uid() OR is_owner_or_manager())
  );

-- ============================================
-- CASH ACCOUNTS
-- ============================================
DROP POLICY IF EXISTS "cash_accounts_select" ON cash_accounts;
DROP POLICY IF EXISTS "cash_accounts_insert" ON cash_accounts;
DROP POLICY IF EXISTS "cash_accounts_update" ON cash_accounts;

CREATE POLICY "cash_accounts_select" ON cash_accounts
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND (user_id = auth.uid() OR is_owner_or_manager())
  );

CREATE POLICY "cash_accounts_insert" ON cash_accounts
  FOR INSERT WITH CHECK (company_id = get_my_company_id() AND (user_id = auth.uid() OR is_owner()));

CREATE POLICY "cash_accounts_update" ON cash_accounts
  FOR UPDATE USING (company_id = get_my_company_id() AND (user_id = auth.uid() OR is_owner()));

-- ============================================
-- TRANSACTIONS
-- ============================================
DROP POLICY IF EXISTS "transactions_select" ON transactions;
DROP POLICY IF EXISTS "transactions_insert" ON transactions;
DROP POLICY IF EXISTS "transactions_update" ON transactions;

CREATE POLICY "transactions_select" ON transactions
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND (
      is_owner()
      OR (is_site_expense = true AND NOT is_voided)
      OR cash_account_id IN (SELECT id FROM cash_accounts WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "transactions_insert" ON transactions
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND created_by = auth.uid()
    AND (is_site_expense = true OR is_owner_or_manager())
  );

CREATE POLICY "transactions_update" ON transactions
  FOR UPDATE USING (company_id = get_my_company_id() AND is_owner());

-- ============================================
-- PAYMENTS
-- ============================================
DROP POLICY IF EXISTS "payments_select" ON payments;
DROP POLICY IF EXISTS "payments_insert" ON payments;
DROP POLICY IF EXISTS "payments_update" ON payments;
DROP POLICY IF EXISTS "payments_delete" ON payments;

CREATE POLICY "payments_select" ON payments
  FOR SELECT USING (company_id = get_my_company_id() AND is_owner_or_manager());

CREATE POLICY "payments_insert" ON payments
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id() AND is_owner_or_manager() AND created_by = auth.uid()
  );

CREATE POLICY "payments_update" ON payments
  FOR UPDATE USING (company_id = get_my_company_id() AND is_owner_or_manager());

CREATE POLICY "payments_delete" ON payments
  FOR DELETE USING (company_id = get_my_company_id() AND is_owner());

-- ============================================
-- ATTACHMENTS
-- ============================================
DROP POLICY IF EXISTS "attachments_select" ON attachments;
DROP POLICY IF EXISTS "attachments_insert" ON attachments;
DROP POLICY IF EXISTS "attachments_delete" ON attachments;

CREATE POLICY "attachments_select" ON attachments
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY "attachments_insert" ON attachments
  FOR INSERT WITH CHECK (company_id = get_my_company_id() AND uploaded_by = auth.uid());

CREATE POLICY "attachments_delete" ON attachments
  FOR DELETE USING (
    company_id = get_my_company_id()
    AND (uploaded_by = auth.uid() OR is_owner_or_manager())
  );

-- ============================================
-- STORAGE BUCKET & RLS
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chapter-works',
  'chapter-works',
  false,
  52428800,  -- 50MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "storage_select" ON storage.objects;
DROP POLICY IF EXISTS "storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_delete" ON storage.objects;

CREATE POLICY "storage_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'chapter-works' AND auth.role() = 'authenticated');

CREATE POLICY "storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chapter-works' AND auth.role() = 'authenticated');

CREATE POLICY "storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'chapter-works'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 완료 확인
SELECT 'PART 2 완료: RLS 정책 적용됨' as result;
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
