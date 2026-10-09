-- SMS notices: the same notice as WhatsApp, never any results (withdrawn again by 004).
-- message_events still stores no message text or phone number.

ALTER TABLE message_events DROP CONSTRAINT message_events_channel_check;
ALTER TABLE message_events ADD CONSTRAINT message_events_channel_check CHECK (channel IN ('whatsapp', 'sms'));

ALTER TABLE consent_events DROP CONSTRAINT consent_events_scope_check;
ALTER TABLE consent_events ADD CONSTRAINT consent_events_scope_check
  CHECK (scope IN ('core', 'mental_wellness', 'audio', 'follow_up', 'ai_explanations', 'whatsapp_notices', 'sms_notices'));
