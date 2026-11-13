import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import test, { after } from "node:test";
import pg from "pg";
import { postgresRecipientJourneyRepository, type PostgresRecipientJourneyRepository } from "./postgres-recipient-journey.js";
import { runWithActor } from "./actor-context.js";
import { RecipientJourney } from "../application/recipient-journey.js";
import { PassItForward, normalizeCheckout, type CheckoutInput } from "../application/pass-it-forward.js";
import { GiverTracker } from "../application/giver-tracker.js";
import { StaffOperations } from "../application/staff-operations.js";
import { HelpDesk, PassForwardReminders } from "../application/support.js";

/**
 * Runs against a migrated PostgreSQL database named by TEST_DATABASE_URL (CI provides one). Every identifier is random,
 * so the suite can run repeatedly against the same database. Skipped when the variable is not set.
 */
const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : "set TEST_DATABASE_URL to run the PostgreSQL integration tests";
let pool: pg.Pool | undefined; let repository: PostgresRecipientJourneyRepository | undefined;
function db() { pool ??= new pg.Pool({ connectionString: url }); repository ??= postgresRecipientJourneyRepository(url!, 500000); return { q: (sql: string, params: unknown[] = []) => pool!.query(sql, params), repo: repository }; }
after(async () => { await pool?.end(); await repository?.close(); });

const unique = () => randomBytes(5).toString("hex").toUpperCase();
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const checkout = (overrides: Partial<CheckoutInput> = {}): CheckoutInput => ({ email: "giver@example.com", giverName: "Chioma", note: "For you", deliveryTo: "recipient", deliveryName: "Ade Okafor", deliveryPhone: "0803 000 0000", addressLine1: "12 Market Road", addressLine2: "", city: "Lagos", region: "Surulere", deliveryNotes: "", ...overrides });

