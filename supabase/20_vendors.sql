-- ============================================
-- 거래처(vendors) 테이블 + RLS
-- Supabase Dashboard > SQL Editor 에서 실행
-- ============================================

-- 1. 공정 목록 ENUM 대신 TEXT CHECK 사용 (추후 추가 용이)
CREATE TABLE IF NOT EXISTS vendors (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  process      TEXT NOT NULL,          -- 공정 (보양, 철거, 바닥철거, ...)
  name         TEXT NOT NULL,          -- 업체명
  owner_name   TEXT,                   -- 대표 이름
  phone        TEXT,                   -- 전화번호
  biz_number   TEXT,                   -- 사업자번호
  bank_account TEXT,                   -- 사업자계좌 (은행명 + 계좌번호)
  memo         TEXT,                   -- 메모
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_vendors_company_id ON vendors(company_id);
CREATE INDEX IF NOT EXISTS idx_vendors_process    ON vendors(process);

-- 3. updated_at 자동 갱신 트리거
CREATE OR REPLACE TRIGGER trigger_vendors_updated_at
  BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- 4. RLS 활성화
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

-- 5. RLS 정책 — 같은 회사만 조회/등록/수정/삭제
CREATE POLICY "vendors_select" ON vendors
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY "vendors_insert" ON vendors
  FOR INSERT WITH CHECK (company_id = get_my_company_id() AND is_owner_or_manager());

CREATE POLICY "vendors_update" ON vendors
  FOR UPDATE USING (company_id = get_my_company_id() AND is_owner_or_manager());

CREATE POLICY "vendors_delete" ON vendors
  FOR DELETE USING (company_id = get_my_company_id() AND is_owner());
