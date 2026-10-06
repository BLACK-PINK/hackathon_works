-- projects 테이블에 세대 비밀번호 컬럼 추가
ALTER TABLE projects ADD COLUMN IF NOT EXISTS unit_password TEXT;
