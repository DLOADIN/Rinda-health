-- SMS notices are withdrawn until a provider that delivers in Rwanda is chosen. Removes the SMS channel and scope.

DELETE FROM message_events WHERE channel = 'sms';
ALTER TABLE message_events DROP CONSTRAINT message_events_channel_check;
ALTER TABLE message_events ADD CONSTRAINT message_events_channel_check CHECK (channel IN ('whatsapp'));

DELETE FROM consent_events WHERE scope = 'sms_notices';
ALTER TABLE consent_events DROP CONSTRAINT consent_events_scope_check;
ALTER TABLE consent_events ADD CONSTRAINT consent_events_scope_check
  CHECK (scope IN ('core', 'mental_wellness', 'audio', 'follow_up', 'ai_explanations', 'whatsapp_notices'));
