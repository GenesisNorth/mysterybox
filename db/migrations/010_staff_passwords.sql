-- Staff sign in with email and password instead of pasting an access token.
-- Passwords are stored only as scrypt hashes. API tokens (api_token_hash) remain for the /staff JSON API.
ALTER TABLE staff_users
  ADD COLUMN password_hash text,
  ADD COLUMN password_set_at timestamptz,
  ADD COLUMN failed_logins integer NOT NULL DEFAULT 0,
  ADD COLUMN locked_until timestamptz,
  ADD COLUMN last_login_at timestamptz;

-- A signed-in browser. The cookie holds a random token; only its hash is stored, so a database leak
-- cannot be replayed as a session. Revoked on sign-out, password change and when the account is revoked.
CREATE TABLE staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES staff_users(id),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX staff_sessions_user_idx ON staff_sessions (staff_user_id);

-- One-time links to set a password: an invitation for a new person, or a reset for a forgotten password.
CREATE TABLE staff_password_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES staff_users(id),
  token_hash text NOT NULL UNIQUE,
  purpose text NOT NULL CHECK (purpose IN ('invite', 'reset')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX staff_password_links_user_idx ON staff_password_links (staff_user_id);
