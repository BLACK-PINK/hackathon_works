-- ============================================================
-- 18_recurring_expense_overrides.sql
-- 고정판관비 월별 오버라이드 테이블
--
-- 기본: recurring_expenses 의 fixed 항목이 매달 동일하게 적용
-- 특정 달부터 항목 추가/수정/삭제가 필요할 때 이 테이블에 기록
-- 해당 달 이후로는 오버라이드가 계속 유지됨
-- ============================================================

CREATE TABLE IF NOT EXISTS recurring_expense_overrides (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- 어느 달부터 적용? (YYYY-MM 형식, 예: '2025-07')
  effective_month TEXT NOT NULL CHECK (effective_month ~ '^\d{4}-\d{2}$'),

  -- 대상 expense_id
  -- action='add' 일 때는 NULL (신규 추가 항목)
  -- action='update'|'delete' 일 때는 기존 recurring_expenses.id 참조
  expense_id      UUID REFERENCES recurring_expenses(id) ON DELETE CASCADE,

  -- 동작: add=추가, update=수정, delete=이달부터 삭제
  action          TEXT NOT NULL CHECK (action IN ('add', 'update', 'delete')),

  -- add/update 시 적용할 값 (delete 시에는 무시)
  name            TEXT,
  amount          NUMERIC(15,2),
  billing_day     INTEGER CHECK (billing_day BETWEEN 1 AND 31),
  memo            TEXT,

  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),

  -- 같은 달, 같은 expense에 중복 override 방지
  UNIQUE (company_id, effective_month, expense_id, action)
);

CREATE INDEX IF NOT EXISTS idx_recurring_overrides_company_month
  ON recurring_expense_overrides(company_id, effective_month);

CREATE INDEX IF NOT EXISTS idx_recurring_overrides_expense_id
  ON recurring_expense_overrides(expense_id);

-- RLS
ALTER TABLE recurring_expense_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_overrides_select" ON recurring_expense_overrides
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "recurring_overrides_insert" ON recurring_expense_overrides
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "recurring_overrides_update" ON recurring_expense_overrides
  FOR UPDATE USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "recurring_overrides_delete" ON recurring_expense_overrides
  FOR DELETE USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_recurring_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recurring_overrides_updated_at
  BEFORE UPDATE ON recurring_expense_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_recurring_overrides_updated_at();
