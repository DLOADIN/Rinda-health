CREATE TABLE guide_chat_usage (
  user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day      date NOT NULL,
  turns    integer NOT NULL DEFAULT 0 CHECK (turns >= 0),
  PRIMARY KEY (user_id, day)
);
