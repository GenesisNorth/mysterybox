import assert from "node:assert/strict";
import test from "node:test";
import { DevelopmentLogEmailSender, ResendEmailSender, emailSenderFromEnvironment } from "./email.js";

test("Resend receives exactly the sender, one recipient, subject and plain text, with the API key as a bearer token", async () => {
  let call: { url: string; init: RequestInit } | undefined;
  const fakeFetch = (async (url: string, init: RequestInit) => { call = { url, init }; return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
  await new ResendEmailSender("re_test_key", "Gratitude Stories <hello@example.com>", fakeFetch).send({ to: "ade@example.com", subject: "Hi", text: "Body" });
  assert.equal(call?.url, "https://api.resend.com/emails");
  assert.equal((call?.init.headers as Record<string, string>).authorization, "Bearer re_test_key");
  assert.deepEqual(JSON.parse(String(call?.init.body)), { from: "Gratitude Stories <hello@example.com>", to: ["ade@example.com"], subject: "Hi", text: "Body" });
});

test("a rejected email fails without echoing the provider's response (which can contain the address)", async () => {
  const fakeFetch = (async () => new Response(`{"message":"ade@example.com is invalid"}`, { status: 422 })) as unknown as typeof fetch;
  await assert.rejects(() => new ResendEmailSender("key", "from@example.com", fakeFetch).send({ to: "ade@example.com", subject: "s", text: "t" }), (error: Error) => error.message === "Email provider rejected the message with HTTP 422");
});

test("email configuration is explicit, and the logging sender is refused in production", () => {
  assert.equal(emailSenderFromEnvironment({}), null);
  assert.ok(emailSenderFromEnvironment({ EMAIL_PROVIDER: "log" }) instanceof DevelopmentLogEmailSender);
  assert.throws(() => emailSenderFromEnvironment({ EMAIL_PROVIDER: "log", NODE_ENV: "production" }), /not allowed in production/);
  assert.throws(() => emailSenderFromEnvironment({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "k" }), /EMAIL_FROM/);
  assert.equal(emailSenderFromEnvironment({ EMAIL_PROVIDER: "Resend", RESEND_API_KEY: "k", EMAIL_FROM: "a@b.co" })?.name, "resend");
  assert.throws(() => emailSenderFromEnvironment({ EMAIL_PROVIDER: "carrier-pigeon" }), /Unknown EMAIL_PROVIDER/);
});
