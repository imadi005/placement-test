-- Mirrors backend/prisma/schema.prisma exactly. This exists only because the
-- sandbox environment couldn't reach binaries.prisma.sh to download Prisma's
-- native engine. On a real machine with normal internet access, ignore this
-- file entirely and just run: npx prisma migrate dev --name init

CREATE TYPE "Role" AS ENUM ('student', 'teacher', 'coordinator', 'admin');
CREATE TYPE "Batch" AS ENUM ('A', 'B', 'C');
CREATE TYPE "TestStatus" AS ENUM ('draft', 'scheduled', 'live', 'ended');
CREATE TYPE "QuestionType" AS ENUM ('mcq', 'short_answer', 'numeric', 'descriptive');
CREATE TYPE "AttemptStatus" AS ENUM ('in_progress', 'submitted', 'auto_submitted', 'flagged', 'pending_grading', 'graded');
CREATE TYPE "ViolationType" AS ENUM ('tab_switch', 'fullscreen_exit', 'devtools_suspected', 'copy_paste', 'window_blur');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role "Role" NOT NULL,
  full_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE students (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  roll_no TEXT UNIQUE NOT NULL,
  batch "Batch" NOT NULL,
  section TEXT NOT NULL,
  current_semester INT NOT NULL
);

CREATE TABLE teachers (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  department TEXT NOT NULL
);

CREATE TABLE teacher_class_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES teachers(user_id),
  section TEXT NOT NULL,
  subject TEXT NOT NULL,
  day_of_week INT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL
);

CREATE TABLE tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  batch_scope TEXT NOT NULL,
  duration_minutes INT NOT NULL,
  scheduled_start TIMESTAMPTZ,
  status "TestStatus" NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES users(id),
  source_file_url TEXT,
  approved BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE batch_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(user_id),
  old_batch "Batch" NOT NULL,
  new_batch "Batch" NOT NULL,
  changed_by UUID NOT NULL REFERENCES users(id),
  reason TEXT,
  related_test_id UUID REFERENCES tests(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES tests(id),
  question_text TEXT NOT NULL,
  question_order INT NOT NULL,
  marks NUMERIC NOT NULL DEFAULT 1,
  question_type "QuestionType" NOT NULL DEFAULT 'mcq',
  model_answer TEXT,
  rubric_notes TEXT
);

CREATE TABLE question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id),
  option_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL
);

CREATE TABLE test_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES tests(id),
  student_id UUID NOT NULL REFERENCES students(user_id),
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  status "AttemptStatus" NOT NULL DEFAULT 'in_progress',
  mcq_score NUMERIC,
  final_score NUMERIC,
  UNIQUE(test_id, student_id)
);

CREATE TABLE attempt_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES test_attempts(id),
  question_id UUID NOT NULL REFERENCES questions(id),
  selected_option_id UUID REFERENCES question_options(id),
  free_text_answer TEXT,
  ai_suggested_marks NUMERIC,
  marks_awarded NUMERIC,
  graded_by UUID REFERENCES users(id),
  graded_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  UNIQUE(attempt_id, question_id)
);

CREATE TABLE violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES test_attempts(id),
  type "ViolationType" NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
