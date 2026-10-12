-- This is where study phones are linked to a facilitated session by QR code, and wiped at the end.
-- Only hashes of the one-time code and of the device token are kept.

CREATE TABLE session_devices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES facilitator_sessions (id) ON DELETE CASCADE,
  code_hash          text NOT NULL UNIQUE,
  expires_at         timestamptz NOT NULL,
  device_token_hash  text UNIQUE,
  claimed_at         timestamptz,
  wipe_requested_at  timestamptz,
  wiped_at           timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_devices_session_idx ON session_devices (session_id);
