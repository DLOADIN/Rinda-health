CREATE TABLE voice_clips (
  key         text PRIMARY KEY,
  audio       bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
