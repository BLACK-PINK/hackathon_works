-- =========================================================
-- site_logs: 현장 사진 URL 배열 컬럼 추가
-- =========================================================
ALTER TABLE site_logs
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}';

-- =========================================================
-- Supabase Storage: site-photos 버킷 생성 (퍼블릭 읽기)
-- =========================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-photos',
  'site-photos',
  true,
  10485760,   -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- =========================================================
-- RLS: 인증된 사용자만 업로드, 퍼블릭 읽기
-- =========================================================
-- 읽기: 퍼블릭
CREATE POLICY "site-photos public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'site-photos');

-- 업로드: 로그인된 사용자
CREATE POLICY "site-photos auth upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'site-photos');

-- 삭제: 본인이 올린 파일만
CREATE POLICY "site-photos auth delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'site-photos' AND auth.uid() = owner);
