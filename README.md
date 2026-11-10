# Gratitude Stories

Gratitude Stories is a physical-gift experience where each box can continue one private, consent-safe trail of kindness.

## First vertical slice

This repository starts with the rules that must never be broken:

- a box belongs to one immutable trail;
- a child box is created only from its parent and inherits that trail;
- a delivery state and a recipient state are separate;
- public trail data is a privacy-safe projection, never a raw participant record;
- payment confirmation is idempotent.

The current local demo exposes a recipient box page at `http://localhost:3000/b/demo-card-token`. Confirming receipt creates a holder session and reveals only consent-safe trail data. It deliberately contains no real contact details, payment credentials, or delivery integration.

Set `DATABASE_URL` to use PostgreSQL. Without it, the app uses one demo card in memory so the journey is easy to test locally.

For a payment-enabled environment, configure `DATABASE_URL`, `PASS_ON_AMOUNT_KOBO` (an integer amount in kobo), `PAYSTACK_SECRET_KEY`, and the absolute HTTPS `PAYSTACK_CALLBACK_URL` (for example, `https://app.example.com/checkout/complete`). Checkout then creates an order server-side and redirects to Paystack with its fixed reference, email, amount, and callback URL. The webhook endpoint is `POST /webhooks/paystack`; it verifies Paystack's raw-payload signature and independently verifies the transaction before creating a child box. The callback only tells the customer that verification is underway—it never treats a browser redirect as payment proof.

Staff operations require PostgreSQL and a `Bearer` token. Use a long, random `STAFF_ADMIN_TOKEN` or `STAFF_OPERATIONS_TOKEN` for bootstrap, then provision database-backed staff identities. The following PostgreSQL-backed endpoints return `Cache-Control: no-store`:

For the next access-control increment, provision distinct `STAFF_ADMIN_TOKEN` and `STAFF_OPERATIONS_TOKEN` values. The shared token remains supported during migration, but should be retired once named staff credentials are deployed.

An authenticated admin can provision a revocable database-backed identity with `POST /staff/users` (`email`, `role`). The returned opaque API token is shown once; store it in the staff member's secure credential manager.
Revoke an active identity immediately with `POST /staff/users/:email/revoke`.
`GET /staff/users` lists identity status and roles, never credential material.
Rotate an active identity's token with `POST /staff/users/:email/rotate-token`; the new token is returned once.
Change an active identity's role with `POST /staff/users/:email/role` (`role=admin|operations`).
`GET /staff/users/:email/audit` is admin-only and returns that identity's lifecycle events.

- `POST /staff/cards` with form field `quantity` (1–100) issues printable card codes and one-time raw QR tokens.
- `GET /staff/cards?status=available|assigned|voided` lists inventory without QR tokens.
- `POST /staff/cards/:cardCode/void` voids an available card for loss or damage. Assigned cards cannot be voided through this endpoint.
- `POST /staff/boxes` creates a root trail and its first box in `created` state. It returns the internal box number and trail code, not participant information.
- `GET /staff/boxes/:boxNumber` returns the privacy-minimized operational overview: lineage, statuses, card code/status, and fulfilment timestamps.
- `GET /staff/boxes?query=...` searches box numbers and trail codes, returning only privacy-minimized operational summaries.
- `GET /staff/boxes/:boxNumber/audit` returns the append-only operational history for that box, without private field values. Each event names its actor: the staff member's email (or `staff-admin` / `staff-operations` for bootstrap tokens), `public` for recipients and buyers, `paystack-webhook`, or `reminder-email-sender`.
- `GET`/`POST /staff/boxes/:boxNumber/delivery` reads or stores private delivery address and handoff notes. These fields are staff-only and never appear in public, recipient, or tracker responses.
- `GET`/`POST /staff/boxes/:boxNumber/participants` reads or stores private giver/recipient contacts and the giver note. A recipient’s display consent is always ignored here and can only be set by that recipient after receipt confirmation.
- `GET`/`POST /staff/boxes/:boxNumber/packing` reads or records the private packing checklist. A box cannot advance to `packed` without a completed checklist and named packer.
- `GET`/`POST /staff/boxes/:boxNumber/collection` records and reads courier handoff before the box can become `collected`; `GET`/`POST /staff/boxes/:boxNumber/delivery-proof` records and reads private delivery proof before it can become `delivered`.
- `POST /staff/boxes/:boxNumber/reminders` with `kind=receipt_confirmation|pass_forward` queues one future reminder only when the recipient has explicitly opted in and has an email. Provider delivery is intentionally not enabled yet.
- `POST /staff/boxes/:boxNumber/reminders/:kind/cancel` cancels a queued reminder before it is sent.
- `POST /staff/boxes/:boxNumber/reminders/:kind/retry` requeues a failed reminder; sent and cancelled jobs cannot be retried.
- `POST /staff/reminders/recover` requeues reminder claims stuck in `processing` for more than 15 minutes.

