-- visit_date를 날짜+시간(TIMESTAMP)으로 변경
-- 기존 DATE 컬럼을 TIMESTAMP로 변경 (기존 날짜 데이터 유지)
ALTER TABLE as_records
  ALTER COLUMN visit_date TYPE TIMESTAMP USING visit_date::timestamp;

-- 컬럼명도 의미에 맞게 변경 (선택사항 - 이름 변경 원하면 아래 주석 해제)
-- ALTER TABLE as_records RENAME COLUMN visit_date TO visit_datetime;
