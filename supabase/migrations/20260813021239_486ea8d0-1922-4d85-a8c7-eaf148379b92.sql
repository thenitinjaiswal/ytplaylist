CREATE UNIQUE INDEX IF NOT EXISTS code_files_unique_ws_path
  ON public.code_files (user_id, lesson_id, language, path);