async function trail() { const { q } = db(); return (await q(`INSERT INTO trails (code) VALUES ($1) RETURNING id`, [`TRAIL-${unique()}`])).rows[0].id as string; }
async function person(firstName: string | null, consent = true) { const { q } = db(); return (await q(`INSERT INTO participants (first_name,last_initial,area,display_consent) VALUES ($1,$2,$3,$4) RETURNING id`, [firstName, firstName?.[0] ?? null, firstName ? "Lagos" : null, consent])).rows[0].id as string; }
async function box(trailId: string, options: { parent?: string | null; depth?: number; giver?: string | null; recipient?: string | null; fulfilment?: string; recipientStatus?: string; card?: string } = {}) {
  const { q } = db();
  const id = (await q(`INSERT INTO boxes (box_number,trail_id,parent_box_id,depth,fulfilment_status,recipient_status,giver_participant_id,recipient_participant_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [`GS-T${unique()}`, trailId, options.parent ?? null, options.depth ?? 0, options.fulfilment ?? "delivered", options.recipientStatus ?? "unknown", options.giver ?? null, options.recipient ?? null])).rows[0].id as string;
  if (options.card) { const card = (await q(`INSERT INTO box_cards (card_code, token_hash, status) VALUES ($1, $2, 'assigned') RETURNING id`, [`GS-CARD-${unique()}`, hash(options.card)])).rows[0].id; await q(`UPDATE boxes SET card_id=$1 WHERE id=$2`, [card, id]); }
  return id;
}

test("a box's trail shows only its own lineage, with the starter first", { skip }, async () => {
  const { repo } = db(); const t = await trail(); const card = `card-${unique()}`;
  const root = await box(t, { giver: await person("Teni"), recipient: await person("Chioma"), recipientStatus: "decided" });
  const parent = await box(t, { parent: root, depth: 1, recipient: await person("Dayo"), recipientStatus: "decided" });
  const viewer = await box(t, { parent, depth: 2, card });
  await box(t, { parent: root, depth: 1, recipient: await person("Sibling"), recipientStatus: "confirmed" });
  await box(t, { parent: viewer, depth: 3, recipient: await person("Later"), recipientStatus: "confirmed" });
  const found = await repo.findByCardToken(card);
  assert.deepEqual(found?.members.map((member) => [member.position, member.participant.firstName]), [[1, "Teni"], [2, "Chioma"], [3, "Dayo"]]);
});

test("the database refuses a box in the wrong trail or at the wrong depth", { skip }, async () => {
  const { q } = db(); const a = await trail(); const b = await trail(); const parent = await box(a);
  await assert.rejects(() => q(`INSERT INTO boxes (box_number,trail_id,parent_box_id,depth) VALUES ($1,$2,$3,1)`, [`GS-T${unique()}`, b, parent]), /inherit its parent trail/);
  await assert.rejects(() => q(`INSERT INTO boxes (box_number,trail_id,parent_box_id,depth) VALUES ($1,$2,$3,5)`, [`GS-T${unique()}`, a, parent]), /depth \+ 1/);
});

test("only one device can claim a delivered box, even under concurrency", { skip }, async () => {
  const { repo } = db(); const t = await trail(); const card = `card-${unique()}`; const id = await box(t, { card });
  const journey = new RecipientJourney(repo);
  const results = await Promise.allSettled([journey.confirm(card), journey.confirm(card), journey.confirm(card)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal((await journey.getPage(card)).kind, "read-only");
  assert.equal((await repo.claimReceipt(id)), false);
});

test("checkout retries reuse one order with fresh references; payment creates one child that carries the story", { skip }, async () => {
  const { repo, q } = db(); const t = await trail(); const card = `card-${unique()}`; await box(t, { card });
  const journey = new RecipientJourney(repo); const pif = new PassItForward(repo); const staff = new StaffOperations(repo);
  const { sessionToken } = await journey.confirm(card);
  const { referralToken } = await pif.begin(card, sessionToken);
  const [first, second] = await Promise.all([pif.createOrder(referralToken, checkout()), pif.createOrder(referralToken, checkout())]);
  const retry = await pif.createOrder(referralToken, checkout({ email: "new@example.com", note: "Corrected note", addressLine1: "14 Market Road" }));
  assert.equal(first.reference, second.reference); assert.equal(first.reference, retry.reference);
  assert.equal(new Set([first.paymentReference, second.paymentReference, retry.paymentReference]).size, 3);
  for (const reference of [first.paymentReference, retry.paymentReference]) assert.match(reference, /^[A-Z0-9-]+$/);
  assert.equal((await repo.findOrder(retry.paymentReference))?.customerEmail, "new@example.com");

  const paid = await repo.markPaidAndCreateChild(retry.paymentReference);
  assert.deepEqual(await repo.markPaidAndCreateChild(first.paymentReference), { childBoxId: paid.childBoxId, alreadyProcessed: true });
  assert.equal((await q(`SELECT count(*)::int n FROM payment_attempts a JOIN orders o ON o.id = a.order_id WHERE o.reference = $1 AND verified_at IS NOT NULL`, [first.reference])).rows[0].n, 2);
  const child = (await q(`SELECT box_number, paid_at, giver_display_name, giver_note FROM boxes WHERE id = $1`, [paid.childBoxId])).rows[0];
  assert.ok(child.paid_at); assert.equal(child.giver_display_name, "Chioma"); assert.equal(child.giver_note, "Corrected note");
  const label = await staff.deliveryDetails(child.box_number);
  assert.equal(label.addressLine1, "14 Market Road"); assert.equal(label.contactPhone, "0803 000 0000"); assert.equal(label.deliveryTo, "recipient");
  await staff.recordDeliveryDetails(child.box_number, { addressLine1: "16 Market Road", addressLine2: null, city: "Lagos", region: null, deliveryNotes: null });
  assert.equal((await staff.deliveryDetails(child.box_number)).contactPhone, "0803 000 0000");

  const tracker = await new GiverTracker(repo).getPage((first.trackerToken ?? second.trackerToken)!);
  assert.equal(tracker.kind, "tracker");
  if (tracker.kind === "tracker") { assert.deepEqual(tracker.stages.map((stage) => stage.state), ["done", "done", "current", "upcoming", "upcoming"]); assert.equal(tracker.startedTrail, false); }
  await assert.rejects(() => pif.createOrder(referralToken, checkout()), /no longer awaiting payment/);
});

test("staff fulfil a box end to end; the card must be bound before packing; history names each actor", { skip }, async () => {
  const { repo, q } = db(); const staff = new StaffOperations(repo); const card = `card-${unique()}`; const cardCode = `GS-CARD-${unique()}`;
  const { boxNumber } = await runWithActor("admin@example.com", () => staff.createStarterBox());
  await q(`INSERT INTO box_cards (card_code, token_hash) VALUES ($1, $2)`, [cardCode, hash(card)]);
  await runWithActor("ops@example.com", async () => {
    await staff.advanceFulfilment(boxNumber, "paid");
    await staff.recordPacking(boxNumber, { packedBy: "Bisi", checklistComplete: true, notes: null });
    await assert.rejects(() => staff.advanceFulfilment(boxNumber, "packed"), /Assign a printed card/);
    await staff.assignCard(boxNumber, cardCode);
    await staff.advanceFulfilment(boxNumber, "packed");
    await staff.recordCollection(boxNumber, { courier: "GIG", handoffReference: null }); await staff.advanceFulfilment(boxNumber, "collected");
    await staff.recordDelivery(boxNumber, { deliveredBy: "GIG", proofReference: "POD-1" }); await staff.advanceFulfilment(boxNumber, "delivered");
  });
  await runWithActor("public", () => new RecipientJourney(repo).confirm(card));
  const actors = (await staff.auditHistory(boxNumber)).map((event) => event.actor);
  assert.ok(actors.includes("admin@example.com")); assert.ok(actors.includes("ops@example.com")); assert.ok(actors.includes("public"));
  assert.ok(!actors.includes("system"), `unattributed events: ${actors.join(", ")}`);
});

test("help requests queue oldest first, are limited per box, and record who resolved them", { skip }, async () => {
  const { repo } = db(); const card = `card-${unique()}`; await box(await trail(), { card }); const help = new HelpDesk(repo);
  await help.submit(card, { category: "not_arrived", message: "Courier said tomorrow", contact: "+234 803 000 0000" });
  await help.submit(card, { category: "other", message: "", contact: "" });
  await help.submit(card, { category: "damaged", message: "", contact: "" });
  await assert.rejects(() => help.submit(card, { category: "other", message: "", contact: "" }), /already have your request/);
  const boxNumber = (await repo.findByCardToken(card))!.boxNumber;
  const mine = (await help.openRequests()).filter((request) => request.boxNumber === boxNumber);
  assert.deepEqual(mine.map((request) => request.category), ["not_arrived", "other", "damaged"]);
  await help.resolve(mine[0]!.id, "ops@example.com");
  assert.equal((await help.requestsForBox(boxNumber)).find((request) => request.id === mine[0]!.id)?.resolvedBy, "ops@example.com");
});

test("a pass-forward reminder: one per box, re-issued link, any-phone accept, final decline, passed-on flag", { skip }, async () => {
  const { repo, q } = db(); const journey = new RecipientJourney(repo); const pif = new PassItForward(repo);
  const reminders = new PassForwardReminders(repo, () => new Date(Date.now() - 25 * 3600_000));
  const t = await trail(); const [a, b, c] = [`card-${unique()}`, `card-${unique()}`, `card-${unique()}`];
  for (const card of [a, b, c]) await box(t, { card });

  const sa = await journey.confirm(a);
  const { token } = await reminders.request(a, sa.sessionToken, { channel: "email", destination: "Ade@Example.com", consent: true });
  await assert.rejects(() => reminders.request(a, sa.sessionToken, { channel: "sms", destination: "08030000000", consent: true }), /already asked/);
  const boxA = (await repo.findByCardToken(a))!.boxNumber;
  const due = (await reminders.list()).find((reminder) => reminder.boxNumber === boxA)!;
  assert.equal(due.destination, "ade@example.com");
  const prepared = await reminders.prepare(due.id, "https://gratitude.example");
  assert.deepEqual(await reminders.linkPage(token), { kind: "invalid" });
  await reminders.markSent(due.id);
  const accepted = await reminders.accept(prepared.link.split("/r/")[1]!);
  assert.ok(await repo.findHolderSession(accepted.sessionToken));
  assert.equal((await pif.checkoutPage(accepted.referralToken)).kind, "ready");

  const sb = await journey.confirm(b);
  const { token: declineToken } = await reminders.request(b, sb.sessionToken, { channel: "sms", destination: "0803 111 2222", consent: true });
  await reminders.decline(declineToken);
  assert.equal((await repo.findByCardToken(b))?.recipientStatus, "decided");
  await assert.rejects(() => reminders.accept(declineToken), /no longer valid/);

  const sc = await journey.confirm(c);
  await reminders.request(c, sc.sessionToken, { channel: "email", destination: "x@example.com", consent: true });
  const { referralToken } = await pif.begin(c, sc.sessionToken);
  await repo.markPaidAndCreateChild((await pif.createOrder(referralToken, checkout())).paymentReference);
  const boxC = (await repo.findByCardToken(c))!.boxNumber;
  assert.equal((await reminders.list()).find((reminder) => reminder.boxNumber === boxC)?.passedOn, true);
  assert.equal((await q(`SELECT consent_text FROM pass_forward_reminders WHERE id = $1`, [due.id])).rows[0].consent_text, "Send me one reminder about this box. Nothing else.");
});

test("two automatic senders running at once deliver each due email reminder exactly once", { skip }, async () => {
  const { repo } = db(); const journey = new RecipientJourney(repo);
  const reminders = new PassForwardReminders(repo, () => new Date(Date.now() - 25 * 3600_000));
  const t = await trail(); const cards = [`card-${unique()}`, `card-${unique()}`, `card-${unique()}`];
  for (const card of cards) { await box(t, { card }); const { sessionToken } = await journey.confirm(card); await reminders.request(card, sessionToken, { channel: "email", destination: `${unique().toLowerCase()}@example.com`, consent: true }); }
  const sent: string[] = [];
  const sender = { name: "test", send: async (message: { to: string }) => { await new Promise((resolve) => setTimeout(resolve, 5)); sent.push(message.to); } };
  await Promise.all([reminders.dispatchDueEmails(sender, "https://x"), reminders.dispatchDueEmails(sender, "https://x")]);
  assert.equal(sent.length, new Set(sent).size, "no address was emailed twice");
  const mine = (await reminders.list()).filter((reminder) => sent.includes(reminder.destination));
  assert.equal(mine.length, 3); assert.ok(mine.every((reminder) => reminder.status === "sent" && reminder.attempts === 1));
});

test("a recovery link ends other holder sessions in the same transaction and is attributed", { skip }, async () => {
  const { repo, q } = db(); const card = `card-${unique()}`; await box(await trail(), { card });
  const journey = new RecipientJourney(repo); const { HolderRecovery } = await import("../application/support.js");
  const old = await journey.confirm(card);
  const boxNumber = (await repo.findByCardToken(card))!.boxNumber;
  const { link } = await runWithActor("admin@example.com", () => new HolderRecovery(repo).issue(boxNumber, "admin@example.com", "https://x"));
  const token = link.split("/h/")[1]!;
  const fresh = await runWithActor("public", () => new HolderRecovery(repo).use(token));
  assert.ok(fresh);
  assert.equal(await repo.findHolderSession(old.sessionToken), null);
  assert.ok(await repo.findHolderSession(fresh!));
  assert.equal(await new HolderRecovery(repo).use(token), null);
  const actors = (await q(`SELECT e.actor FROM staff_audit_events e JOIN holder_recovery_links l ON l.id::text = e.target_id WHERE l.token_hash = $1 ORDER BY e.occurred_at`, [hash(token)])).rows.map((row) => row.actor);
  assert.deepEqual(actors, ["admin@example.com", "public"]);
});

test("an unattributed write on a connection that was attributed earlier is recorded as 'system', never blank", { skip }, async () => {
  const client = new pg.Client({ connectionString: url }); await client.connect();
  try {
    const code = `TRAIL-${unique()}`;
    await client.query("BEGIN"); await client.query("SELECT set_config('app.actor', 'ops@example.com', true)"); await client.query("COMMIT");
    const id = (await client.query(`INSERT INTO trails (code) VALUES ($1) RETURNING id`, [code])).rows[0].id;
    const boxId = (await client.query(`INSERT INTO boxes (box_number, trail_id, depth) VALUES ($1, $2, 0) RETURNING id`, [`GS-T${unique()}`, id])).rows[0].id;
    assert.equal((await client.query(`SELECT actor FROM staff_audit_events WHERE target_id = $1`, [boxId])).rows[0]?.actor, "system");
  } finally { await client.end(); }
});

test("erasing a recipient's details removes their personal data but keeps the trail; finished boxes only", { skip }, async () => {
  const { repo, q } = db(); const { DataRetention } = await import("../application/privacy.js");
  const retention = new DataRetention(repo); const journey = new RecipientJourney(repo); const pif = new PassItForward(repo);
  const t = await trail(); const card = `card-${unique()}`; const id = await box(t, { card });
  const { sessionToken } = await journey.confirm(card);
  await journey.registerProfile(card, sessionToken, { firstName: "Ade", lastInitial: "O", area: "Yaba", displayConsent: true });
  const boxNumber = (await repo.findByCardToken(card))!.boxNumber;
  await q(`INSERT INTO delivery_details (box_id, address_line_1, city, contact_name, contact_phone) VALUES ($1, '12 Market Road', 'Lagos', 'Ade', '0803 000 0000')`, [id]);
  await new HelpDesk(repo).submit(card, { category: "other", message: "My number is 0803", contact: "ade@example.com" });
  await new PassForwardReminders(repo).request(card, sessionToken, { channel: "email", destination: "ade@example.com", consent: true });
  const { referralToken } = await pif.begin(card, sessionToken);
  const child = await repo.markPaidAndCreateChild((await pif.createOrder(referralToken, checkout({ giverName: "Ade" }))).paymentReference);

  await runWithActor("admin@example.com", () => retention.erase(boxNumber, "recipient", "admin@example.com"));
  const person = (await q(`SELECT p.* FROM participants p JOIN boxes b ON b.recipient_participant_id = p.id WHERE b.id = $1`, [id])).rows[0];
  assert.deepEqual([person.first_name, person.last_initial, person.area, person.email, person.phone, person.display_consent], [null, null, null, null, null, false]);
  const label = (await q(`SELECT address_line_1, contact_name, contact_phone FROM delivery_details WHERE box_id = $1`, [id])).rows[0];
  assert.deepEqual(label, { address_line_1: "[erased]", contact_name: null, contact_phone: null });
  assert.equal((await q(`SELECT destination FROM pass_forward_reminders WHERE box_id = $1`, [id])).rows[0].destination, "[erased]");
  assert.deepEqual((await q(`SELECT message, contact FROM help_requests WHERE box_id = $1`, [id])).rows[0], { message: null, contact: null });
  assert.equal((await q(`SELECT giver_display_name FROM boxes WHERE id = $1`, [child.childBoxId])).rows[0].giver_display_name, null);
  assert.equal((await q(`SELECT trail_id FROM boxes WHERE id = $1`, [child.childBoxId])).rows[0].trail_id, t, "the trail keeps its shape");
  assert.equal((await q(`SELECT count(*)::int n FROM orders WHERE child_box_id = $1 AND customer_email <> ''`, [child.childBoxId])).rows[0].n, 1, "payment records are kept");
  const event = (await q(`SELECT actor, metadata FROM staff_audit_events WHERE action = 'personal_data.erase' AND target_id = $1`, [id])).rows[0];
  assert.deepEqual(event, { actor: "admin@example.com", metadata: { subject: "recipient" } });

  const inFlight = await box(t, { fulfilment: "packed" });
  const inFlightNumber = (await q(`SELECT box_number FROM boxes WHERE id = $1`, [inFlight])).rows[0].box_number;
  await assert.rejects(() => retention.erase(inFlightNumber, "recipient", "admin@example.com"), /delivered, cancelled or refunded/);
});

test("erasing a giver removes their name and note from the box", { skip }, async () => {
  const { q, repo } = db(); const { DataRetention } = await import("../application/privacy.js");
  const t = await trail(); const id = await box(t, { giver: await person("Teni") });
  await q(`UPDATE boxes SET giver_note = 'For every Sunday', giver_display_name = 'Teni' WHERE id = $1`, [id]);
  const boxNumber = (await q(`SELECT box_number FROM boxes WHERE id = $1`, [id])).rows[0].box_number;
  await new DataRetention(repo).erase(boxNumber, "giver", "admin@example.com");
  const row = (await q(`SELECT b.giver_note, b.giver_display_name, p.first_name FROM boxes b JOIN participants p ON p.id = b.giver_participant_id WHERE b.id = $1`, [id])).rows[0];
  assert.deepEqual(row, { giver_note: null, giver_display_name: null, first_name: null });
});

test("expired secrets are purged after the grace period; referrals that became orders are kept", { skip }, async () => {
  const { q, repo } = db(); const { DataRetention } = await import("../application/privacy.js");
  const t = await trail(); const id = await box(t);
  const old = `now() - interval '10 days'`;
  await q(`INSERT INTO holder_sessions (box_id, token_hash, expires_at) VALUES ($1, $2, ${old}), ($1, $3, now() + interval '1 day')`, [id, `h-${unique()}`, `h-${unique()}`]);
  const unused = (await q(`INSERT INTO referrals (parent_box_id, token_hash, expires_at) VALUES ($1, $2, ${old}) RETURNING id`, [id, `r-${unique()}`])).rows[0].id;
  const ordered = (await q(`INSERT INTO referrals (parent_box_id, token_hash, expires_at) VALUES ($1, $2, ${old}) RETURNING id`, [id, `r-${unique()}`])).rows[0].id;
  await q(`INSERT INTO orders (reference, referral_id, trail_id, parent_box_id, amount_kobo, customer_email, status) VALUES ($1, $2, $3, $4, 100, 'x@example.com', 'pending_payment')`, [`ORD-${unique()}`, ordered, t, id]);
  const result = await new DataRetention(repo).purge(7);
  assert.ok(result.holderSessions >= 1 && result.referrals >= 1);
  assert.equal((await q(`SELECT count(*)::int n FROM holder_sessions WHERE box_id = $1`, [id])).rows[0].n, 1, "the live session survives");
  assert.equal((await q(`SELECT count(*)::int n FROM referrals WHERE id = $1`, [unused])).rows[0].n, 0);
  assert.equal((await q(`SELECT count(*)::int n FROM referrals WHERE id = $1`, [ordered])).rows[0].n, 1);
});

test("dashboard analytics count boxes, the recipient journey and generations without personal data", { skip }, async () => {
  const { repo } = db();
  const before = await repo.dashboardAnalytics();
  const t = await trail();
  const root = await box(t, { recipient: await person("Private"), recipientStatus: "decided" });
  await box(t, { parent: root, depth: 1, fulfilment: "paid" });
  await box(t, { fulfilment: "delivered", recipientStatus: "scanned" });
  const after = await repo.dashboardAnalytics();
  assert.equal(after.totals.boxes - before.totals.boxes, 3);
  assert.equal(after.totals.trails - before.totals.trails, 1);
  assert.equal(after.pipeline.paid - before.pipeline.paid, 1);
  assert.equal(after.journey.delivered - before.journey.delivered, 2);
  assert.equal(after.journey.opened - before.journey.opened, 2);
  assert.equal(after.journey.received - before.journey.received, 1);
  assert.equal(after.journey.passedOn - before.journey.passedOn, 1);
  assert.equal(after.weekly.length, 12);
  assert.ok(after.weekly.at(-1)!.created - before.weekly.at(-1)!.created >= 3);
  assert.ok(after.generations.some((row) => row.generation === 2));
  assert.ok(!JSON.stringify(after).includes("Private"), "no names in analytics");
});

test("a paid starter order creates a new trail and its first box, with the story and delivery label; retries reuse the order", { skip }, async () => {
  const { q, repo } = db();
  const token = `starter-${unique()}-${unique()}-${unique()}-${unique()}`;
  const first = await repo.createPendingStarterOrder(token, { ...normalizeCheckout(checkout()), giverName: "Teni" });
  assert.ok(first?.trackerToken);
  const retry = await repo.createPendingStarterOrder(token, { ...normalizeCheckout(checkout()), giverName: "Teni", note: "Updated" });
  assert.equal(retry?.reference, first!.reference); assert.notEqual(retry?.paymentReference, first!.paymentReference);
  const paid = await runWithActor("test-payment", () => repo.markPaidAndCreateChild(retry!.paymentReference));
  assert.equal(paid.alreadyProcessed, false);
  const box = (await q(`SELECT b.depth, b.parent_box_id, b.fulfilment_status, b.giver_display_name, b.giver_note, b.trail_id, t.code, o.trail_id AS order_trail, o.kind
    FROM boxes b JOIN trails t ON t.id = b.trail_id JOIN orders o ON o.child_box_id = b.id WHERE b.id = $1`, [paid.childBoxId])).rows[0];
  assert.deepEqual([box.depth, box.parent_box_id, box.fulfilment_status, box.giver_display_name, box.giver_note, box.kind], [0, null, "paid", "Teni", "Updated", "starter"]);
  assert.match(box.code, /^TRAIL-[0-9A-F]{12}$/); assert.equal(box.order_trail, box.trail_id);
  const label = (await q(`SELECT contact_name, city FROM delivery_details WHERE box_id = $1`, [paid.childBoxId])).rows[0];
  assert.deepEqual([label.contact_name, label.city], ["Ade Okafor", "Lagos"]);
  assert.equal((await repo.markPaidAndCreateChild(first!.reference)).childBoxId, paid.childBoxId, "a second verified attempt creates nothing new");
  assert.equal(await repo.createPendingStarterOrder(token, normalizeCheckout(checkout())), null, "a paid order is closed to further checkouts");
  await assert.rejects(() => q(`INSERT INTO orders (kind, reference, amount_kobo, customer_email, status, parent_box_id) VALUES ('starter', $1, 100, 'a@b.co', 'pending_payment', $2)`, [`ORD-${unique()}`, paid.childBoxId]), /orders_kind_shape/);
});

test("staff sign in with email and password: lockout, one-time links, sessions ended by password changes and revocation", { skip }, async () => {
  const { q, repo } = db();
  const { StaffAccounts } = await import("../application/staff-accounts.js");
  const { StaffOperations } = await import("../application/staff-operations.js");
  const accounts = new StaffAccounts(repo, undefined);
  const email = `staff-${unique().toLowerCase()}@example.com`;
  await new StaffOperations(repo).provisionStaffUser(email, "operations");
  await assert.rejects(() => accounts.signIn(email, "anything at all"), /don't match/, "no password until the invite is used");
  const invite = (await accounts.issuePasswordLink(email, "invite", "admin@example.com"))!;
  assert.deepEqual(await accounts.passwordLink(invite), { email, purpose: "invite" });
  const first = await accounts.completePasswordLink(invite, "green boxes travel far", "green boxes travel far");
  assert.deepEqual(await accounts.identify(first.sessionToken), { actor: email, role: "operations" });
  assert.equal(await accounts.passwordLink(invite), null, "the invite works once");
  const stored = (await q(`SELECT password_hash FROM staff_users WHERE email = $1`, [email])).rows[0].password_hash as string;
  assert.match(stored, /^scrypt\$16384\$8\$1\$/); assert.ok(!stored.includes("green"), "only a hash is stored");

  for (let i = 0; i < 5; i++) await assert.rejects(() => accounts.signIn(email, "wrong password!"));
  await assert.rejects(() => accounts.signIn(email, "green boxes travel far"), /Too many attempts/);
  const reset = (await accounts.issuePasswordLink(email, "reset", "admin@example.com"))!;
  await accounts.completePasswordLink(reset, "a fresh new phrase", "a fresh new phrase");
  assert.equal(await accounts.identify(first.sessionToken), null, "a reset ends earlier sessions");
  const second = await accounts.signIn(email, "a fresh new phrase");
  assert.ok(await accounts.identify(second.sessionToken), "a reset also clears the lockout");
  const audit = (await q(`SELECT action FROM staff_audit_events WHERE target_type = 'staff_users' AND target_id = (SELECT id::text FROM staff_users WHERE email = $1) ORDER BY occurred_at`, [email])).rows.map((row) => row.action);
  assert.deepEqual(audit.filter((action) => action.startsWith("staff.")), ["staff.invite_link", "staff.password_set", "staff.locked", "staff.reset_link", "staff.password_set"]);

  await new StaffOperations(repo).revokeStaffUser(email);
  assert.equal(await accounts.identify(second.sessionToken), null, "revoking access signs the person out everywhere");
  assert.equal(await accounts.issuePasswordLink(email, "reset", "admin@example.com"), null);
});
