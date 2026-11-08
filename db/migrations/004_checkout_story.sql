-- A pass-forward checkout now carries the story and the shipping label for the next box.
-- Order columns are nullable because orders created before this migration have none of them.
ALTER TABLE orders
  ADD COLUMN giver_display_name text,
  ADD COLUMN gift_note text,
  ADD COLUMN delivery_to text CHECK (delivery_to IN ('giver', 'recipient')),
  ADD COLUMN delivery_name text,
  ADD COLUMN delivery_phone text,
  ADD COLUMN delivery_address_line_1 text,
  ADD COLUMN delivery_address_line_2 text,
  ADD COLUMN delivery_city text,
  ADD COLUMN delivery_region text,
  ADD COLUMN delivery_notes text;

-- The name the giver chose for the next recipient to see. Separate from participant display consent,
-- which governs the public trail and is only ever set by that participant.
ALTER TABLE boxes ADD COLUMN giver_display_name text;

-- Who the courier hands the box to. Private: staff fulfilment views only.
ALTER TABLE delivery_details
  ADD COLUMN contact_name text,
  ADD COLUMN contact_phone text,
  ADD COLUMN delivery_to text CHECK (delivery_to IN ('giver', 'recipient'));
