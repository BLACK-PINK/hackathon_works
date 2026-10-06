-- AS 방문일, 처리자 이름 컬럼 추가
ALTER TABLE as_records
  ADD COLUMN IF NOT EXISTS visit_date DATE,
  ADD COLUMN IF NOT EXISTS handler_name TEXT;
