import assert from "node:assert/strict";
import test from "node:test";
import { PassItForward, CheckoutValidationError, type CheckoutInput } from "./pass-it-forward.js";

const checkout = (overrides: Partial<CheckoutInput> = {}): CheckoutInput => ({
  email: "person@example.com", giverName: "Chioma", note: "You made this year lighter.", deliveryTo: "recipient",
  deliveryName: "Ade Okafor", deliveryPhone: "+234 803 000 0000", addressLine1: "12 Market Road", addressLine2: "", city: "Lagos", region: "Surulere", deliveryNotes: "", ...overrides
});
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
  const first = await passItForward.createOrder(referralToken, checkout());
  const second = await passItForward.createOrder(referralToken, checkout());
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
  await assert.rejects(() => passItForward.createOrder(referralToken, checkout({ email: "not-an-email" })));
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

async function readyCheckout() {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
  const journey = new RecipientJourney(repository);
  const passItForward = new PassItForward(repository);
  const { sessionToken } = await journey.confirm("demo-card-token");
  const { referralToken } = await passItForward.begin("demo-card-token", sessionToken);
  return { repository, journey, passItForward, sessionToken, referralToken };
}

test("checkout reports fixable problems as validation errors, not as an expired link", async () => {
  const { passItForward, referralToken } = await readyCheckout();
  const cases: Array<[Partial<CheckoutInput>, RegExp]> = [
    [{ giverName: "" }, /first name/], [{ giverName: "<script>" }, /letters/], [{ note: "x".repeat(501) }, /500/],
    [{ deliveryTo: "neighbour" }, /where we should deliver/], [{ deliveryPhone: "call me" }, /phone/],
    [{ addressLine1: " " }, /address/], [{ city: "" }, /city/], [{ deliveryName: "A" }, /name of the person/]
  ];
  for (const [input, message] of cases) {
    await assert.rejects(() => passItForward.createOrder(referralToken, checkout(input)), (error) => error instanceof CheckoutValidationError && message.test(error.message));
  }
  await assert.rejects(() => passItForward.createOrder("expired", checkout()), (error) => !(error instanceof CheckoutValidationError));
});

test("checkout normalizes the story and the label; empty optional fields become null", async () => {
  const { repository, passItForward, referralToken } = await readyCheckout();
  const order = await passItForward.createOrder(referralToken, checkout({ email: " Person@Example.COM ", giverName: "  Chi   oma ", note: "   ", deliveryTo: "giver" }));
  assert.deepEqual(repository.orderDetailsFor(order.reference), {
    customerEmail: "person@example.com", giverName: "Chi oma", note: null, deliveryTo: "giver", deliveryName: "Ade Okafor", deliveryPhone: "+234 803 000 0000",
    addressLine1: "12 Market Road", addressLine2: null, city: "Lagos", region: "Surulere", deliveryNotes: null
  });
});

test("a retried checkout replaces the saved note and address with the corrected ones", async () => {
  const { repository, passItForward, referralToken } = await readyCheckout();
  const first = await passItForward.createOrder(referralToken, checkout());
  await passItForward.createOrder(referralToken, checkout({ note: "Corrected note", addressLine1: "14 Market Road" }));
  assert.equal(repository.orderDetailsFor(first.reference)?.note, "Corrected note");
  assert.equal(repository.orderDetailsFor(first.reference)?.addressLine1, "14 Market Road");
});

test("the next recipient sees the giver's chosen name and note, and the giver joins their trail", async () => {
  const { repository, journey, passItForward, sessionToken, referralToken } = await readyCheckout();
  await journey.registerProfile("demo-card-token", sessionToken, { firstName: "Ayo", lastInitial: "O", area: "Yaba", displayConsent: true });
  const order = await passItForward.createOrder(referralToken, checkout({ giverName: "Ayo", note: "Your turn to feel thought of." }));
  const { cardToken } = await repository.simulatePaidAndDelivered(order.reference);
  const next = await journey.confirm(cardToken);
  const page = await journey.getPage(cardToken, next.sessionToken);
  assert.equal(page.kind, "reveal");
  if (page.kind === "reveal") {
    assert.equal(page.giver, "Ayo"); assert.equal(page.note, "Your turn to feel thought of."); assert.equal(page.position, 5);
    assert.deepEqual(page.trail, ["Teni A. · Yaba", "Chioma N. · Ikeja", "Dayo L. · Surulere", "Ayo O. · Yaba"]);
  }
  await assert.rejects(() => passItForward.createOrder(referralToken, checkout()), /no longer awaiting payment/);
});

test("a giver who declined trail display still reaches their recipient by name, but shows as a friend on the trail", async () => {
  const { repository, journey, passItForward, sessionToken, referralToken } = await readyCheckout();
  await journey.registerProfile("demo-card-token", sessionToken, { firstName: "", lastInitial: "", area: "", displayConsent: false });
  const order = await passItForward.createOrder(referralToken, checkout({ giverName: "Ayo" }));
  const { cardToken } = await repository.simulatePaidAndDelivered(order.reference);
  const next = await journey.confirm(cardToken);
  const page = await journey.getPage(cardToken, next.sessionToken);
  if (page.kind !== "reveal") assert.fail("expected reveal");
  assert.equal(page.giver, "Ayo"); assert.equal(page.trail.at(-1), "A friend");
});
