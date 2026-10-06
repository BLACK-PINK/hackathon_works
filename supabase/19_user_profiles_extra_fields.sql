-- ============================================
-- user_profiles 추가 컬럼 (개인정보 + 직급 + 인턴)
-- Supabase Dashboard > SQL Editor 에서 실행
-- ============================================

-- 1. 기본 개인정보 컬럼 추가
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS address            TEXT,        -- 주소
  ADD COLUMN IF NOT EXISTS birthday           DATE,        -- 생년월일
  ADD COLUMN IF NOT EXISTS join_date          DATE,        -- 입사일 (정규직 기준)
  ADD COLUMN IF NOT EXISTS position           TEXT,        -- 직급 텍스트 (대표/팀장/현장소장/디자이너/기사/사원/인턴)
  ADD COLUMN IF NOT EXISTS intern_start_date  DATE,        -- 인턴 시작일 (position='인턴' 전용)
  ADD COLUMN IF NOT EXISTS regular_start_date DATE;        -- 정규직 전환일 (position='인턴' 전용)

-- 2. role ↔ position 매핑 정책
--    position(화면 표시)  → role(DB 권한)
--    ─────────────────────────────────────
--    대표                → owner
--    팀장                → manager
--    현장소장            → manager
--    디자이너            → worker   ← (manager 아님 주의)
--    기사                → worker
--    사원                → worker
--    인턴                → worker

-- 3. (선택) 기존 멤버 position 초기값 세팅 — 필요 시 주석 해제 후 실행
-- UPDATE user_profiles SET position = '대표' WHERE role = 'owner'   AND (position IS NULL OR position = '');
-- UPDATE user_profiles SET position = '팀장'  WHERE role = 'manager' AND (position IS NULL OR position = '');
-- UPDATE user_profiles SET position = '기사'  WHERE role = 'worker'  AND (position IS NULL OR position = '');
