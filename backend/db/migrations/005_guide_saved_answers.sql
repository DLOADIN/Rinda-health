-- Rinda Guide: each AI answer is generated once per check-up, question and language, then reused (ADR-019).
-- Belongs to the participant's own check-up, so it is deleted with it; cleared when the AI opt-in is withdrawn.

CREATE TABLE guide_answers (
  assessment_id      uuid NOT NULL REFERENCES assessments (id) ON DELETE CASCADE,
  chip_id            text NOT NULL,
  language           text NOT NULL CHECK (language IN ('en', 'rw')),
  paragraphs         jsonb NOT NULL,
  follow_up_chip_ids jsonb NOT NULL,
  model              text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assessment_id, chip_id, language)
);
