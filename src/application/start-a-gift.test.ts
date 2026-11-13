import assert from "node:assert/strict";
import test from "node:test";
import { StartAGift } from "./start-a-gift.js";
import { CheckoutValidationError, type CheckoutInput } from "./pass-it-forward.js";
import { RecipientJourney } from "./recipient-journey.js";
import { InMemoryRecipientJourneyRepository, demoRecipientBoxes } from "../infrastructure/in-memory-recipient-journey.js";

const order = (overrides: Partial<CheckoutInput> = {}): CheckoutInput => ({
  email: "Starter@Example.com", giverName: "Teni", note: "Thank you for this year.", deliveryTo: "recipient",
  deliveryName: "Ade Okafor", deliveryPhone: "0803 000 0000", addressLine1: "12 Market Road", addressLine2: "", city: "Lagos", region: "", deliveryNotes: "", ...overrides
});

test("anyone can order a starter box; resubmitting reuses one order with a fresh payment reference", async () => {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
  const start = new StartAGift(repository);
  const first = await start.createOrder(undefined, order());
  assert.ok(first.trackerToken); assert.equal(first.details.customerEmail, "starter@example.com");
  const retry = await start.createOrder(first.checkoutToken, order({ note: "Corrected note" }));
  assert.equal(retry.reference, first.reference); assert.notEqual(retry.paymentReference, first.paymentReference);
  assert.equal(retry.trackerToken, null, "the tracker link is issued once");
  assert.equal(repository.orderDetailsFor(first.reference)?.note, "Corrected note");
});

test("a paid starter order begins a new trail whose first box shows the giver's name and note", async () => {
  const repository = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
  const start = new StartAGift(repository);
  const placed = await start.createOrder(undefined, order());
  const { cardToken } = await repository.simulatePaidAndDelivered(placed.reference);
  const box = await repository.findByCardToken(cardToken);
  assert.equal(box?.depth, 0); assert.equal(box?.parentBoxId, null);
  assert.notEqual(box?.trailId, demoRecipientBoxes[0]!.trailId, "a brand-new trail");
  const journey = new RecipientJourney(repository);
  const { sessionToken } = await journey.confirm(cardToken);
  const page = await journey.getPage(cardToken, sessionToken);
  assert.equal(page.kind, "reveal");
  if (page.kind === "reveal") { assert.equal(page.giver, "Teni"); assert.equal(page.note, "Thank you for this year."); }
  // The same browser ordering again after paying is a new gift, not a change to the paid one.
  const next = await start.createOrder(placed.checkoutToken, order());
  assert.notEqual(next.reference, placed.reference); assert.notEqual(next.checkoutToken, placed.checkoutToken);
});

test("starter orders are validated like any checkout, and a malformed checkout token is ignored", async () => {
  const start = new StartAGift(new InMemoryRecipientJourneyRepository(demoRecipientBoxes));
  await assert.rejects(() => start.createOrder(undefined, order({ deliveryPhone: "abc" })), CheckoutValidationError);
  const placed = await start.createOrder("short", order());
  assert.notEqual(placed.checkoutToken, "short");
});
