CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'EMPLOYEE'
    CHECK (role IN ('ADMIN', 'EMPLOYEE')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  shift_restriction VARCHAR(20) NOT NULL DEFAULT 'ANY'
    CHECK (shift_restriction IN ('ANY', 'DAY_ONLY', 'NIGHT_ONLY')),
  rest_preference VARCHAR(20) NOT NULL DEFAULT 'NONE'
    CHECK (rest_preference IN ('NONE', 'CONSECUTIVE', 'WEEKEND', 'WEEKDAY', 'SCATTERED')),
  rotation_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  organization_name VARCHAR(100) NOT NULL DEFAULT 'RosterMind 智排班',
  timezone VARCHAR(80) NOT NULL DEFAULT 'Asia/Shanghai',
  rotation_weeks INTEGER NOT NULL DEFAULT 2 CHECK (rotation_weeks BETWEEN 2 AND 5),
  rotation_anchor_date DATE NOT NULL DEFAULT (CURRENT_DATE - (EXTRACT(ISODOW FROM CURRENT_DATE)::INTEGER - 1)),
  day_start TIME NOT NULL DEFAULT '09:00',
  day_end TIME NOT NULL DEFAULT '23:00',
  night_start TIME NOT NULL DEFAULT '23:00',
  night_end TIME NOT NULL DEFAULT '09:00',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PUBLISHED')),
  rotation_block INTEGER NOT NULL DEFAULT 0,
  warnings JSONB NOT NULL DEFAULT '[]'::JSONB,
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  shift_type VARCHAR(10) NOT NULL CHECK (shift_type IN ('DAY', 'NIGHT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (schedule_id, user_id, shift_date)
);

CREATE INDEX IF NOT EXISTS schedule_assignments_schedule_idx
  ON schedule_assignments(schedule_id, shift_date, shift_type);
CREATE INDEX IF NOT EXISTS schedule_assignments_user_idx
  ON schedule_assignments(user_id, shift_date);

CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS leave_requests_user_idx ON leave_requests(user_id, start_date);
CREATE INDEX IF NOT EXISTS leave_requests_status_idx ON leave_requests(status, created_at);

CREATE TABLE IF NOT EXISTS swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_assignment_id UUID NOT NULL REFERENCES schedule_assignments(id) ON DELETE CASCADE,
  target_assignment_id UUID NOT NULL REFERENCES schedule_assignments(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (requester_id <> target_user_id),
  CHECK (source_assignment_id <> target_assignment_id)
);

CREATE INDEX IF NOT EXISTS swap_requests_target_idx ON swap_requests(target_user_id, status);
CREATE INDEX IF NOT EXISTS swap_requests_requester_idx ON swap_requests(requester_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  message TEXT NOT NULL,
  link VARCHAR(255),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);

INSERT INTO app_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;
