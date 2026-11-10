-- Once a connection has set app.actor in any earlier transaction, current_setting('app.actor', true) returns ''
-- (not NULL) afterwards, so COALESCE alone recorded a blank actor for unattributed writes. Treat '' as unset.
CREATE OR REPLACE FUNCTION record_operational_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text;
BEGIN
  target := COALESCE(to_jsonb(NEW)->>'id', to_jsonb(NEW)->>'box_id', to_jsonb(OLD)->>'id', to_jsonb(OLD)->>'box_id');
  INSERT INTO staff_audit_events (actor, action, target_type, target_id, metadata)
  VALUES (
    COALESCE(NULLIF(current_setting('app.actor', true), ''), 'system'),
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

-- Repair events already recorded with a blank actor.
UPDATE staff_audit_events SET actor = 'system' WHERE actor = '';
