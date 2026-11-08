# Gratitude Stories roadmap

This roadmap turns the present vertical slice into a safe, pilot-ready gift operation. It is ordered by dependency and risk rather than by perceived feature appeal. Payment-gateway work is deliberately deferred until the operational and privacy flows are ready.

## Product invariants

Every phase must preserve these rules:

- A box belongs to exactly one trail. Child boxes inherit the parent trail and increment depth by one.
- Delivery status and recipient status are separate state machines.
- A recipient reveals a box only after confirming delivery from their device.
- Public trail labels require the participant's explicit display consent and contain only first name, last initial, and area.
- QR tokens, holder sessions, trackers, and payment references are opaque secrets; databases keep their hashes where practical.
- A staff workflow must use card codes, never raw QR tokens.
- A payment redirect or webhook alone never creates a box; independently verified payment does.

## Current baseline — implemented

The modular TypeScript application and PostgreSQL schema now include:

- immutable trail lineage at domain and database levels;
- recipient card scan, delivery confirmation, holder session, consent-safe reveal, and optional display-profile choice;
- consent-safe public trail projection and a private giver tracker;
- pass-it-forward referral and order creation rules;
- verified, idempotent payment-confirmation domain flow and Paystack adapter, with checkout work explicitly deferred from the pilot path;
- staff bearer-token access for root-trail creation, card issuance/inventory, assignment by non-secret card code, voiding, replacement, and fulfilment transitions;
- 30 automated tests plus a passing TypeScript type-check.

The implementation is not production-ready until the operational, security, and deployment phases below are complete.

## Phase 1 — pilot operations

Goal: enable staff to run the physical flow without reading the database or handling QR secrets.

1. Build a staff box overview and search API/UI with box number, trail code, card code/status, fulfilment status, recipient status, and timestamps. Do not show recipient contact details by default.
2. Add participant and order-intake workflows with separate private contact fields, giver note, recipient delivery details, and explicit marketing/reminder consent. Define which staff role can view each field.
3. Add packing records: item/variant, packer, packing checklist, exceptions, and replacement-card reason.
4. Add collection/delivery records: courier, handoff time, delivery proof reference, failed-delivery reason, and safe redelivery transitions. Keep proof private.
5. Add an append-only audit log for every staff operation, including actor, action, target, timestamp, and request correlation ID.
6. Replace the shared bearer token with staff identity and roles (operations, fulfilment, support, administrator) plus session expiry and revocation.

Acceptance: an authorized operator can start a trail, collect private fulfilment data, assign/replace cards, pack, deliver, troubleshoot a box, and explain every state transition through the staff interface.

### Intake data boundary

The schema now reserves `delivery_details` for private address and handoff instructions, separate from participants and all public-trail reads. The next implementation change will expose this only through authenticated staff intake and fulfilment views; it must not be added to recipient, tracker, or public-trail responses.

### Audit foundation

`staff_audit_events` is append-only and populated by database triggers for box, card, private-intake, packing, collection, delivery, and staff-identity mutations. This avoids silent gaps from future API paths. Every write now records its actor (staff email, `public`, `paystack-webhook` or a background worker name) through a transaction-local `app.actor` setting.

## Phase 2 — recipient experience and consent

Goal: make the recipient experience understandable, accessible, and safe on a mobile device.

1. Complete the explicit recipient decision flow: pass forward, decline for now, and later change of mind, with clear state semantics.
2. Add profile edit/revocation so a recipient can withdraw display consent and immediately disappear from future public trail projections.
3. Add help, lost-card, and delivery-dispute paths that disclose no giver or recipient data before holder verification.
4. Improve the recipient pages for accessibility: labelled inputs, focus states, semantic error messages, keyboard support, contrast, responsive testing, and reduced-motion support.
5. Define trail-display retention rules, including what remains visible if a participant revokes consent or requests deletion.

Acceptance: a recipient can complete the journey entirely on mobile, understands each consent choice, and can safely get help or change their display preference.

## Phase 3 — reminders and communication

Goal: support the journey without turning it into unsolicited messaging.

1. Select and integrate an email/SMS provider behind an adapter.
2. Capture channel-specific consent, purpose, locale, and contact preference.
3. Implement one-time, rate-limited reminder jobs for delivery confirmation and pass-forward decisions.
4. Add unsubscribe, suppression, bounce handling, delivery logs, and a staff resend policy.
5. Ensure communications contain opaque links and never reveal private trail data in message previews.

Acceptance: consented recipients receive at most the agreed reminders, can opt out immediately, and messages have no privacy leaks.

## Phase 4 — payments (deferred by current direction)

Goal: take pass-it-forward payment safely after the pilot operation is otherwise ready.

1. Provision Paystack sandbox credentials and configure callback/webhook URLs.
2. Execute end-to-end sandbox tests for success, failure, abandonment, duplicate webhook, forged signature, wrong amount, wrong currency, and wrong customer email.
3. Add an order recovery screen that shows a private tracker but never treats browser return as proof of payment.
4. Add refunds/cancellations, reconciliation, receipt delivery, and finance audit records.
5. Move from sandbox to live credentials only after a security review and a reconciled dry run.

Acceptance: every money movement reconciles to one order and at most one child box, and operators can resolve exceptions without changing lineage manually.

## Phase 5 — production security and data governance

Goal: make the pilot defensible in production.

1. Replace the one-shot schema file with versioned, repeatable database migrations and seed data separated from production data.
2. Configure managed PostgreSQL, encrypted backups, restore drills, least-privilege application roles, connection limits, and secrets management.
3. Enforce HTTPS, secure cookies in production, security headers, request-size limits, rate limits, CSRF protection for browser mutations, and structured error handling.
4. Define data classification, retention, deletion/export workflow, access review, incident response, and consent evidence. Obtain legal/privacy review for the launch jurisdiction before collecting real contact data.
5. Add observability: health/readiness endpoints, structured logs with secret redaction, metrics, alerting, error tracking, and operational dashboards.

Acceptance: a deployment can be restored, monitored, audited, and operated without exposing participant data or secrets.

## Phase 6 — quality assurance and release

Goal: prove the pilot works outside a developer machine.

1. Add integration tests against ephemeral PostgreSQL for lineage triggers, concurrent card assignment/replacement, idempotent orders, and consent revocation.
2. Add HTTP-level tests for authorization, cookies, rate limits, input validation, and status codes.
3. Add browser/mobile acceptance tests for the recipient and staff critical paths.
4. Establish CI for type-check, unit/integration tests, linting, dependency scanning, migration validation, and production build.
5. Prepare staging, run a staff tabletop exercise, a fulfillment rehearsal, a privacy review, and a limited invitation-only pilot.
6. Define launch metrics: delivered boxes, confirmation rate, pass-forward conversion, fulfilment time, exception rate, support volume, opt-out rate, and privacy/security incidents.

Acceptance: staging has passed the critical-path rehearsal, pilot success metrics are observable, and rollback/runbook owners are named.

## Post-pilot expansion

Only after the pilot is stable:

- richer staff dashboard and role-specific workflows;
- multiple box types, inventory/SKU management, and supplier integrations;
- courier APIs and delivery-status ingestion;
- localization, accessibility improvements informed by user research, and recipient support tooling;
- aggregate, privacy-preserving trail analytics;
- controlled referral/campaign features; and
- service decomposition only when measured scale or ownership boundaries justify it.

## Recommended next implementation

Build the staff box overview and search flow first. It is payment-independent, makes the newly added operations usable, and supplies the minimum safe diagnostic surface needed before participant intake and delivery-proof work.
