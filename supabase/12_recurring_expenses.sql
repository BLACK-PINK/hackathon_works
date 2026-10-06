-- ============================================================
-- 12_recurring_expenses.sql
-- 정기지출 템플릿 테이블
-- 고정비: 매월 N일 자동 거래 생성
-- 변동비: 항목만 등록, 발생 시 금액 기입
-- ============================================================

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,                   -- 항목명 (예: 임차료, 유류비)
  expense_type    TEXT NOT NULL DEFAULT 'fixed'    -- 'fixed' | 'variable'
                    CHECK (expense_type IN ('fixed', 'variable')),
  sub_category    TEXT,                            -- SGA 세부분류 매핑

  -- 고정비 전용
  amount          NUMERIC(15,2) DEFAULT 0,         -- 고정비: 매월 지급 금액, 변동비: 0
  billing_day     INTEGER CHECK (billing_day BETWEEN 1 AND 31), -- 매월 N일

  -- 메타
  is_active       BOOLEAN DEFAULT true,
  memo            TEXT,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_company_id
  ON recurring_expenses(company_id);

CREATE INDEX IF NOT EXISTS idx_recurring_expenses_type
  ON recurring_expenses(company_id, expense_type, is_active);

-- 3. RLS 활성화
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책 - 같은 company_id 멤버만 접근
CREATE POLICY "recurring_expenses_select" ON recurring_expenses
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "recurring_expenses_insert" ON recurring_expenses
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "recurring_expenses_update" ON recurring_expenses
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "recurring_expenses_delete" ON recurring_expenses
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- 5. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_recurring_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recurring_expenses_updated_at
  BEFORE UPDATE ON recurring_expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_recurring_expenses_updated_at();

-- ============================================================
-- 6. recurring_expense_logs - 고정비 자동생성 이력
--    (어떤 달에 이미 거래가 생성됐는지 추적)
-- ============================================================
CREATE TABLE IF NOT EXISTS recurring_expense_logs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recurring_expense_id  UUID NOT NULL REFERENCES recurring_expenses(id) ON DELETE CASCADE,
  transaction_id        UUID REFERENCES transactions(id) ON DELETE SET NULL,
  billing_year          INTEGER NOT NULL,
  billing_month         INTEGER NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE (recurring_expense_id, billing_year, billing_month) -- 월 중복 생성 방지
);

CREATE INDEX IF NOT EXISTS idx_recurring_expense_logs_expense_id
  ON recurring_expense_logs(recurring_expense_id);

ALTER TABLE recurring_expense_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_expense_logs_select" ON recurring_expense_logs
  FOR SELECT USING (
    recurring_expense_id IN (
      SELECT id FROM recurring_expenses
      WHERE company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "recurring_expense_logs_insert" ON recurring_expense_logs
  FOR INSERT WITH CHECK (
    recurring_expense_id IN (
      SELECT id FROM recurring_expenses
      WHERE company_id IN (
        SELECT company_id FROM user_profiles WHERE id = auth.uid()
      )
    )
  );
