CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE fulfilment_status AS ENUM ('created', 'paid', 'packed', 'collected', 'delivered', 'cancelled', 'refunded');
CREATE TYPE recipient_status AS ENUM ('unknown', 'scanned', 'confirmed', 'registered', 'decided');
CREATE SEQUENCE box_number_sequence START WITH 1;

CREATE TABLE trails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  starter_participant_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text,
  last_initial text,
  area text,
  email text,
  phone text,
  display_consent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trails ADD CONSTRAINT trails_starter_fk FOREIGN KEY (starter_participant_id) REFERENCES participants(id);

CREATE TABLE boxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_number text NOT NULL UNIQUE,
  trail_id uuid NOT NULL REFERENCES trails(id),
  parent_box_id uuid REFERENCES boxes(id),
  depth integer NOT NULL CHECK (depth >= 0),
  qr_token_hash text UNIQUE,
  fulfilment_status fulfilment_status NOT NULL DEFAULT 'created',
  recipient_status recipient_status NOT NULL DEFAULT 'unknown',
  giver_participant_id uuid REFERENCES participants(id),
  recipient_participant_id uuid REFERENCES participants(id),
  giver_note text,
  paid_at timestamptz,
  packed_at timestamptz,
  collected_at timestamptz,
  delivered_at timestamptz,
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((parent_box_id IS NULL AND depth = 0) OR (parent_box_id IS NOT NULL AND depth > 0))
);

CREATE INDEX boxes_trail_parent_idx ON boxes (trail_id, parent_box_id);

CREATE TYPE box_card_status AS ENUM ('available', 'assigned', 'voided');

CREATE TABLE box_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_code text NOT NULL UNIQUE,
  token_hash text NOT NULL UNIQUE,
  status box_card_status NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  assigned_at timestamptz
);

ALTER TABLE boxes ADD COLUMN card_id uuid UNIQUE REFERENCES box_cards(id);

