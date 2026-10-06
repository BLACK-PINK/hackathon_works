-- ============================================================
-- Migration 32: invite_code DEFAULT를 6자리로 변경
-- Supabase SQL Editor에서 실행하세요
-- ============================================================

-- companies 테이블의 invite_code DEFAULT 6자리로 변경
ALTER TABLE companies
  ALTER COLUMN invite_code
  SET DEFAULT upper(substring(md5(random()::text), 1, 6));
