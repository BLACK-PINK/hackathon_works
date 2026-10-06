-- AS 접수: 직접 입력 현장명 + 사진 URL 컬럼 추가
-- 실행: Supabase SQL Editor에서 실행

-- 1. 현장 직접 입력 (현장 목록에 없는 과거 현장용)
ALTER TABLE as_records
  ADD COLUMN IF NOT EXISTS site_name TEXT;

-- 2. 사진 URL 배열 (Supabase Storage 업로드 후 URL 저장)
ALTER TABLE as_records
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}';

-- 3. visit_date 컬럼 (기존에 없을 경우 대비)
ALTER TABLE as_records
  ADD COLUMN IF NOT EXISTS visit_date TIMESTAMPTZ;

-- 4. handler_name 컬럼 (기존에 없을 경우 대비)
ALTER TABLE as_records
  ADD COLUMN IF NOT EXISTS handler_name TEXT;

-- 5. Supabase Storage 버킷 생성 (as-photos)
-- 아래는 SQL로 실행 불가 → Supabase Dashboard > Storage에서 수동 생성
-- Bucket 이름: as-photos
-- Public: true (URL로 직접 접근 가능)

-- 완료 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'as_records'
ORDER BY ordinal_position;