`staff-operations` can run fulfilment and see delivery records; only `staff-admin` can read or change private giver/recipient contact records.
- `POST /staff/boxes/:boxNumber/card` with form field `cardCode` assigns an available card to a paid box. Staff never need the raw QR token.
- `POST /staff/boxes/:boxNumber/card/replacement` with form field `cardCode` atomically replaces a paid box’s assigned card and voids the old card. This is the recovery path for a lost or damaged assigned card.
- `POST /staff/boxes/:boxNumber/fulfilment` with form field `status` advances a box through `created → paid → packed → collected → delivered` (or valid cancellation/refund transitions). Invalid skips are rejected.

Raw QR tokens are never stored and are returned only when a card batch is issued; send that response directly to the printing workflow over a protected connection.

After confirming receipt, a recipient may optionally choose their public label for future recipients. Explicit consent is required before any label is displayed, and that label is limited to first name, last initial, and area. The recipient can decline; no public label is then stored.

## Staff console

`/admin` is the browser interface for running fulfilment; it uses the same rules as the `/staff` API and needs PostgreSQL. Staff sign in by pasting their access token, which is kept in an `HttpOnly`, `SameSite=Strict` cookie scoped to `/admin` for 12 hours; every form submission must also come from the console's own origin.

Pages are reached from a sidebar (on phones it becomes a scrolling strip at the top); a box or trail search sits in the top bar of every page.

- **Overview** (`/admin`, where sign-in lands) shows what needs attention (paid boxes waiting over a day, open help requests, due reminders for administrators, low card stock), headline numbers (boxes, pass-forward rate, active trails, longest trail, median paid-to-delivered time, pass-forward sales), charts of new boxes per week, where every box is, the recipient journey and how far trails reach, and recent staff activity. It shows aggregates only, never names or contact details. Charts are plain HTML and CSS: hovering or focusing a bar shows its value, and the weekly chart has a table view.
- **Boxes** lists recent boxes (or searches by box number or trail code) without any contact details. Administrators can start a new trail.
- **A box page** shows a single "next step" for its stage: mark paid → bind a printed card → pack (named packer plus a three-item checklist) → courier handoff → delivery proof. A box cannot be marked packed without a bound card. It also holds the private delivery details, the participant details (administrators only), card replacement and cancel/refund (administrators only), and the box's history.
- **Cards** shows stock and lets administrators issue a batch. The printable A4 QR sheet is shown **once**, because card secrets are never stored: print it or save it as PDF straight away. Set `PUBLIC_BASE_URL` to the domain printed on the cards; production refuses to issue cards without it.
- **Help** is the queue of “Not yet / I need help” requests, oldest first, with a resolve button that records who resolved it. A box page also lists its own requests.
- **Reminders** (administrators only, because it shows contact details) lists “Remind me in 24 hours” requests: due now, coming up, and those no longer needed because the box was passed forward. Until an email/SMS provider is connected, staff send each one by hand: **Prepare message** issues a fresh single-use link and shows the exact text, staff send it, then **Mark as sent**.

## Help and reminders for recipients

Every box page links to `/b/:token/help` (“Not yet, or I need help?”). Anyone holding the card can use it; it shows only the printed box number. The recipient picks a reason, may add a message and a reply-to contact, and the request joins the staff Help queue (at most three open requests per box). Set `SUPPORT_WHATSAPP_NUMBER` to show a WhatsApp button prefilled with the box number.

The decision card offers three answers: pass it forward, **Remind me in 24 hours**, or not this time (which is thanked, and can be changed later). A reminder needs the holder's session, a channel (email or text message), a destination and an explicit consent tick; the consent wording is stored with it. Each box can have one reminder, ever. Its link (`/r/:token`) works on any phone: both of its choices are buttons, so a mail scanner opening the link decides nothing. “Yes” signs that phone in as the holder and opens checkout; “No thanks” is final and marks the box decided. The message never names the giver, recipient or anyone on the trail. In local development the link is also shown on screen as a preview.

When an email provider is configured (see below), due **email** reminders are sent automatically every minute; text-message reminders, and any email that failed three times, stay on the staff Reminders page.

**“I changed phones.”** On a received box's page, an administrator who has confirmed the person's identity can issue a recovery link (`/h/:token`, single use, 48 hours). Opening it only shows a button; tapping it makes that phone the box's holder and signs out every other phone. The recipient then scans their card again.

The earlier staff-queued reminder jobs (`/staff/boxes/:boxNumber/reminders`) and the recipient “reminder preferences” page remain in the API but are no longer linked from the box page.

## My Stories

After receipt confirmation, a recipient can choose **Save my story** and enter an email address. This creates an optional passwordless profile: the one-time link grants access to `/me`, where the recipient can see their saved box number and its fulfilment and recipient status. The link is emailed through the configured provider and expires in 30 minutes; in local development it is also shown on screen. Without a provider, production says the feature is unavailable rather than promising an email.

