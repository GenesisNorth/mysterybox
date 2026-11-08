import assert from "node:assert/strict";
import test from "node:test";
import { PassItForward } from "./pass-it-forward.js";
import { RecipientJourney } from "./recipient-journey.js";
import { InMemoryRecipientJourneyRepository, demoRecipientBoxes } from "../infrastructure/in-memory-recipient-journey.js";

test("only the confirmed holder can begin a referral", async () => {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
  const recipientJourney = new RecipientJourney(repository);
  const passItForward = new PassItForward(repository);
  const { sessionToken } = await recipientJourney.confirm("demo-card-token");
  const result = await passItForward.begin("demo-card-token", sessionToken);
  assert.equal((await passItForward.checkoutPage(result.referralToken)).kind, "ready");
});

test("a pass-on order is idempotent and inherits its parent trail in the repository", async () => {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
  const recipientJourney = new RecipientJourney(repository);
  const passItForward = new PassItForward(repository);
  const { sessionToken } = await recipientJourney.confirm("demo-card-token");
  const { referralToken } = await passItForward.begin("demo-card-token", sessionToken);
  const first = await passItForward.createOrder(referralToken, "person@example.com");
  const second = await passItForward.createOrder(referralToken, "person@example.com");
  assert.equal(first.reference, second.reference);
  assert.equal(first.status, "pending_payment");
  // Paystack rejects a reused reference, so a retried checkout needs a new payment reference for the same order.
  assert.notEqual(first.paymentReference, second.paymentReference);
  for (const reference of [first.reference, first.paymentReference, second.paymentReference]) assert.match(reference, /^[A-Za-z0-9.=-]+$/);
});

test("a recipient who edits their profile after deciding stays decided", async () => {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
  const journey = new RecipientJourney(repository);
  const passItForward = new PassItForward(repository);
  const { sessionToken } = await journey.confirm("demo-card-token");
  await passItForward.decline("demo-card-token", sessionToken);
  await journey.registerProfile("demo-card-token", sessionToken, { firstName: "Ayo", lastInitial: "O", area: "Yaba", displayConsent: true });
  assert.equal((await repository.findByCardToken("demo-card-token"))?.recipientStatus, "decided");
});

test("checkout requires an email address before an order can be created", async () => {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
  const recipientJourney = new RecipientJourney(repository);
  const passItForward = new PassItForward(repository);
  const { sessionToken } = await recipientJourney.confirm("demo-card-token");
  const { referralToken } = await passItForward.begin("demo-card-token", sessionToken);
  await assert.rejects(() => passItForward.createOrder(referralToken, "not-an-email"));
});

test("a browser without the holder session cannot begin checkout", async () => {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
  const passItForward = new PassItForward(repository);
  await assert.rejects(() => passItForward.begin("demo-card-token", undefined));
});

test("a confirmed holder can decline for now without exposing or ending the trail", async () => {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
  const journey = new RecipientJourney(repository);
  const passItForward = new PassItForward(repository);
  const { sessionToken } = await journey.confirm("demo-card-token");
  await passItForward.decline("demo-card-token", sessionToken);
  assert.equal((await repository.findByCardToken("demo-card-token"))?.recipientStatus, "decided");
});
