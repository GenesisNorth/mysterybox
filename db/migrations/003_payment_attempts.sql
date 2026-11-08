-- Paystack rejects a reused transaction reference, so each checkout attempt needs its own.
-- An order (one per referral, at most one child box) may have many attempts; any one verified
-- attempt completes the order. Several verified attempts on one order indicate a double payment
-- that finance must refund.
CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  reference text NOT NULL UNIQUE,
  customer_email text NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_attempts_order_idx ON payment_attempts (order_id);

-- Existing orders used their own reference for their single attempt.
INSERT INTO payment_attempts (order_id, reference, customer_email, created_at)
SELECT id, reference, customer_email, created_at FROM orders;
