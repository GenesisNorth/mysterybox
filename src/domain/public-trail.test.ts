import assert from "node:assert/strict";
import test from "node:test";
import { publicLabel } from "./public-trail.js";

test("a participant without display consent is always a friend", () => {
  assert.equal(publicLabel({ firstName: "Teni", lastInitial: "A", area: "Yaba", displayConsent: false }), "A friend");
});

test("a consented participant has a minimal public label", () => {
  assert.equal(publicLabel({ firstName: "Teni", lastInitial: "A", area: "Yaba", displayConsent: true }), "Teni A. · Yaba");
});
