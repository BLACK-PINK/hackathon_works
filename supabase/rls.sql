-- ============================================
-- Chapter Works - RLS Policies
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

-- 현재 사용자의 company_id 반환
CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS UUID AS $$
  SELECT company_id FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 현재 사용자의 role 반환
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 현재 사용자가 owner인지 확인
CREATE OR REPLACE FUNCTION is_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() AND role = 'owner'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 현재 사용자가 owner 또는 manager인지 확인
CREATE OR REPLACE FUNCTION is_owner_or_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles 
    WHERE id = auth.uid() AND role IN ('owner', 'manager')
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- COMPANIES
-- ============================================
CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (
    id = get_my_company_id()
  );

CREATE POLICY "companies_insert" ON companies
  FOR INSERT WITH CHECK (true); -- 회원가입 시 생성 허용

CREATE POLICY "companies_update" ON companies
  FOR UPDATE USING (
    id = get_my_company_id() AND is_owner()
  );

-- ============================================
-- USER PROFILES
-- ============================================
CREATE POLICY "user_profiles_select" ON user_profiles
  FOR SELECT USING (
    company_id = get_my_company_id()
    OR id = auth.uid()
  );

CREATE POLICY "user_profiles_insert" ON user_profiles
  FOR INSERT WITH CHECK (
    id = auth.uid() -- 본인 프로필만 생성
  );

CREATE POLICY "user_profiles_update" ON user_profiles
  FOR UPDATE USING (
    id = auth.uid() -- 본인 프로필만 수정
    OR (company_id = get_my_company_id() AND is_owner()) -- 대표는 소속 직원 수정 가능
  );

-- ============================================
-- PROJECTS (현장)
-- ============================================
CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (
    company_id = get_my_company_id()
  );

CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND is_owner_or_manager()
  );

CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND is_owner_or_manager()
  );

CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (
    company_id = get_my_company_id()
    AND is_owner()
  );

-- ============================================
-- DAILY TASKS (업무일지)
-- ============================================
CREATE POLICY "daily_tasks_select" ON daily_tasks
  FOR SELECT USING (
    company_id = get_my_company_id()
  );

CREATE POLICY "daily_tasks_insert" ON daily_tasks
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "daily_tasks_update" ON daily_tasks
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND (
      created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR is_owner_or_manager()
    )
  );

CREATE POLICY "daily_tasks_delete" ON daily_tasks
  FOR DELETE USING (
    company_id = get_my_company_id()
    AND (created_by = auth.uid() OR is_owner())
  );

-- ============================================
-- SITE LOGS (현장일지)
-- ============================================
CREATE POLICY "site_logs_select" ON site_logs
  FOR SELECT USING (
    company_id = get_my_company_id()
  );

CREATE POLICY "site_logs_insert" ON site_logs
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "site_logs_update" ON site_logs
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND (created_by = auth.uid() OR is_owner_or_manager())
  );

CREATE POLICY "site_logs_delete" ON site_logs
  FOR DELETE USING (
    company_id = get_my_company_id()
    AND (created_by = auth.uid() OR is_owner())
  );

-- ============================================
-- AS RECORDS (A/S 기록)
-- ============================================
CREATE POLICY "as_records_select" ON as_records
  FOR SELECT USING (
    company_id = get_my_company_id()
  );

CREATE POLICY "as_records_insert" ON as_records
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "as_records_update" ON as_records
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND (
      created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR is_owner_or_manager()
    )
  );

-- ============================================
-- WORK ORDERS (업무지시)
-- ============================================
CREATE POLICY "work_orders_select" ON work_orders
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND (
      created_by = auth.uid()      -- 내가 지시한 일
      OR assigned_to = auth.uid()  -- 내가 받은 일
      OR is_owner_or_manager()     -- 대표/팀장은 전체 조회
    )
  );

CREATE POLICY "work_orders_insert" ON work_orders
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND is_owner_or_manager()
    AND created_by = auth.uid()
  );

