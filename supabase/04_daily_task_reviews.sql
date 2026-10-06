-- ============================================
-- daily_task_reviews: 대표가 업무일지 확인 + 비고 기록
-- ============================================
-- 실행: Supabase Dashboard > SQL Editor 에서 실행

CREATE TABLE IF NOT EXISTS daily_task_reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- 누구의 업무일지를 확인했는가 (작성자 + 날짜로 "하루치" 특정)
  target_user_id UUID NOT NULL,
  date          DATE NOT NULL,
  -- 확인자 (대표)
  reviewer_id   UUID NOT NULL,
  -- 확인 여부 & 비고
  is_confirmed  BOOLEAN NOT NULL DEFAULT false,
  memo          TEXT,
  confirmed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 같은 회사 내 동일 날짜+대상에 대한 리뷰는 1개만
  UNIQUE (company_id, target_user_id, date)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_daily_task_reviews_company_date
  ON daily_task_reviews(company_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_task_reviews_target
  ON daily_task_reviews(company_id, target_user_id, date);

-- RLS 활성화
ALTER TABLE daily_task_reviews ENABLE ROW LEVEL SECURITY;

-- 같은 회사 구성원은 조회 가능
CREATE POLICY "같은 회사 구성원 조회" ON daily_task_reviews
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM user_profiles WHERE id = auth.uid()
    )
  );

-- 대표(owner)만 insert/update 가능
CREATE POLICY "대표만 등록/수정" ON daily_task_reviews
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND company_id = daily_task_reviews.company_id
        AND role = 'owner'
    )
  );
