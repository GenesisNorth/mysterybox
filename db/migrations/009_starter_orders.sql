-- "Start a gift box": anyone can buy the first box of a new trail from the website.
-- A starter order has no referral and no parent box; its trail and box are created when payment is verified.
ALTER TABLE orders ADD COLUMN kind text NOT NULL DEFAULT 'pass_forward' CHECK (kind IN ('pass_forward', 'starter'));
ALTER TABLE orders
  ALTER COLUMN referral_id DROP NOT NULL,
  ALTER COLUMN trail_id DROP NOT NULL,
  ALTER COLUMN parent_box_id DROP NOT NULL;
ALTER TABLE orders ADD CONSTRAINT orders_kind_shape CHECK (
  (kind = 'pass_forward' AND referral_id IS NOT NULL AND trail_id IS NOT NULL AND parent_box_id IS NOT NULL)
  OR (kind = 'starter' AND referral_id IS NULL AND parent_box_id IS NULL)
);

-- A starter checkout is identified by a token kept in the buyer's browser, so retrying the form
-- reuses one pending order instead of creating duplicates. Stored only as a hash.
ALTER TABLE orders ADD COLUMN checkout_token_hash text UNIQUE;