CREATE POLICY "work_orders_update" ON work_orders
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND (
      created_by = auth.uid()
      OR assigned_to = auth.uid()  -- 현장기사: 상태 변경
      OR is_owner_or_manager()
    )
  );

CREATE POLICY "work_orders_delete" ON work_orders
  FOR DELETE USING (
    company_id = get_my_company_id()
    AND (created_by = auth.uid() OR is_owner())
  );

-- ============================================
-- WORK ORDER COMMENTS (댓글)
-- ============================================
CREATE POLICY "work_order_comments_select" ON work_order_comments
  FOR SELECT USING (
    company_id = get_my_company_id()
  );

CREATE POLICY "work_order_comments_insert" ON work_order_comments
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "work_order_comments_update" ON work_order_comments
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND created_by = auth.uid()
  );

CREATE POLICY "work_order_comments_delete" ON work_order_comments
  FOR DELETE USING (
    company_id = get_my_company_id()
    AND (created_by = auth.uid() OR is_owner_or_manager())
  );

-- ============================================
-- CASH ACCOUNTS (시재)
-- ============================================
-- 본인 시재 + 대표/팀장은 전체 조회
CREATE POLICY "cash_accounts_select" ON cash_accounts
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND (user_id = auth.uid() OR is_owner_or_manager())
  );

CREATE POLICY "cash_accounts_insert" ON cash_accounts
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND (user_id = auth.uid() OR is_owner())
  );

CREATE POLICY "cash_accounts_update" ON cash_accounts
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND (user_id = auth.uid() OR is_owner())
  );

-- ============================================
-- TRANSACTIONS (거래내역)
-- ============================================

-- 현장 경비(is_site_expense=true): 전체 구성원 조회 가능
-- 재무 전체(is_site_expense=false): 대표만 조회 가능
CREATE POLICY "transactions_select" ON transactions
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND (
      is_owner()                                   -- 대표: 전체 조회
      OR (
        is_site_expense = true                     -- 현장 경비: 모두 조회
        AND NOT is_voided
      )
      OR cash_account_id IN (                      -- 본인 시재 거래 조회
        SELECT id FROM cash_accounts WHERE user_id = auth.uid()
      )
    )
  );

-- 현장 경비 입력: 모든 역할 가능
-- 재무 입력: 대표/팀장만 가능
CREATE POLICY "transactions_insert" ON transactions
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND created_by = auth.uid()
    AND (
      is_site_expense = true         -- 현장 경비: 모두 입력 가능
      OR is_owner_or_manager()       -- 재무: 대표/팀장만
    )
  );

-- 취소 처리: 대표만 가능
CREATE POLICY "transactions_update" ON transactions
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND is_owner()
  );

-- 삭제 불가 (취소 처리로 대체)
-- DELETE 정책 없음 = 삭제 불가

-- ============================================
-- PAYMENTS (결제 일정)
-- ============================================
-- 대표/팀장만 결제 일정 조회 및 관리
CREATE POLICY "payments_select" ON payments
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND is_owner_or_manager()
  );

CREATE POLICY "payments_insert" ON payments
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND is_owner_or_manager()
    AND created_by = auth.uid()
  );

CREATE POLICY "payments_update" ON payments
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND is_owner_or_manager()
  );

CREATE POLICY "payments_delete" ON payments
  FOR DELETE USING (
    company_id = get_my_company_id()
    AND is_owner()
  );

-- ============================================
-- ATTACHMENTS (첨부파일)
-- ============================================
CREATE POLICY "attachments_select" ON attachments
  FOR SELECT USING (
    company_id = get_my_company_id()
  );

CREATE POLICY "attachments_insert" ON attachments
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "attachments_delete" ON attachments
  FOR DELETE USING (
    company_id = get_my_company_id()
    AND (uploaded_by = auth.uid() OR is_owner_or_manager())
  );

-- ============================================
-- STORAGE BUCKET POLICIES
-- ============================================
-- Supabase Storage에서 실행:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('chapter-works', 'chapter-works', false);

-- Storage RLS (storage.objects)
CREATE POLICY "storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'chapter-works'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'chapter-works'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'chapter-works'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
