-- Automatic email delivery of pass-forward reminders. A sender claims a due reminder (claimed_at) so that
-- concurrent server instances never send it twice; a stale claim is retried after 10 minutes, up to 3 attempts,
-- after which the reminder is left for staff to send by hand.
ALTER TABLE pass_forward_reminders
  ADD COLUMN claimed_at timestamptz,
  ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0);
