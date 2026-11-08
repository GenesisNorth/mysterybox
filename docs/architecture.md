# Architecture decision record — first build

## Shape

Use a modular monolith: one TypeScript application, PostgreSQL, and explicit adapters for payments, messaging and fulfilment. Do not split into microservices during the pilot.

## Bounded modules

| Module | Owns |
| --- | --- |
| Trail | immutable trail identity, parent/child box lineage, milestones |
| Box journey | scan, delivery display, receipt confirmation, reveal |
| Checkout | referrals, orders, payment confirmation, child-box creation |
| Fulfilment | card assignment, packing, collection and delivery |
| Participants | private contact data and public-consent projection |
| Reminders | explicit consent and one-time reminders |
| Admin | staff operations and audit trail |

## Rule ownership

The application service derives a child box's `trail_id`, `parent_box_id`, and `depth` from the parent record. PostgreSQL repeats that protection with a trigger, so a future admin screen or script cannot accidentally join the wrong trail.

Printed cards are inventory. Each card has a hashed QR token and is `available`, `assigned`, or `voided`. Staff may assign an available card only to a paid box; a card is unique to one box. The recipient lookup reads the assigned card token, while staff work with a non-secret card code and box number.

## Next implementation order

1. Run `db/schema.sql` in managed PostgreSQL and configure `DATABASE_URL`; the production recipient repository is available now.
2. Add staff authentication and card inventory/assignment.
3. Implement Paystack checkout and verified, idempotent webhook processing.
4. Build packing/delivery operations and the privacy-limited giver tracker.

## Payment rule

The browser never creates a box. A Paystack webhook may identify a candidate order, but the server still verifies the transaction directly with Paystack and compares its reference, amount, currency, and customer email against the order. One database transaction then creates the child box from the actual parent box, marks the order paid, and records that child. Replayed webhooks return the existing child rather than creating another.
