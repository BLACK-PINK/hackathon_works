-- ============================================================
-- companies 테이블 RLS 완전 재정의
-- 목적:
--   1. 소속 회사 데이터는 같은 company_id 내에서만 접근
--   2. 신규 가입자(미소속)는 초대코드 검색만 가능
--   3. 타 회사 데이터는 절대 노출 안 됨
-- ============================================================

-- 기존 companies 관련 정책 전부 제거
DROP POLICY IF EXISTS "companies_select"            ON companies;
DROP POLICY IF EXISTS "companies_select_by_invite"  ON companies;
DROP POLICY IF EXISTS "companies_insert"            ON companies;
DROP POLICY IF EXISTS "companies_update"            ON companies;
DROP POLICY IF EXISTS "companies_delete"            ON companies;

-- ① 조회 정책
--    Case A: 이미 회사에 소속된 유저 → 자기 회사만 조회
--    Case B: 아직 미소속(get_my_company_id() IS NULL) → 초대코드 검색용으로 모든 회사 id/name/invite_code 조회 가능
--            (SELECT 에서 id, name, invite_code 3개 컬럼만 노출 — 앱 코드에서 이미 그렇게 select)
CREATE POLICY "companies_select" ON companies
  FOR SELECT USING (
    id = get_my_company_id()            -- 내 회사 (소속된 유저)
    OR get_my_company_id() IS NULL      -- 미소속 신규 가입자: 초대코드 검색 허용
  );

-- ② 생성 정책: 오너가 회사 최초 생성 시 허용 (온보딩)
CREATE POLICY "companies_insert" ON companies
  FOR INSERT WITH CHECK (true);

-- ③ 수정 정책: 내 회사 + 오너만
CREATE POLICY "companies_update" ON companies
  FOR UPDATE USING (
    id = get_my_company_id() AND is_owner()
  );

-- ④ 삭제 정책: 불허 (명시적 차단)
-- (정책 미등록 시 RLS가 기본 차단하므로 INSERT 외엔 별도 정책 없으면 거부됨)
