-- roles
CREATE TYPE public.app_role AS ENUM ('admin','user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  github_login text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "admins read profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  INSERT INTO public.preferences (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

-- preferences
CREATE TABLE public.preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'dark',
  editor_font_size int NOT NULL DEFAULT 14,
  editor_tab_size int NOT NULL DEFAULT 2,
  word_wrap boolean NOT NULL DEFAULT true,
  minimap boolean NOT NULL DEFAULT true,
  autosave boolean NOT NULL DEFAULT true,
  default_language text NOT NULL DEFAULT 'javascript',
  default_layout text NOT NULL DEFAULT 'full',
  playback_speed numeric NOT NULL DEFAULT 1,
  daily_target_minutes int NOT NULL DEFAULT 60,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.preferences TO authenticated;
GRANT ALL ON public.preferences TO service_role;
ALTER TABLE public.preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs" ON public.preferences FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER preferences_touch BEFORE UPDATE ON public.preferences FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- courses
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  playlist_id text NOT NULL,
  title text NOT NULL,
  description text,
  channel_title text,
  thumbnail_url text,
  video_count int NOT NULL DEFAULT 0,
  total_seconds int NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX courses_user_idx ON public.courses(user_id);
CREATE INDEX courses_playlist_idx ON public.courses(user_id, playlist_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own courses" ON public.courses FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER courses_touch BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- lessons
CREATE TABLE public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id text NOT NULL,
  title text NOT NULL,
  description text,
  thumbnail_url text,
  duration_seconds int NOT NULL DEFAULT 0,
  position int NOT NULL DEFAULT 0,
  unavailable boolean NOT NULL DEFAULT false,
  starter_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lessons_course_idx ON public.lessons(course_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons TO authenticated;
GRANT ALL ON public.lessons TO service_role;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own lessons" ON public.lessons FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- lesson progress
CREATE TABLE public.lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  watched_seconds int NOT NULL DEFAULT 0,
  last_position int NOT NULL DEFAULT 0,
  duration_seconds int NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  last_watched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);
CREATE INDEX lesson_progress_course_idx ON public.lesson_progress(user_id, course_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_progress TO authenticated;
GRANT ALL ON public.lesson_progress TO service_role;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own progress" ON public.lesson_progress FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER lesson_progress_touch BEFORE UPDATE ON public.lesson_progress FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- code files
CREATE TABLE public.code_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  path text NOT NULL,
  content text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'javascript',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id, path)
);
CREATE INDEX code_files_lesson_idx ON public.code_files(user_id, lesson_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.code_files TO authenticated;
GRANT ALL ON public.code_files TO service_role;
ALTER TABLE public.code_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own files" ON public.code_files FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER code_files_touch BEFORE UPDATE ON public.code_files FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.code_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  label text NOT NULL,
  files jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX code_versions_lesson_idx ON public.code_versions(user_id, lesson_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.code_versions TO authenticated;
GRANT ALL ON public.code_versions TO service_role;
ALTER TABLE public.code_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own versions" ON public.code_versions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- notes
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT 'global',
  title text NOT NULL DEFAULT 'Untitled',
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notes_user_idx ON public.notes(user_id, updated_at DESC);
CREATE UNIQUE INDEX notes_lesson_unique ON public.notes(user_id, lesson_id) WHERE lesson_id IS NOT NULL AND scope = 'lesson';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notes" ON public.notes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER notes_touch BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.timestamp_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  seconds int NOT NULL DEFAULT 0,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX timestamp_notes_lesson_idx ON public.timestamp_notes(user_id, lesson_id, seconds);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timestamp_notes TO authenticated;
GRANT ALL ON public.timestamp_notes TO service_role;
ALTER TABLE public.timestamp_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tsnotes" ON public.timestamp_notes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Snippet',
  language text NOT NULL DEFAULT 'javascript',
  code text NOT NULL,
  seconds int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX snippets_user_idx ON public.snippets(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.snippets TO authenticated;
GRANT ALL ON public.snippets TO service_role;
ALTER TABLE public.snippets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own snippets" ON public.snippets FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- activity
CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  seconds int NOT NULL DEFAULT 0,
  day date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_user_day_idx ON public.activities(user_id, day);
GRANT SELECT, INSERT, DELETE ON public.activities TO authenticated;
GRANT ALL ON public.activities TO service_role;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activities" ON public.activities FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- github
CREATE TABLE public.github_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  login text NOT NULL,
  avatar_url text,
  access_token text NOT NULL,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.github_connections TO service_role;
ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only" ON public.github_connections FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.github_repos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  html_url text NOT NULL,
  is_private boolean NOT NULL DEFAULT true,
  default_branch text NOT NULL DEFAULT 'main',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, full_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.github_repos TO authenticated;
GRANT ALL ON public.github_repos TO service_role;
ALTER TABLE public.github_repos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own repos" ON public.github_repos FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.commits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repo_id uuid NOT NULL REFERENCES public.github_repos(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  message text NOT NULL,
  sha text,
  html_url text,
  file_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commits_user_idx ON public.commits(user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.commits TO authenticated;
GRANT ALL ON public.commits TO service_role;
ALTER TABLE public.commits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own commits" ON public.commits FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- schedules
CREATE TABLE public.course_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  weekday int NOT NULL,
  minutes int NOT NULL DEFAULT 60,
  playback_speed numeric NOT NULL DEFAULT 1,
  UNIQUE (user_id, course_id, weekday)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_schedules TO authenticated;
GRANT ALL ON public.course_schedules TO service_role;
ALTER TABLE public.course_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own schedules" ON public.course_schedules FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());