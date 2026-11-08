import assert from "node:assert/strict";
import test from "node:test";
import { ReminderDispatcher, type DeliverableReminder, type ReminderDeliveryStore, type ReminderGateway } from "./reminders.js";

test("a dispatcher sends one claimed reminder and marks it sent", async () => {
  let sent = ""; let marked = "";
  const store: ReminderDeliveryStore = { async claimNext(): Promise<DeliverableReminder> { return { id: "job-1", kind: "pass_forward", email: "person@example.com" }; }, async markSent(id) { marked = id; }, async markFailed() {} };
  const gateway: ReminderGateway = { async send(job) { sent = job.id; } };
  assert.equal(await new ReminderDispatcher(store, gateway).dispatchOne(), true); assert.equal(sent, "job-1"); assert.equal(marked, "job-1");
});

test("a dispatcher does nothing without a claimed job", async () => {
  const store: ReminderDeliveryStore = { async claimNext() { return null; }, async markSent() {}, async markFailed() {} };
  assert.equal(await new ReminderDispatcher(store, { async send() {} }).dispatchOne(), false);
});
