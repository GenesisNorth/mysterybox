import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { PaystackGateway } from "./paystack.js";

test("Paystack webhook signatures are checked against the exact raw payload", () => {
  const secret = "sk_test_example";
  const body = '{"event":"charge.success"}';
  const signature = createHmac("sha512", secret).update(body).digest("hex");
  const gateway = new PaystackGateway(secret);
  assert.equal(gateway.verifyWebhookSignature(body, signature), true);
  assert.equal(gateway.verifyWebhookSignature(`${body} `, signature), false);
});

test("Paystack checkout initialization sends only server-controlled order data", async () => {
  const originalFetch = globalThis.fetch;
  let request: Request | undefined;
  globalThis.fetch = async (input, init) => {
    request = new Request(input, init);
    return new Response(JSON.stringify({ status: true, data: { reference: "ORD-123", authorization_url: "https://checkout.paystack.test/abc" } }), { status: 200 });
  };
  try {
    const gateway = new PaystackGateway("sk_test_example", "https://paystack.test");
    const result = await gateway.initialize({ reference: "ORD-123", email: "person@example.com", amountKobo: 250000, callbackUrl: "https://gratitude.example/checkout/complete" });
    assert.equal(result.authorizationUrl, "https://checkout.paystack.test/abc");
    assert.equal(request?.method, "POST");
    assert.deepEqual(await request?.json(), { email: "person@example.com", amount: 250000, reference: "ORD-123", callback_url: "https://gratitude.example/checkout/complete" });
  } finally { globalThis.fetch = originalFetch; }
});
