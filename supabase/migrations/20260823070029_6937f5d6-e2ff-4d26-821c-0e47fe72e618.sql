ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS target_days integer;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS scheduled_day integer;
CREATE INDEX IF NOT EXISTS lessons_course_scheduled_day_idx ON public.lessons (course_id, scheduled_day);