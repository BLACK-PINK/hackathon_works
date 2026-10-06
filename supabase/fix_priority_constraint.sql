-- daily_tasks 테이블의 priority check constraint에 'urgent' 추가
-- Supabase SQL Editor에서 실행하세요

ALTER TABLE daily_tasks 
  DROP CONSTRAINT IF EXISTS daily_tasks_priority_check;

ALTER TABLE daily_tasks 
  ADD CONSTRAINT daily_tasks_priority_check 
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