When a saved box is continued and its pass-forward payment is verified, the profile automatically receives access to the newly created child box as part of the same database transaction. No public trail endpoint exposes this profile or its email address.

## Run

Copy `.env.example` to your deployment environment and set secrets there; do not commit a populated `.env` file. **To put the app on the internet, follow [docs/deployment.md](docs/deployment.md)** (Render blueprint in `render.yaml`, or the `Dockerfile` for any container host). Production runs the compiled build: `npm run build`, `npm run db:migrate:built`, `npm start`.

```sh
npm install
npm test
npm run dev
```

Without `DATABASE_URL`, `npm run dev` serves the in-memory recipient demo (no staff console). To run everything locally, start a PostgreSQL 16 container, put your settings in a git-ignored `.env.local` (see `.env.example`), migrate, and start with that file:

```sh
docker run -d --name gratitude-dev-db -e POSTGRES_USER=gratitude -e POSTGRES_PASSWORD=gratitude -e POSTGRES_DB=gratitude_stories \
  -p 55433:5432 -v gratitude-dev-db:/var/lib/postgresql/data postgres:16
DATABASE_URL=postgres://gratitude:gratitude@localhost:55433/gratitude_stories npm run db:migrate
npx tsx watch --env-file=.env.local src/server.ts
```

For PostgreSQL environments, apply pending migrations before starting the service (safe to re-run; `db:status` lists applied and pending migrations):

```sh
DATABASE_URL=... npm run db:migrate
DATABASE_URL=... npm run db:status
```

`db/schema.sql` is migration `001_initial_schema` and must not be edited. Put every schema change in a new numbered file such as `db/migrations/004_add_example.sql`; each file runs once, in name order, inside its own transaction.

`GET /health` reports process liveness. `GET /ready` additionally checks PostgreSQL when `DATABASE_URL` is configured, and is the endpoint to use for deployment readiness checks.
`GET /metrics` exposes in-memory aggregate request counts keyed only by method, redacted route category, and status. It requires `Authorization: Bearer $METRICS_TOKEN` and returns 404 unless that token is configured.
Every response includes an `X-Request-ID` header; include it in staff/support reports rather than sharing card or session tokens.
The service emits structured request logs with that ID, method, status, and redacted route category; it never logs card, tracker, or staff-identity path values.
On `SIGTERM` or `SIGINT`, the service stops accepting connections and closes its PostgreSQL pool before exit.
Production startup requires `DATABASE_URL`; holder and tracker cookies are marked `Secure` automatically in production.
Set `TRUST_PROXY=true` only when a trusted reverse proxy sets `X-Forwarded-For`; this lets request throttling distinguish clients behind that proxy.

GitHub Actions runs `npm ci`, migrations (twice, to prove they are repeatable), type-checking, and the full test suite on every push and pull request, including the PostgreSQL integration tests. Run those locally against a **separate, migrated test database** (they leave test boxes behind, so never point them at a database you use), e.g. `TEST_DATABASE_URL=postgres://gratitude:gratitude@localhost:55433/gratitude_test npm test`. They use random identifiers, so the same test database can be reused.

## Data retention

Every 6 hours the server deletes single-use secrets that expired more than 7 days ago: phone sessions, My Stories sign-in links and sessions, recovery links, and referral links that never became an order. For “delete my details” requests, an administrator can erase the recipient's or the giver's personal data from a delivered, cancelled or refunded box (name, contacts, delivery address, reminder and help contacts; for a recipient also the name they typed when passing forward). The trail keeps its shape and shows them as “A friend”, and the erasure is recorded in the history. **Payment records, including the buyer's email, are kept** for financial record-keeping; confirm that policy and all retention periods in the privacy/legal review before the pilot.

Day-to-day operations are described for the fulfilment team in [docs/pilot-runbook.md](docs/pilot-runbook.md).

## Email

Set `EMAIL_PROVIDER=resend` with `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a domain verified in Resend) to send My Stories sign-in links and pass-forward reminder emails. `EMAIL_PROVIDER=log` prints emails, including their secret links, to the server log for local development and is refused in production. Leave it unset to keep reminders manual. The provider sits behind one small adapter (`src/infrastructure/email.ts`), so switching to another service means replacing one class. Emails never contain names or contact details of anyone on a trail.

## Architecture

- `src/domain` — pure business rules and state transitions.
- `src/application` — use cases which orchestrate domain rules and repositories.
- `src/infrastructure` — HTTP server and, next, PostgreSQL/Paystack adapters.
- `db/schema.sql` — PostgreSQL schema and database-level lineage protections.
- `docs` — product and implementation decisions.

See `docs/architecture.md` for the intended implementation sequence.
See [the complete roadmap](docs/roadmap.md) for the pilot-to-production plan and current implementation status.
# mysterybox
