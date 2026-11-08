import assert from "node:assert/strict";
import test from "node:test";
import { GiverTracker, type GiverTrackerRepository } from "./giver-tracker.js";

test("the giver tracker contains delivery progress only", async () => {
  const repository: GiverTrackerRepository = { findByTrackerToken: async () => ({ orderReference: "ORD-123", orderStatus: "paid", paidAt: new Date(), packedAt: new Date(), collectedAt: null, deliveredAt: null }) };
  const page = await new GiverTracker(repository).getPage("private-token");
  assert.deepEqual(page, { kind: "tracker", orderReference: "ORD-123", complete: false, steps: [
    { label: "Payment confirmed", complete: true, current: false }, { label: "Box packed", complete: true, current: false },
    { label: "Collected by courier", complete: false, current: true }, { label: "Delivered", complete: false, current: false }
  ] });
});

test("an unknown private tracker token reveals nothing", async () => {
  const repository: GiverTrackerRepository = { findByTrackerToken: async () => null };
  assert.deepEqual(await new GiverTracker(repository).getPage("wrong"), { kind: "not-found" });
});
