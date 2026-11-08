-- "I changed phones": an administrator issues a single-use link that makes a new phone the holder of a received box.
-- Using it ends every other holder session for that box. Tokens are stored only as hashes.
CREATE TABLE holder_recovery_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id uuid NOT NULL REFERENCES boxes(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX holder_recovery_links_box_idx ON holder_recovery_links (box_id, created_at DESC);
CREATE TRIGGER audit_holder_recovery_links AFTER INSERT OR UPDATE ON holder_recovery_links FOR EACH ROW EXECUTE FUNCTION record_operational_audit();
