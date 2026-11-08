import assert from "node:assert/strict";
import test from "node:test";
import { HelpDesk, PassForwardReminders, SupportValidationError, reminderConsentText, reminderMessage } from "./support.js";
import { RecipientJourney } from "./recipient-journey.js";
import { PassItForward } from "./pass-it-forward.js";
import { InMemoryRecipientJourneyRepository, demoRecipientBoxes } from "../infrastructure/in-memory-recipient-journey.js";

const dayAgo = () => new Date(Date.now() - 25 * 60 * 60 * 1000);
async function holder(now?: () => Date) {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
  const journey = new RecipientJourney(repository);
  const { sessionToken } = await journey.confirm("demo-card-token");
  return { repository, journey, sessionToken, reminders: new PassForwardReminders(repository, now), help: new HelpDesk(repository) };
}
const blankHelp = { category: "other", message: "", contact: "" };
const request = { channel: "email", destination: " Ade@Example.com ", consent: true };

test("anyone holding the card can ask for help, without seeing any participant data", async () => {
  const { help } = await holder();
  assert.deepEqual(await help.page("demo-card-token"), { kind: "ready", boxNumber: "GS-00001" });
  assert.deepEqual(await help.page("unknown"), { kind: "not-found" });
  await help.submit("demo-card-token", { category: "lost_access", message: "  New phone  ", contact: "" });
  const [saved] = await help.openRequests();
  assert.equal(saved?.category, "lost_access"); assert.equal(saved?.message, "New phone"); assert.equal(saved?.contact, null);
});

test("help requests are validated and limited to three open requests per box", async () => {
  const { help } = await holder();
  for (const [input, pattern] of [[{ category: "refund-me" }, /Choose what/], [{ contact: "not a contact" }, /email address or phone/], [{ message: "x".repeat(1001) }, /1,000/]] as const) {
    await assert.rejects(() => help.submit("demo-card-token", { ...blankHelp, ...input }), (error) => error instanceof SupportValidationError && pattern.test(error.message));
  }
  for (let i = 0; i < 3; i++) await help.submit("demo-card-token", { category: "other", message: "", contact: "0803 000 0000" });
  await assert.rejects(() => help.submit("demo-card-token", { category: "other", message: "", contact: "" }), /already have your request/);
  const [first] = await help.openRequests();
  await help.resolve(first!.id, "ops@example.com");
  await assert.rejects(() => help.resolve(first!.id, "ops@example.com"), /already resolved/);
  assert.equal((await help.resolvedRequests())[0]?.resolvedBy, "ops@example.com");
});

test("only the holder can ask for a reminder, with explicit consent, once per box", async () => {
  const { reminders, sessionToken } = await holder();
  await assert.rejects(() => reminders.request("demo-card-token", undefined, request), /confirmed holder/);
  await assert.rejects(() => reminders.request("demo-card-token", sessionToken, { ...request, consent: false }), /Tick the box/);
  await assert.rejects(() => reminders.request("demo-card-token", sessionToken, { ...request, channel: "sms", destination: "abc" }), /phone number/);
  const before = Date.now();
  const { sendAt } = await reminders.request("demo-card-token", sessionToken, request);
  assert.ok(sendAt.getTime() - before >= 24 * 60 * 60 * 1000 - 1000);
  assert.equal(await reminders.canRequest("demo-card-token", sessionToken), false);
  await assert.rejects(() => reminders.request("demo-card-token", sessionToken, request), /already asked/);
  const [staffView] = await reminders.list();
  assert.equal(staffView?.destination, "ade@example.com");
  assert.equal(reminderConsentText, "Send me one reminder about this box. Nothing else.");
});

test("the reminder link signs in on any phone and leads to checkout on the same trail", async () => {
  const { repository, reminders, sessionToken } = await holder();
  const { token } = await reminders.request("demo-card-token", sessionToken, request);
  assert.deepEqual(await reminders.linkPage(token), { kind: "ready", boxNumber: "GS-00001" });
  const { sessionToken: newPhone, referralToken } = await reminders.accept(token);
  assert.deepEqual(await repository.findHolderSession(newPhone), { boxId: "box-demo-1" });
  assert.deepEqual(await new PassItForward(repository).checkoutPage(referralToken), { kind: "ready", trailId: "trail-demo" });
  // Re-opening after "yes" (e.g. abandoned checkout) still works; "no" is no longer possible.
  await reminders.accept(token);
  await assert.rejects(() => reminders.decline(token), /no longer valid/);
});

test("\"No thanks\" from the reminder is final and marks the box decided", async () => {
  const { repository, reminders, sessionToken } = await holder();
  const { token } = await reminders.request("demo-card-token", sessionToken, request);
  await reminders.decline(token);
  assert.equal((await repository.findByCardToken("demo-card-token"))?.recipientStatus, "decided");
  assert.deepEqual(await reminders.linkPage(token), { kind: "answered", response: "declined" });
  await assert.rejects(() => reminders.accept(token), /no longer valid/);
  await assert.rejects(() => reminders.decline(token), /no longer valid/);
});

