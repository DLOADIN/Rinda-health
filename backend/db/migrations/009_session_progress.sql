-- This is the live session timeline: which study step a participant is on, and when it started and ended.
-- It holds step names and times only, never answers or results.

CREATE TABLE session_progress (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES facilitator_sessions (id) ON DELETE CASCADE,
  step        text NOT NULL CHECK (step IN ('signin', 'consent', 'questionnaire', 'measurements', 'results', 'get_help')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz
);
CREATE INDEX session_progress_session_idx ON session_progress (session_id, started_at);

ALTER TABLE facilitator_sessions ADD COLUMN last_seen_at timestamptz;
