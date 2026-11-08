-- "Not yet / I need help": anyone holding the card can ask for help; staff work the queue.
-- `contact` is optional and volunteered for this request only.
CREATE TABLE help_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id uuid NOT NULL REFERENCES boxes(id),
  category text NOT NULL CHECK (category IN ('not_arrived', 'damaged', 'lost_access', 'other')),
  message text,
  contact text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text
);
CREATE INDEX help_requests_status_idx ON help_requests (status, created_at DESC);
CREATE INDEX help_requests_box_idx ON help_requests (box_id, created_at DESC);

-- "Remind me in 24 hours": one recipient-requested reminder per box, ever.
-- The return link's token is stored only as a hash and is re-issued when staff prepare the message.
CREATE TABLE pass_forward_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id uuid NOT NULL UNIQUE REFERENCES boxes(id),
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  destination text NOT NULL,
  consent_text text NOT NULL,
  send_at timestamptz NOT NULL,
  token_hash text UNIQUE,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'accepted', 'declined')),
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pass_forward_reminders_due_idx ON pass_forward_reminders (send_at) WHERE status = 'scheduled';

CREATE TRIGGER audit_help_requests AFTER INSERT OR UPDATE ON help_requests FOR EACH ROW EXECUTE FUNCTION record_operational_audit();
CREATE TRIGGER audit_pass_forward_reminders AFTER INSERT OR UPDATE ON pass_forward_reminders FOR EACH ROW EXECUTE FUNCTION record_operational_audit();
