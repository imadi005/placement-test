-- Real demo data: password for every seeded account is Password123!
-- (hash generated with bcrypt cost 12, matches AuthService.hashPassword)
\set pw_hash '''$2b$12$b2yEJTfBbb/ZDWboW42MhuyEV3JLoOwShmPMGe9KYOJhOVOVaozAy'''

-- ===== Staff =====
INSERT INTO users (id, email, password_hash, role, full_name) VALUES
  ('11111111-0000-0000-0000-000000000001', 'priya.menon@kju.edu', :pw_hash, 'coordinator', 'Priya Menon'),
  ('11111111-0000-0000-0000-000000000002', 'r.iyer@kju.edu', :pw_hash, 'admin', 'Ramesh Iyer'),
  ('11111111-0000-0000-0000-000000000003', 'anitha.rao@kju.edu', :pw_hash, 'teacher', 'Anitha Rao'),
  ('11111111-0000-0000-0000-000000000004', 'suresh.kumar@kju.edu', :pw_hash, 'teacher', 'Suresh Kumar');

INSERT INTO teachers (user_id, department) VALUES
  ('11111111-0000-0000-0000-000000000003', 'MCA'),
  ('11111111-0000-0000-0000-000000000004', 'MCA');

-- ===== Students across all three batches =====
INSERT INTO users (id, email, password_hash, role, full_name) VALUES
  ('22222222-0000-0000-0000-000000000001', 'aditya.s@kju.edu', :pw_hash, 'student', 'Aditya Sharma'),
  ('22222222-0000-0000-0000-000000000002', 'meera.k@kju.edu', :pw_hash, 'student', 'Meera Krishnan'),
  ('22222222-0000-0000-0000-000000000003', 'rahul.v@kju.edu', :pw_hash, 'student', 'Rahul Verma'),
  ('22222222-0000-0000-0000-000000000004', 'sneha.p@kju.edu', :pw_hash, 'student', 'Sneha Pillai'),
  ('22222222-0000-0000-0000-000000000005', 'arjun.n@kju.edu', :pw_hash, 'student', 'Arjun Nair'),
  ('22222222-0000-0000-0000-000000000006', 'divya.t@kju.edu', :pw_hash, 'student', 'Divya Thomas');

INSERT INTO students (user_id, roll_no, batch, section, current_semester) VALUES
  ('22222222-0000-0000-0000-000000000001', '25MCAB58', 'A', 'A1', 3),
  ('22222222-0000-0000-0000-000000000002', '25MCAB12', 'A', 'A1', 3),
  ('22222222-0000-0000-0000-000000000003', '25MCAB27', 'B', 'A1', 3),
  ('22222222-0000-0000-0000-000000000004', '25MCAB33', 'C', 'A1', 3),
  ('22222222-0000-0000-0000-000000000005', '25MCAB41', 'C', 'A1', 3),
  ('22222222-0000-0000-0000-000000000006', '25MCAB05', 'C', 'A1', 3);

-- ===== Class assignments (Anitha teaches Aptitude, Suresh teaches Logical Reasoning, both to section A1) =====
INSERT INTO teacher_class_assignments (id, teacher_id, section, subject, day_of_week, start_time, end_time) VALUES
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003', 'A1', 'Aptitude', 2, '10:00', '11:00'),
  ('33333333-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000004', 'A1', 'Logical Reasoning', 4, '11:00', '12:00');

-- ===== A real, live, ready-to-take test with a mixed MCQ + descriptive question set =====
INSERT INTO tests (id, title, batch_scope, duration_minutes, scheduled_start, status, created_by, approved) VALUES
  ('44444444-0000-0000-0000-000000000001', 'Weekly Aptitude Test — Numbers & Logic', 'A', 30, now(), 'live', '11111111-0000-0000-0000-000000000001', true);

INSERT INTO questions (id, test_id, question_text, question_order, marks, question_type) VALUES
  ('55555555-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 'If a sequence is defined so each term is the sum of the two preceding terms, and the first two terms are 3 and 5, what is the 6th term?', 1, 1, 'mcq'),
  ('55555555-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', 'A train 120m long crosses a pole in 6 seconds. What is its speed in km/h?', 2, 1, 'mcq'),
  ('55555555-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000001', 'Explain, in your own words, how you would approach solving a work-and-time problem involving three people working at different rates.', 3, 2, 'descriptive');

INSERT INTO question_options (question_id, option_text, is_correct) VALUES
  ('55555555-0000-0000-0000-000000000001', '21', false),
  ('55555555-0000-0000-0000-000000000001', '34', true),
  ('55555555-0000-0000-0000-000000000001', '48', false),
  ('55555555-0000-0000-0000-000000000001', '55', false),
  ('55555555-0000-0000-0000-000000000002', '60 km/h', false),
  ('55555555-0000-0000-0000-000000000002', '72 km/h', true),
  ('55555555-0000-0000-0000-000000000002', '80 km/h', false),
  ('55555555-0000-0000-0000-000000000002', '90 km/h', false);

UPDATE questions SET model_answer = 'Find each person''s individual rate (work/time), sum the rates for combined work per unit time, then take the reciprocal of the combined rate to get total time.'
  WHERE id = '55555555-0000-0000-0000-000000000003';

-- ===== One batch upgrade on record, showing the audit trail works =====
INSERT INTO batch_history (student_id, old_batch, new_batch, changed_by, reason, changed_at) VALUES
  ('22222222-0000-0000-0000-000000000004', 'C', 'B', '11111111-0000-0000-0000-000000000001', 'Scored 88% on Weekly Aptitude Test #3, moved up from C to B', '2026-07-20 09:00:00+00');

UPDATE students SET batch = 'B' WHERE user_id = '22222222-0000-0000-0000-000000000004';
