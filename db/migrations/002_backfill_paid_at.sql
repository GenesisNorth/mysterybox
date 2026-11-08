-- Child boxes are created at the moment their payment is verified, but paid_at was never written,
-- so the giver tracker could never show "Payment confirmed". created_at is that verification time.
UPDATE boxes SET paid_at = created_at
WHERE paid_at IS NULL AND parent_box_id IS NOT NULL AND fulfilment_status <> 'created';
