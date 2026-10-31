CREATE TABLE handover_uploads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facilitator_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  participant_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  session_id      uuid REFERENCES facilitator_sessions (id) ON DELETE SET NULL,
  checkups        integer NOT NULL CHECK (checkups >= 0),
  safety_events   integer NOT NULL CHECK (safety_events >= 0),
  saved           integer NOT NULL CHECK (saved >= 0),
  already         integer NOT NULL CHECK (already >= 0),
  invalid         integer NOT NULL CHECK (invalid >= 0),
  assessment_ids  uuid[] NOT NULL DEFAULT '{}',
  uploaded_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX handover_uploads_time_idx ON handover_uploads (uploaded_at DESC);
CREATE INDEX handover_uploads_facilitator_idx ON handover_uploads (facilitator_id, uploaded_at DESC);

ALTER TABLE assessments ADD COLUMN received_by_qr boolean NOT NULL DEFAULT false;
