import assert from "node:assert/strict";
import test from "node:test";
import { PaymentConfirmation, type PaymentConfirmationStore } from "./payment-confirmation.js";
import type { PaymentGateway } from "../infrastructure/paystack.js";

const order = { reference: "ORD-123", amountKobo: 150000, currency: "NGN", customerEmail: "recipient@example.com" };
const gateway: PaymentGateway = { verify: async () => ({ reference: "ORD-123", status: "success", amount: 150000, currency: "NGN", customerEmail: "recipient@example.com" }) };

test("only a server-verified matching payment creates a child", async () => {
  let called = 0;
  const store: PaymentConfirmationStore = { findOrder: async () => order, markPaidAndCreateChild: async () => { called++; return { childBoxId: "child-1", alreadyProcessed: false }; } };
  const result = await new PaymentConfirmation(gateway, store).confirm("ORD-123");
  assert.equal(result.childBoxId, "child-1");
  assert.equal(called, 1);
});

test("a successful payment for the wrong amount cannot create a child", async () => {
  const wrongAmountGateway: PaymentGateway = { verify: async () => ({ reference: "ORD-123", status: "success", amount: 1, currency: "NGN", customerEmail: "recipient@example.com" }) };
  const store: PaymentConfirmationStore = { findOrder: async () => order, markPaidAndCreateChild: async () => ({ childBoxId: "child-1", alreadyProcessed: false }) };
  await assert.rejects(() => new PaymentConfirmation(wrongAmountGateway, store).confirm("ORD-123"));
});