CREATE TABLE holder_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id uuid NOT NULL REFERENCES boxes(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX holder_sessions_lookup_idx ON holder_sessions (token_hash, expires_at);

CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_box_id uuid NOT NULL REFERENCES boxes(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX referrals_token_lookup_idx ON referrals (token_hash, expires_at);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  referral_id uuid NOT NULL UNIQUE REFERENCES referrals(id),
  trail_id uuid NOT NULL REFERENCES trails(id),
  parent_box_id uuid NOT NULL REFERENCES boxes(id),
  child_box_id uuid UNIQUE REFERENCES boxes(id),
  amount_kobo integer NOT NULL CHECK (amount_kobo > 0),
  currency text NOT NULL DEFAULT 'NGN',
  customer_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending_payment', 'paid', 'cancelled', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE giver_trackers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Private fulfilment data. It is intentionally separate from the public trail projection.
CREATE TABLE delivery_details (
  box_id uuid PRIMARY KEY REFERENCES boxes(id),
  address_line_1 text NOT NULL,
  address_line_2 text,
  city text NOT NULL,
  region text,
  delivery_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE packing_records (
  box_id uuid PRIMARY KEY REFERENCES boxes(id),
  packed_by text NOT NULL,
  checklist_complete boolean NOT NULL DEFAULT false,
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE collection_records (
  box_id uuid PRIMARY KEY REFERENCES boxes(id),
  courier text NOT NULL,
  handoff_reference text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE delivery_records (
  box_id uuid PRIMARY KEY REFERENCES boxes(id),
  delivered_by text NOT NULL,
  proof_reference text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('admin', 'operations')),
  api_token_hash text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE reminder_preferences (
  box_id uuid PRIMARY KEY REFERENCES boxes(id),
  email_opt_in boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reminder_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id uuid NOT NULL REFERENCES boxes(id),
  kind text NOT NULL CHECK (kind IN ('receipt_confirmation', 'pass_forward')),
  status text NOT NULL CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'cancelled')) DEFAULT 'queued',
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (box_id, kind)
);

CREATE TABLE story_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE story_magic_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES story_accounts(id),
  box_id uuid NOT NULL REFERENCES boxes(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE story_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES story_accounts(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE story_box_access (
  account_id uuid NOT NULL REFERENCES story_accounts(id),
  box_id uuid NOT NULL REFERENCES boxes(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, box_id)
);

CREATE INDEX reminder_jobs_pending_idx ON reminder_jobs (status, scheduled_at) WHERE status = 'queued';

CREATE INDEX staff_audit_events_target_idx ON staff_audit_events (target_type, target_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION record_operational_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text;
BEGIN
  target := COALESCE(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'box_id', to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'box_id');
  INSERT INTO staff_audit_events (actor, action, target_type, target_id, metadata)
  VALUES (
    COALESCE(current_setting('app.actor', true), 'system'),
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    target,
    CASE
      WHEN TG_TABLE_NAME = 'reminder_preferences' THEN jsonb_build_object('emailOptIn', (to_jsonb(NEW)->>'email_opt_in')::boolean)
      WHEN TG_TABLE_NAME = 'reminder_jobs' THEN jsonb_build_object('kind', to_jsonb(NEW)->>'kind', 'status', to_jsonb(NEW)->>'status')
      ELSE '{}'::jsonb
    END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audit_boxes AFTER INSERT OR UPDATE ON boxes FOR EACH ROW EXECUTE FUNCTION record_operational_audit();
CREATE TRIGGER audit_box_cards AFTER INSERT OR UPDATE ON box_cards FOR EACH ROW EXECUTE FUNCTION record_operational_audit();
CREATE TRIGGER audit_delivery_details AFTER INSERT OR UPDATE ON delivery_details FOR EACH ROW EXECUTE FUNCTION record_operational_audit();
CREATE TRIGGER audit_packing_records AFTER INSERT OR UPDATE ON packing_records FOR EACH ROW EXECUTE FUNCTION record_operational_audit();
CREATE TRIGGER audit_collection_records AFTER INSERT OR UPDATE ON collection_records FOR EACH ROW EXECUTE FUNCTION record_operational_audit();
CREATE TRIGGER audit_delivery_records AFTER INSERT OR UPDATE ON delivery_records FOR EACH ROW EXECUTE FUNCTION record_operational_audit();
CREATE TRIGGER audit_staff_users AFTER INSERT OR UPDATE ON staff_users FOR EACH ROW EXECUTE FUNCTION record_operational_audit();
CREATE TRIGGER audit_reminder_preferences AFTER INSERT OR UPDATE ON reminder_preferences FOR EACH ROW EXECUTE FUNCTION record_operational_audit();
CREATE TRIGGER audit_reminder_jobs AFTER INSERT OR UPDATE ON reminder_jobs FOR EACH ROW EXECUTE FUNCTION record_operational_audit();

CREATE OR REPLACE FUNCTION protect_last_staff_admin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.role = 'admin' AND OLD.active AND OLD.revoked_at IS NULL
    AND (NEW.role <> 'admin' OR NOT NEW.active OR NEW.revoked_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM staff_users WHERE id <> OLD.id AND role = 'admin' AND active AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Cannot remove the final active administrator';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER staff_users_protect_last_admin BEFORE UPDATE OF role, active, revoked_at ON staff_users
FOR EACH ROW EXECUTE FUNCTION protect_last_staff_admin();

CREATE OR REPLACE FUNCTION protect_box_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent boxes;
BEGIN
  IF NEW.parent_box_id IS NULL THEN
    IF NEW.depth <> 0 THEN RAISE EXCEPTION 'Root boxes must have depth 0'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO parent FROM boxes WHERE id = NEW.parent_box_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parent box does not exist'; END IF;
  IF NEW.trail_id <> parent.trail_id OR NEW.depth <> parent.depth + 1 THEN
    RAISE EXCEPTION 'A child box must inherit its parent trail and have depth + 1';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER boxes_protect_lineage BEFORE INSERT OR UPDATE OF trail_id, parent_box_id, depth ON boxes
FOR EACH ROW EXECUTE FUNCTION protect_box_lineage();
