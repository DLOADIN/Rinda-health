ALTER TABLE consent_events DROP CONSTRAINT consent_events_scope_check;
ALTER TABLE consent_events ADD CONSTRAINT consent_events_scope_check
  CHECK (scope IN ('core', 'mental_wellness', 'audio', 'follow_up', 'ai_explanations', 'email_reports', 'whatsapp_notices', 'phone_health'));

CREATE TABLE phone_health_readings (
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type        text NOT NULL,
  day         date NOT NULL,
  value       double precision NOT NULL,
  value2      double precision,
  min_value   double precision,
  max_value   double precision,
  unit        text NOT NULL,
  platform    text NOT NULL CHECK (platform IN ('ios', 'android')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, type, day)
);
