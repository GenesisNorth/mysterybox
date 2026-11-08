import assert from "node:assert/strict";
import test from "node:test";
import { FulfilmentService, type FulfilmentRepository } from "./fulfilment.js";
import type { Box } from "../domain/box.js";

function repositoryWith(box: Box): FulfilmentRepository & { assignedCardCode?: string } {
  return {
    async findByBoxNumber() { return box; },
    async assignPrintedCard(_box, cardCode) { this.assignedCardCode = cardCode; },
    async saveFulfilmentStatus(next) { Object.assign(box, next); }
  };
}

test("a printed card is assigned only after payment", async () => {
  const box: Box = { id: "box-1", boxNumber: "GS-00001", trailId: "trail-1", parentBoxId: null, depth: 0, fulfilmentStatus: "paid", recipientStatus: "unknown" };
  const repository = repositoryWith(box);
  await new FulfilmentService(repository).assignCard(box.boxNumber, "GS-CARD-PRINTED1");
  assert.equal(repository.assignedCardCode, "GS-CARD-PRINTED1");
});

test("staff cannot skip fulfilment stages", async () => {
  const box: Box = { id: "box-1", boxNumber: "GS-00001", trailId: "trail-1", parentBoxId: null, depth: 0, fulfilmentStatus: "paid", recipientStatus: "unknown" };
  await assert.rejects(() => new FulfilmentService(repositoryWith(box)).advance(box.boxNumber, "delivered"));
});

test("a collected box can be marked delivered", async () => {
  const box: Box = { id: "box-1", boxNumber: "GS-00001", trailId: "trail-1", parentBoxId: null, depth: 0, fulfilmentStatus: "collected", recipientStatus: "unknown" };
  const advanced = await new FulfilmentService(repositoryWith(box)).advance(box.boxNumber, "delivered");
  assert.equal(advanced.fulfilmentStatus, "delivered");
});
