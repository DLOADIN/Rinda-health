ALTER TABLE voice_clips ADD COLUMN content_type text NOT NULL DEFAULT 'audio/mpeg';
ALTER TABLE voice_clips ADD COLUMN provider text NOT NULL DEFAULT 'elevenlabs';
