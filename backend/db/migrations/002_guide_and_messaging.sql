-- Rinda Guide request log (FR-36, NFR-16) and WhatsApp notices (ADR-020).
-- Neither table stores prompts, answers, message text, phone numbers or results.

CREATE TABLE guide_request_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chip_id            text NOT NULL,
  source             text NOT NULL CHECK (source IN ('generated', 'template')),
  validator_outcome  text NOT NULL,
  model              text,
  latency_ms         integer NOT NULL,
  input_tokens       integer,
  output_tokens      integer,
  helpful            boolean,
  created_at         timestamptz NOT NULL DEFAULT now()
  -- deliberately no participant ID, prompt or answer text
);

CREATE TABLE message_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES users (id) ON DELETE CASCADE,
  channel     text NOT NULL CHECK (channel IN ('whatsapp')),
  template    text NOT NULL,
  status      text NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_code  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX message_events_user_idx ON message_events (user_id, created_at DESC);

-- Opt-in for WhatsApp notices is a consent event like the others (never edited, newest wins).
ALTER TABLE consent_events DROP CONSTRAINT consent_events_scope_check;
ALTER TABLE consent_events ADD CONSTRAINT consent_events_scope_check
  CHECK (scope IN ('core', 'mental_wellness', 'audio', 'follow_up', 'ai_explanations', 'whatsapp_notices'));
