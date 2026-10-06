-- as_records DELETE RLS 정책 추가
-- Supabase 대시보드 > SQL Editor에서 실행하세요

DROP POLICY IF EXISTS "as_records_delete" ON as_records;

CREATE POLICY "as_records_delete" ON as_records
  FOR DELETE USING (
    company_id = get_my_company_id()
    AND (created_by = auth.uid() OR is_owner_or_manager())
  );
