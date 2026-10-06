-- 현금흐름 예정 테이블 (결제예정 / 매출예정)
-- flow_type: 'payment' = 결제예정(나갈돈), 'revenue' = 매출예정(들어올돈)

CREATE TABLE IF NOT EXISTS cash_flow_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  flow_type TEXT NOT NULL CHECK (flow_type IN ('payment', 'revenue')),
  scheduled_date DATE NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  counterpart TEXT,              -- 거래처명
  is_completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE cash_flow_schedules ENABLE ROW LEVEL SECURITY;

-- 같은 회사 전원 조회
CREATE POLICY "cash_flow_schedules_select" ON cash_flow_schedules
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 전원 추가 가능 (결제예정), 매출예정은 앱 레이어에서 role 체크
CREATE POLICY "cash_flow_schedules_insert" ON cash_flow_schedules
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- 작성자 또는 owner만 수정
CREATE POLICY "cash_flow_schedules_update" ON cash_flow_schedules
  FOR UPDATE USING (
    created_by = auth.uid()
    OR company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- 작성자 또는 owner만 삭제
CREATE POLICY "cash_flow_schedules_delete" ON cash_flow_schedules
  FOR DELETE USING (
    created_by = auth.uid()
    OR company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_cash_flow_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cash_flow_schedules_updated_at
  BEFORE UPDATE ON cash_flow_schedules
  FOR EACH ROW EXECUTE FUNCTION update_cash_flow_schedules_updated_at();
