-- WhatsApp "your summary is ready" notices come back next to email reports. The message never holds results.

ALTER TABLE message_events DROP CONSTRAINT message_events_channel_check;
ALTER TABLE message_events ADD CONSTRAINT message_events_channel_check CHECK (channel IN ('email', 'whatsapp'));

ALTER TABLE consent_events DROP CONSTRAINT consent_events_scope_check;
ALTER TABLE consent_events ADD CONSTRAINT consent_events_scope_check
  CHECK (scope IN ('core', 'mental_wellness', 'audio', 'follow_up', 'ai_explanations', 'email_reports', 'whatsapp_notices'));