test("staff can prepare a message only once a reminder is due; preparing replaces the link", async () => {
  const early = await holder();
  await early.reminders.request("demo-card-token", early.sessionToken, request);
  const [notDue] = await early.reminders.list();
  await assert.rejects(() => early.reminders.prepare(notDue!.id, "https://gratitude.example"), /due/);

  const { reminders, sessionToken } = await holder(dayAgo);
  const { token: original } = await reminders.request("demo-card-token", sessionToken, request);
  const [due] = await reminders.list();
  const prepared = await reminders.prepare(due!.id, "https://gratitude.example/");
  assert.match(prepared.link, /^https:\/\/gratitude\.example\/r\/[A-Za-z0-9_-]{43}$/);
  assert.equal(prepared.message, reminderMessage(prepared.link));
  assert.deepEqual(await reminders.linkPage(original), { kind: "invalid" });
  await reminders.markSent(due!.id);
  await assert.rejects(() => reminders.markSent(due!.id), /scheduled/);
  assert.equal((await reminders.linkPage(prepared.link.split("/r/")[1]!)).kind, "ready");
});

test("the reminder message never names the giver, the recipient or anyone on the trail", () => {
  const message = reminderMessage("https://gratitude.example/r/abc");
  for (const name of ["Dayo", "Teni", "Chioma", "Ade"]) assert.ok(!message.includes(name));
  assert.match(message, /only reminder/);
});

test("due email reminders are sent automatically with a working link; text-message reminders stay manual", async () => {
  const { reminders, sessionToken } = await holder(dayAgo);
  await reminders.request("demo-card-token", sessionToken, { channel: "email", destination: "ade@example.com", consent: true });
  const outbox: Array<{ to: string; subject: string; text: string }> = [];
  const result = await reminders.dispatchDueEmails({ name: "test", send: async (message) => { outbox.push(message); } }, "https://gratitude.example");
  assert.deepEqual(result, { sent: 1, failed: 0 });
  assert.equal(outbox[0]?.to, "ade@example.com");
  const link = outbox[0]!.text.match(/https:\/\/gratitude\.example\/r\/([A-Za-z0-9_-]+)/)![1]!;
  assert.deepEqual(await reminders.linkPage(link), { kind: "ready", boxNumber: "GS-00001" });
  assert.equal((await reminders.list())[0]?.status, "sent");
  assert.deepEqual(await reminders.dispatchDueEmails({ name: "test", send: async () => assert.fail("nothing else is due") }, "https://gratitude.example"), { sent: 0, failed: 0 });

  const sms = await holder(dayAgo);
  await sms.reminders.request("demo-card-token", sms.sessionToken, { channel: "sms", destination: "08030000000", consent: true });
  assert.deepEqual(await sms.reminders.dispatchDueEmails({ name: "test", send: async () => assert.fail("SMS is never emailed") }, "https://x"), { sent: 0, failed: 0 });
});

test("a failed automatic send stays scheduled for a later retry and is counted", async () => {
  const { reminders, sessionToken } = await holder(dayAgo);
  await reminders.request("demo-card-token", sessionToken, { channel: "email", destination: "ade@example.com", consent: true });
  const failing = { name: "down", send: async () => { throw new Error("provider down"); } };
  assert.deepEqual(await reminders.dispatchDueEmails(failing, "https://x"), { sent: 0, failed: 1 });
  const [reminder] = await reminders.list();
  assert.equal(reminder?.status, "scheduled"); assert.equal(reminder?.attempts, 1);
  // Claimed within the last 10 minutes, so an immediate second run does not retry it.
  assert.deepEqual(await reminders.dispatchDueEmails(failing, "https://x"), { sent: 0, failed: 0 });
});

test("reminders that are not due yet are never sent automatically", async () => {
  const { reminders, sessionToken } = await holder();
  await reminders.request("demo-card-token", sessionToken, { channel: "email", destination: "ade@example.com", consent: true });
  assert.deepEqual(await reminders.dispatchDueEmails({ name: "test", send: async () => assert.fail("not due") }, "https://x"), { sent: 0, failed: 0 });
});

test("a recovery link moves a received box to a new phone once, and signs out every other phone", async () => {
  const { repository, journey, sessionToken } = await holder();
  const recovery = new (await import("./support.js")).HolderRecovery(repository);
  const { link, expiresAt } = await recovery.issue("GS-00001", "admin@example.com", "https://gratitude.example/");
  assert.match(link, /^https:\/\/gratitude\.example\/h\/[A-Za-z0-9_-]{43}$/);
  assert.ok(expiresAt.getTime() - Date.now() > 47 * 3600_000);
  const token = link.split("/h/")[1]!;
  const newPhone = await recovery.use(token);
  assert.ok(newPhone);
  assert.equal((await journey.getPage("demo-card-token", newPhone!)).kind, "reveal");
  assert.equal((await journey.getPage("demo-card-token", sessionToken)).kind, "read-only", "the old phone is signed out");
  assert.equal(await recovery.use(token), null, "single use");
});

test("recovery links are refused for boxes not yet received, and expire", async () => {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
  const { HolderRecovery } = await import("./support.js");
  await assert.rejects(() => new HolderRecovery(repository).issue("GS-00001", "admin@example.com", "https://x"), /already been received/);
  await new RecipientJourney(repository).confirm("demo-card-token");
  const stale = new HolderRecovery(repository, () => new Date(Date.now() - 49 * 3600_000));
  const { link } = await stale.issue("GS-00001", "admin@example.com", "https://x");
  assert.equal(await stale.use(link.split("/h/")[1]!), null);
});
