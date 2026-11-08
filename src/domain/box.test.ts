import assert from "node:assert/strict";
import test from "node:test";
import { confirmReceipt, createChildBox, moveFulfilment, type Box } from "./box.js";

const deliveredBox: Box = {
  id: "box-parent",
  boxNumber: "GS-00001",
  trailId: "trail-tenis",
  parentBoxId: null,
  depth: 0,
  fulfilmentStatus: "delivered",
  recipientStatus: "scanned"
};

test("a child always inherits its parent's trail and increments depth", () => {
  const child = createChildBox({ id: "box-child", boxNumber: "GS-00002", parent: deliveredBox });
  assert.equal(child.trailId, "trail-tenis");
  assert.equal(child.parentBoxId, "box-parent");
  assert.equal(child.depth, 1);
});

test("receipt cannot be confirmed before delivery", () => {
  assert.throws(() => confirmReceipt({ ...deliveredBox, fulfilmentStatus: "packed" }));
});

test("a box cannot skip from paid directly to delivered", () => {
  assert.throws(() => moveFulfilment({ ...deliveredBox, fulfilmentStatus: "paid" }, "delivered"));
});
