import assert from "node:assert/strict";
import test from "node:test";
import { checkoutHtml, homeHtml, localPaymentDoneHtml, paymentCompleteHtml, trackerHtml } from "./views.js";
import { GiverTracker, type GiverTrackingRecord } from "../application/giver-tracker.js";

test("the home page links to the sample box only in the in-memory demo", () => {
  assert.ok(homeHtml(true).includes("/b/demo-card-token"));
  const live = homeHtml(false);
  assert.ok(!live.includes("/b/demo-card-token"), "no link to a box that does not exist");
  assert.match(live, /Scan the card inside it/);
});

test("the reserved-box page offers the right payment simulator, or none", () => {
  const base = { kind: "pending" as const, reference: "GS-ORDER-1", trackerToken: null };
  assert.match(checkoutHtml({ ...base, demoPayment: true }), /Simulate payment and delivery \(demo only\)/);
  const local = checkoutHtml({ ...base, demoPayment: false, localPaymentReference: "PAY-REF-1" });
  assert.match(local, /local testing only/); assert.match(local, /value="PAY-REF-1"/);
  assert.doesNotMatch(checkoutHtml({ ...base, demoPayment: false, localPaymentReference: null }), /Simulate/);
});

test("the home page invites anyone to start a gift box, and the start form posts to /start", () => {
  for (const page of [homeHtml(false), homeHtml(true)]) assert.match(page, /href="\/start"[^>]*>Start a gift box/);
  const form = checkoutHtml({ kind: "ready", start: true });
  assert.match(form, /<h1>Start a gift box\.<\/h1>/); assert.match(form, /action="\/start"/);
  assert.match(checkoutHtml({ kind: "ready" }), /action="\/checkout"/);
  assert.match(checkoutHtml({ kind: "pending", start: true, reference: "ORD-1", trackerToken: null, demoPayment: false, localPaymentReference: "PAY-1" }), /Your gift box is reserved/);
});

const trackerPage = async (overrides: Partial<GiverTrackingRecord>) => trackerHtml(await new GiverTracker({ findByTrackerToken: async () => ({
  orderReference: "ORD-9", orderStatus: "paid", startedTrail: true, orderedAt: new Date("2026-11-01T09:00:00Z"), paidAt: new Date("2026-11-01T09:05:00Z"), packedAt: null, collectedAt: null, deliveredAt: null, ...overrides
}) }).getPage("t"));

test("the tracker renders a road map with the current stage marked, and invites another gift once paid", async () => {
  const page = await trackerPage({});
  assert.match(page, /Your gift is on its way\./); assert.match(page, /Stage 3 of 5: Packed with care/);
  assert.equal((page.match(/class="stage /g) ?? []).length, 5);
  assert.match(page, /<li class="stage current" aria-current="step">/);
  assert.match(page, /Done · 1 Nov/); assert.match(page, /href="\/start"[^>]*>Gift another box/);
  const unpaid = await trackerPage({ orderStatus: "pending_payment", paidAt: null });
  assert.match(unpaid, /Waiting for payment/); assert.match(unpaid, /Your gift is reserved\./); assert.doesNotMatch(unpaid, /Gift another box/, "no invitation before the gift is paid");
  assert.match(await trackerPage({ packedAt: new Date(), collectedAt: new Date(), deliveredAt: new Date() }), /Make someone else’s day/);
});

test("the confirmation pages after paying offer to gift another box", () => {
  for (const page of [localPaymentDoneHtml(null), paymentCompleteHtml(undefined)]) assert.match(page, /href="\/start"[^>]*>Gift another box/);
});

test("every page loads the self-hosted brand fonts", () => {
  for (const page of [homeHtml(), checkoutHtml({ kind: "ready", start: true })]) {
    assert.match(page, /@font-face\{font-family:"Nunito";src:url\(\/assets\/fonts\/nunito\.woff2\)/);
    assert.match(page, /@font-face\{font-family:"Bricolage Grotesque";src:url\(\/assets\/fonts\/bricolage\.woff2\)/);
    assert.match(page, /<link rel="preload" href="\/assets\/fonts\/bricolage\.woff2" as="font" type="font\/woff2" crossorigin>/);
  }
});
