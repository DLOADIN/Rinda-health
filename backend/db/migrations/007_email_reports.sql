-- Email reports through Brevo (ADR-020) replace the WhatsApp and SMS notices, which are withdrawn for now.
-- message_events keeps channel, status and error code only, never the address or the email text.

DELETE FROM message_events WHERE channel <> 'email';
ALTER TABLE message_events DROP CONSTRAINT message_events_channel_check;
ALTER TABLE message_events ADD CONSTRAINT message_events_channel_check CHECK (channel IN ('email'));

DELETE FROM consent_events WHERE scope IN ('whatsapp_notices', 'sms_notices');
ALTER TABLE consent_events DROP CONSTRAINT consent_events_scope_check;
ALTER TABLE consent_events ADD CONSTRAINT consent_events_scope_check
  CHECK (scope IN ('core', 'mental_wellness', 'audio', 'follow_up', 'ai_explanations', 'email_reports'));
