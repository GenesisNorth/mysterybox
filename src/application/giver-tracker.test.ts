import assert from "node:assert/strict";
import test from "node:test";
import { GiverTracker, type GiverTrackerRepository, type GiverTrackingRecord } from "./giver-tracker.js";

const record = (overrides: Partial<GiverTrackingRecord> = {}): GiverTrackingRecord => ({
  orderReference: "ORD-123", orderStatus: "paid", startedTrail: false, orderedAt: new Date("2026-11-01T09:00:00Z"),
  paidAt: new Date("2026-11-01T09:05:00Z"), packedAt: new Date("2026-11-02T10:00:00Z"), collectedAt: null, deliveredAt: null, ...overrides
});
const pageFor = async (value: GiverTrackingRecord | null) => new GiverTracker({ findByTrackerToken: async () => value } satisfies GiverTrackerRepository).getPage("private-token");

test("the tracker is a five-stage road map: done, current, then upcoming", async () => {
  const page = await pageFor(record());
  assert.equal(page.kind, "tracker"); if (page.kind !== "tracker") return;
  assert.deepEqual(page.stages.map((stage) => [stage.key, stage.state]), [["ordered", "done"], ["paid", "done"], ["packed", "done"], ["collected", "current"], ["delivered", "upcoming"]]);
  assert.deepEqual(page.progress, { done: 3, total: 5 });
  assert.equal(page.complete, false); assert.equal(page.paymentConfirmed, true); assert.equal(page.stopped, null);
  assert.equal(page.stages[2]!.at?.toISOString(), "2026-11-02T10:00:00.000Z");
});

test("an unpaid order waits at payment; a starter order says it began a trail", async () => {
  const page = await pageFor(record({ orderStatus: "pending_payment", startedTrail: true, paidAt: null, packedAt: null }));
  if (page.kind !== "tracker") return assert.fail();
  assert.equal(page.stages[1]!.state, "current"); assert.equal(page.paymentConfirmed, false);
  assert.equal(page.stages[1]!.title, "Payment"); assert.match(page.stages[1]!.description, /waiting for your payment/);
});

test("once paid, a starter order says it began a new trail", async () => {
  const page = await pageFor(record({ startedTrail: true }));
  if (page.kind !== "tracker") return assert.fail();
  assert.equal(page.stages[1]!.title, "Payment confirmed"); assert.match(page.stages[1]!.description, /new trail/);
});

test("a cancelled order shows where it stopped; a delivered order is complete", async () => {
  const stopped = await pageFor(record({ orderStatus: "refunded", packedAt: null }));
  if (stopped.kind !== "tracker") return assert.fail();
  assert.equal(stopped.stopped, "refunded"); assert.equal(stopped.stages[2]!.state, "stopped");
  const delivered = await pageFor(record({ collectedAt: new Date(), deliveredAt: new Date() }));
  if (delivered.kind !== "tracker") return assert.fail();
  assert.equal(delivered.complete, true); assert.ok(delivered.stages.every((stage) => stage.state === "done"));
});

test("an unknown private tracker token reveals nothing", async () => {
  assert.deepEqual(await pageFor(null), { kind: "not-found" });
});
