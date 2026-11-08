import assert from "node:assert/strict";
import test from "node:test";
import { RecipientJourney } from "./recipient-journey.js";
import { InMemoryRecipientJourneyRepository, demoRecipientBoxes } from "../infrastructure/in-memory-recipient-journey.js";

test("a delivered card stays private until receipt is confirmed on this device", async () => {
  const journey = new RecipientJourney(new InMemoryRecipientJourneyRepository(demoRecipientBoxes));
  assert.deepEqual(await journey.getPage("demo-card-token"), { kind: "confirm-receipt", boxNumber: "GS-00001" });
});
test("confirmation creates a holder session that can view a consent-safe reveal", async () => {
  const journey = new RecipientJourney(new InMemoryRecipientJourneyRepository(demoRecipientBoxes));
  const { sessionToken } = await journey.confirm("demo-card-token");
  const page = await journey.getPage("demo-card-token", sessionToken);
  assert.equal(page.kind, "reveal");
  if (page.kind === "reveal") { assert.equal(page.giver, "Dayo L. · Surulere"); assert.deepEqual(page.trail, ["Teni A. · Yaba", "Chioma N. · Ikeja", "Dayo L. · Surulere"]); assert.equal(page.position, 4); }
});

test("once received, a second device cannot claim the box and sees only the public-safe trail", async () => {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
  const journey = new RecipientJourney(repository);
  await journey.confirm("demo-card-token");
  await assert.rejects(() => journey.confirm("demo-card-token"), /already been received/);
  await assert.rejects(() => journey.confirm("demo-card-token", "forged-session"), /already been received/);
  assert.deepEqual(await journey.getPage("demo-card-token"), { kind: "read-only", boxNumber: "GS-00001", trail: ["Teni A. · Yaba", "Chioma N. · Ikeja", "Dayo L. · Surulere"] });
});

test("the holder confirming again keeps their session and never moves the box backwards", async () => {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
  const journey = new RecipientJourney(repository);
  const { sessionToken } = await journey.confirm("demo-card-token");
  await journey.registerProfile("demo-card-token", sessionToken, { firstName: "Ayo", lastInitial: "O", area: "Yaba", displayConsent: true });
  assert.deepEqual(await journey.confirm("demo-card-token", sessionToken), { sessionToken });
  assert.equal((await repository.findByCardToken("demo-card-token"))?.recipientStatus, "registered");
});

test("a box cannot be confirmed before it is delivered", async () => {
  const [demo] = demoRecipientBoxes;
  const journey = new RecipientJourney(new InMemoryRecipientJourneyRepository([{ ...demo!, fulfilmentStatus: "collected" }]));
  await assert.rejects(() => journey.confirm("demo-card-token"), /delivered/);
});
test("an unknown card produces no box information", async () => {
  const journey = new RecipientJourney(new InMemoryRecipientJourneyRepository(demoRecipientBoxes));
  assert.deepEqual(await journey.getPage("wrong-token"), { kind: "not-found" });
});

test("only the confirmed holder can choose their consent-safe public trail label", async () => {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
  const journey = new RecipientJourney(repository);
  await assert.rejects(() => journey.registerProfile("demo-card-token", undefined, { firstName: "Ayo", lastInitial: "O", area: "Yaba", displayConsent: true }), /confirmed holder/);
  const { sessionToken } = await journey.confirm("demo-card-token");
  await journey.registerProfile("demo-card-token", sessionToken, { firstName: "Ayo", lastInitial: "O", area: "Yaba", displayConsent: true });
  assert.equal((await repository.findByCardToken("demo-card-token"))?.recipientStatus, "registered");
});

test("a recipient who declines display consent stores no public label", async () => {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
  const journey = new RecipientJourney(repository);
  const { sessionToken } = await journey.confirm("demo-card-token");
  await journey.registerProfile("demo-card-token", sessionToken, { firstName: "", lastInitial: "", area: "", displayConsent: false });
  assert.equal((await journey.profilePage("demo-card-token", sessionToken)).kind, "ready");
  assert.deepEqual(repository.recipientProfileFor("box-demo-1"), { firstName: null, lastInitial: null, area: null, displayConsent: false });
});

test("only a confirmed holder can choose reminder email consent", async () => {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes); const journey = new RecipientJourney(repository);
  await assert.rejects(() => journey.setReminderPreference("demo-card-token", undefined, true), /confirmed holder/);
  const { sessionToken } = await journey.confirm("demo-card-token"); await journey.setReminderPreference("demo-card-token", sessionToken, true);
  assert.equal(await journey.reminderPreference("demo-card-token", sessionToken), true);
});
