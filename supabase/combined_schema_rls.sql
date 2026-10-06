-- ============================================
-- Chapter Works - PART 1: Schema (테이블 생성)
-- Supabase SQL Editor에 붙여넣고 실행하세요
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. COMPANIES
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  business_number TEXT,
  phone TEXT,
  address TEXT,
  invite_code TEXT UNIQUE NOT NULL DEFAULT upper(substring(md5(random()::text), 1, 8)),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. USER PROFILES
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'worker')),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. PROJECTS (현장)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  access_code TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
  cover_image_url TEXT,
  contract_amount NUMERIC(15,2) DEFAULT 0,
  vat_type TEXT NOT NULL DEFAULT 'excluded' CHECK (vat_type IN ('included', 'excluded', 'none')),
  start_date DATE,
  end_date DATE,
  client_name TEXT,
  client_phone TEXT,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. DAILY TASKS (업무일지)
CREATE TABLE IF NOT EXISTS daily_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'done', 'deferred')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. SITE LOGS (현장일지)
CREATE TABLE IF NOT EXISTS site_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  process TEXT,
  workers_count INTEGER DEFAULT 0,
  worker_names TEXT,
  work_content TEXT NOT NULL,
  special_notes TEXT,
  weather TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. AS RECORDS (A/S 기록)
CREATE TABLE IF NOT EXISTS as_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_date DATE,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'in_progress', 'completed', 'cancelled')),
  content TEXT NOT NULL,
  resolution TEXT,
  client_name TEXT,
  client_phone TEXT,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. WORK ORDERS (업무지시)
CREATE TABLE IF NOT EXISTS work_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'unconfirmed' CHECK (status IN ('unconfirmed', 'in_progress', 'completed', 'on_hold')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  due_date DATE,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. WORK ORDER COMMENTS
CREATE TABLE IF NOT EXISTS work_order_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. CASH ACCOUNTS (시재)
CREATE TABLE IF NOT EXISTS cash_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  initial_balance NUMERIC(15,2) DEFAULT 0,
  current_balance NUMERIC(15,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- 10. TRANSACTIONS (거래내역)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  cash_account_id UUID REFERENCES cash_accounts(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('REVENUE', 'COGS', 'SGA', 'NON_OPERATING', 'TAX')),
  sub_category TEXT,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(15,2) NOT NULL,
  description TEXT NOT NULL,
  memo TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_site_expense BOOLEAN DEFAULT false,
  payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'transfer', 'other')),
  is_voided BOOLEAN DEFAULT false,
  void_reason TEXT,
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 11. PAYMENTS (결제 일정)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  scheduled_date DATE NOT NULL,
  received_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'overdue', 'cancelled')),
  memo TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 12. ATTACHMENTS
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  related_type TEXT NOT NULL CHECK (related_type IN ('site_log', 'daily_task', 'as_record', 'work_order', 'project', 'transaction')),
  related_id UUID NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_profiles_company_id ON user_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_company_id ON daily_tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_date ON daily_tasks(date);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_assigned_to ON daily_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_site_logs_company_id ON site_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_site_logs_project_id ON site_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_site_logs_date ON site_logs(date);
CREATE INDEX IF NOT EXISTS idx_as_records_company_id ON as_records(company_id);
CREATE INDEX IF NOT EXISTS idx_as_records_status ON as_records(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_company_id ON work_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_to ON work_orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_order_comments_work_order_id ON work_order_comments(work_order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_company_id ON transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_transactions_project_id ON transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_transactions_is_voided ON transactions(is_voided);
CREATE INDEX IF NOT EXISTS idx_payments_company_id ON payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_project_id ON payments(project_id);
CREATE INDEX IF NOT EXISTS idx_attachments_related ON attachments(related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_cash_accounts_company_id ON cash_accounts(company_id);

-- ============================================
-- TRIGGER FUNCTIONS
-- ============================================
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE OR REPLACE TRIGGER trigger_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE OR REPLACE TRIGGER trigger_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE OR REPLACE TRIGGER trigger_daily_tasks_updated_at BEFORE UPDATE ON daily_tasks FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE OR REPLACE TRIGGER trigger_site_logs_updated_at BEFORE UPDATE ON site_logs FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE OR REPLACE TRIGGER trigger_as_records_updated_at BEFORE UPDATE ON as_records FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE OR REPLACE TRIGGER trigger_work_orders_updated_at BEFORE UPDATE ON work_orders FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE OR REPLACE TRIGGER trigger_work_order_comments_updated_at BEFORE UPDATE ON work_order_comments FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE OR REPLACE TRIGGER trigger_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE OR REPLACE TRIGGER trigger_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE OR REPLACE TRIGGER trigger_cash_accounts_updated_at BEFORE UPDATE ON cash_accounts FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- CASH BALANCE AUTO UPDATE
CREATE OR REPLACE FUNCTION update_cash_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT NEW.is_voided THEN
    IF NEW.type = 'expense' AND NEW.cash_account_id IS NOT NULL THEN
      UPDATE cash_accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.cash_account_id;
    ELSIF NEW.type = 'income' AND NEW.cash_account_id IS NOT NULL THEN
      UPDATE cash_accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.cash_account_id;
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_voided AND NOT OLD.is_voided THEN
    IF OLD.type = 'expense' AND OLD.cash_account_id IS NOT NULL THEN
      UPDATE cash_accounts SET current_balance = current_balance + OLD.amount WHERE id = OLD.cash_account_id;
    ELSIF OLD.type = 'income' AND OLD.cash_account_id IS NOT NULL THEN
      UPDATE cash_accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.cash_account_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trigger_update_cash_balance
  AFTER INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_cash_balance();

-- 완료 확인
SELECT 'PART 1 완료: 테이블 ' || count(*) || '개 생성됨' as result
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
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

CREATE POLICY "as_records_select" ON as_records
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY "as_records_insert" ON as_records
  FOR INSERT WITH CHECK (company_id = get_my_company_id() AND created_by = auth.uid());

CREATE POLICY "as_records_update" ON as_records
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND (created_by = auth.uid() OR assigned_to = auth.uid() OR is_owner_or_manager())
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
