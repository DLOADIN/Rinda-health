-- Rinda Health database, PostgreSQL 16 or later (Neon). No ORM: the API uses these tables with plain SQL.
-- Apply with `npm run db:migrate` (tracks applied files in schema_migrations), or paste into the Neon SQL editor.

-- Every person who signs in: participants and staff. One table, one role per account.
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role              text NOT NULL CHECK (role IN ('participant', 'facilitator', 'researcher_admin', 'reviewer')),
  email             text,
  phone             text CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  password_hash     text,
  google_sub        text UNIQUE,
  display_name      text CHECK (display_name IS NULL OR length(display_name) <= 80),
  preferred_language text NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'rw')),
  -- Participants only: AB/BA order for the evaluation (FR-24) and a separate ID used in exports.
  order_assignment  text CHECK (order_assignment IN ('AB', 'BA')),
  research_id       uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  active            boolean NOT NULL DEFAULT true,
  failed_attempts   integer NOT NULL DEFAULT 0,
  locked_until      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_sign_in_at   timestamptz,
  deleted_at        timestamptz,
  CHECK (email IS NULL OR email = lower(email)),
  CHECK (deleted_at IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX users_email_key ON users (email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_phone_key ON users (phone) WHERE phone IS NOT NULL;
CREATE INDEX users_role_idx ON users (role);

-- Sign-in sessions. Only a SHA-256 hash of the cookie token is stored.
CREATE TABLE user_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  auth_method   text NOT NULL CHECK (auth_method IN ('password', 'google')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz
);
CREATE INDEX user_sessions_user_idx ON user_sessions (user_id);

-- Banded participant profile (FR-03): bands only, never exact values.
CREATE TABLE participant_profiles (
  user_id         uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  age_band        text CHECK (age_band IN ('18-24', '25-29', '30-35')),
  sex             text NOT NULL DEFAULT 'not_stated' CHECK (sex IN ('female', 'male', 'not_stated')),
  district_band   text CHECK (district_band IS NULL OR district_band ~ '^[a-z_]{2,40}$'),
  education_band  text CHECK (education_band IS NULL OR education_band ~ '^[a-z_]{2,40}$'),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One row per consent decision; never updated (FR-02, FR-44).
CREATE TABLE consent_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  scope                text NOT NULL CHECK (scope IN ('core', 'mental_wellness', 'audio', 'follow_up', 'ai_explanations')),
  granted              boolean NOT NULL,
  consent_doc_version  text NOT NULL,
  language             text NOT NULL CHECK (language IN ('en', 'rw')),
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consent_events_user_idx ON consent_events (user_id, scope, created_at);

-- Submitted assessments with the inputs, the server's results and plan (FR-08, FR-09, NFR-10).
CREATE TABLE assessments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  idempotency_key  uuid NOT NULL,
  request_hash     text NOT NULL,
  ruleset_version  text NOT NULL,
  language         text NOT NULL CHECK (language IN ('en', 'rw')),
  input            jsonb NOT NULL,
  results          jsonb NOT NULL,
  plan             jsonb NOT NULL,
  safety           jsonb NOT NULL,
  started_at       timestamptz NOT NULL,
  submitted_at     timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX assessments_user_idx ON assessments (user_id, created_at DESC);

-- Safety events hold tier, trigger, actions and times only, never answers or scores (FR-13).
CREATE TABLE safety_events (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id         uuid REFERENCES users (id) ON DELETE SET NULL,
  tier                   integer NOT NULL CHECK (tier BETWEEN 1 AND 3),
  trigger_type           text NOT NULL CHECK (trigger_type IN ('item9', 'score_threshold', 'observed', 'disclosed')),
  actions                text[] NOT NULL DEFAULT '{}',
  occurred_at            timestamptz NOT NULL,
  recorded_by            uuid REFERENCES users (id) ON DELETE SET NULL,
  recorded_by_role       text NOT NULL CHECK (recorded_by_role IN ('system', 'facilitator')),
  supervisor_informed_at timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX safety_events_time_idx ON safety_events (occurred_at DESC);

-- Facilitated sessions with task outcomes (FR-45).
CREATE TABLE facilitator_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  facilitator_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  device_label    text CHECK (device_label IS NULL OR length(device_label) <= 40),
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz
);
CREATE INDEX facilitator_sessions_started_idx ON facilitator_sessions (started_at DESC);

CREATE TABLE task_results (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES facilitator_sessions (id) ON DELETE CASCADE,
  task_code         text NOT NULL CHECK (task_code ~ '^[a-z0-9_]{1,40}$'),
  outcome           text NOT NULL CHECK (outcome IN ('completed', 'completed_with_help', 'not_completed')),
  duration_seconds  integer NOT NULL CHECK (duration_seconds BETWEEN 0 AND 86400),
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, task_code)
);

-- Usability and comparison feedback (FR-17), rating items only.
CREATE TABLE feedback_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  form_version  text NOT NULL,
  condition     text NOT NULL CHECK (condition IN ('A', 'B', 'post_session')),
  item_code     text NOT NULL CHECK (item_code ~ '^[a-z0-9_.]{1,40}$'),
  value         integer CHECK (value BETWEEN 0 AND 10),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Withdrawal and deletion (FR-18). Kept after the user's data is removed, to prove completion.
CREATE TABLE deletion_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES users (id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'completed')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  completed_by  uuid REFERENCES users (id) ON DELETE SET NULL
);

-- Versioned content with two-person approval (FR-20, FR-46).
CREATE TABLE content_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL CHECK (type IN ('questionnaire', 'ruleset', 'recommendation', 'referral_list',
                  'consent_doc', 'feedback_form', 'guide_chips', 'band_labels', 'safety', 'general')),
  key           text NOT NULL CHECK (key ~ '^[a-z0-9-]{1,60}$'),
  version       text NOT NULL CHECK (version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  language      text NOT NULL DEFAULT '' CHECK (language IN ('', 'en', 'rw')),
  body          jsonb NOT NULL,
  body_hash     text NOT NULL,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'retired')),
  created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz,
  UNIQUE (type, key, version, language)
);

CREATE TABLE content_approvals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_version_id  uuid NOT NULL REFERENCES content_versions (id) ON DELETE CASCADE,
  approver_id         uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  approver_role       text NOT NULL,
  decision            text NOT NULL CHECK (decision IN ('approved', 'changes_requested')),
  notes               text CHECK (notes IS NULL OR length(notes) <= 500),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_version_id, approver_id)
);

-- Feature flags per environment (FR-50).
CREATE TABLE feature_flags (
  key          text NOT NULL,
  environment  text NOT NULL,
  enabled      boolean NOT NULL,
  updated_by   uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, environment)
);

-- Append-only audit log of staff actions (FR-48). No foreign key, so entries outlive deleted accounts.
CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  actor_id     uuid,
  actor_role   text NOT NULL,
  action       text NOT NULL,
  target_type  text,
  target_id    text,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_time_idx ON audit_log (created_at DESC);

CREATE FUNCTION audit_log_is_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;

CREATE TRIGGER audit_log_no_update_or_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();
