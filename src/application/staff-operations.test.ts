import assert from "node:assert/strict";
import test from "node:test";
import type { Box } from "../domain/box.js";
import { StaffOperations, type BoxParticipantIntake, type CardStatus, type CollectionRecord, type DeliveryDetails, type DeliveryRecord, type NewPrintedCard, type PackingRecord, type PrintedCard, type ReminderJob, type StaffBoxOverview, type StaffOperationsRepository, type StaffUserSummary } from "./staff-operations.js";

const paidBox: Box = { id: "box-1", boxNumber: "GS-00001", trailId: "trail-1", parentBoxId: null, depth: 0, fulfilmentStatus: "paid", recipientStatus: "unknown" };

class Cards implements StaffOperationsRepository {
  cards: NewPrintedCard[] = [];
  assigned: { box: Box; cardCode: string } | null = null;
  saved: Box | null = null;
  voided: string | null = null;
  replacement: { box: Box; cardCode: string } | null = null;
  starterTrailCode: string | null = null;
  overview: StaffBoxOverview | null = { boxNumber: "GS-00001", trailCode: "TRAIL-ONE", parentBoxNumber: null, depth: 0, fulfilmentStatus: "paid", recipientStatus: "unknown", cardCode: "GS-CARD-ONE", cardStatus: "assigned", createdAt: new Date("2026-01-01T00:00:00Z"), packedAt: null, collectedAt: null, deliveredAt: null };
  delivery: DeliveryDetails | null = null;
  intake: BoxParticipantIntake | null = null;
  lastAdmin = false;
  packing: PackingRecord | null = null;
  collection: CollectionRecord | null = null; deliveryRecord: DeliveryRecord | null = null;
  async findByBoxNumber(boxNumber: string): Promise<Box | null> { return boxNumber === paidBox.boxNumber ? paidBox : null; }
  async assignPrintedCard(box: Box, cardCode: string): Promise<void> { this.assigned = { box, cardCode }; }
  async saveFulfilmentStatus(box: Box): Promise<void> { this.saved = box; }
  async createPrintedCards(cards: readonly NewPrintedCard[]): Promise<void> { this.cards.push(...cards); }
  async listPrintedCards(status?: CardStatus): Promise<PrintedCard[]> {
    const inventory: PrintedCard[] = this.cards.map((card) => ({ cardCode: card.cardCode, status: "available", assignedBoxNumber: null, assignedAt: null }));
    return inventory.filter((card) => !status || card.status === status);
  }
  async voidPrintedCard(cardCode: string): Promise<boolean> { this.voided = cardCode; return cardCode === "GS-CARD-AVAILABLE"; }
  async replacePrintedCard(box: Box, cardCode: string): Promise<boolean> { this.replacement = { box, cardCode }; return cardCode === "GS-CARD-REPLACEMENT"; }
  async createStarterBox(trailCode: string) { this.starterTrailCode = trailCode; return { boxNumber: "GS-00002", trailCode }; }
  async findStaffBoxOverview(): Promise<StaffBoxOverview | null> { return this.overview; }
  async saveDeliveryDetails(_boxId: string, details: DeliveryDetails): Promise<void> { this.delivery = details; }
  async findDeliveryDetails(): Promise<DeliveryDetails | null> { return this.delivery; }
  async saveParticipantIntake(_boxId: string, intake: BoxParticipantIntake): Promise<void> { this.intake = intake; }
  async findParticipantIntake(): Promise<BoxParticipantIntake | null> { return this.intake; }
  async savePackingRecord(_boxId: string, record: Omit<PackingRecord, "recordedAt">): Promise<void> { this.packing = { ...record, recordedAt: new Date() }; }
  async findPackingRecord(): Promise<PackingRecord | null> { return this.packing; }
  async saveCollectionRecord(_id: string, r: Omit<CollectionRecord, "recordedAt">) { this.collection = { ...r, recordedAt: new Date() }; }
  async findCollectionRecord(): Promise<CollectionRecord | null> { return this.collection; }
  async saveDeliveryRecord(_id: string, r: Omit<DeliveryRecord, "recordedAt">) { this.deliveryRecord = { ...r, recordedAt: new Date() }; }
  async findDeliveryRecord(): Promise<DeliveryRecord | null> { return this.deliveryRecord; }
  async findAuditEventsForBoxNumber() { return []; }
  async findAuditEventsForStaffEmail() { return []; }
  async searchStaffBoxes() { return this.overview ? [this.overview] : []; }
  async createStaffUser() {}
  async revokeStaffUser(email: string) { return email === "ops@example.com"; }
  async listStaffUsers(): Promise<StaffUserSummary[]> { return [{ email: "ops@example.com", role: "operations", active: true, createdAt: new Date(), revokedAt: null }]; }
  async rotateStaffUserToken(email: string) { return email === "ops@example.com" ? "operations" as const : null; }
  async queueReminder(_boxNumber: string, kind: string) { return kind === "pass_forward"; }
  async findReminderJobs(): Promise<ReminderJob[]> { return [{ kind: "pass_forward", status: "queued", scheduledAt: new Date(), sentAt: null }]; }
  async cancelReminder(_boxNumber: string, kind: string) { return kind === "pass_forward"; }
  async retryReminder(_boxNumber: string, kind: string) { return kind === "receipt_confirmation"; }
  async recoverStaleReminders() { return 2; }
  async updateStaffRole(email: string) { return email === "ops@example.com"; }
  async isLastActiveAdmin() { return this.lastAdmin; }
}

test("staff can issue an inventory batch and receive raw tokens only at issue time", async () => {
  const repository = new Cards();
  let sequence = 0;
  const service = new StaffOperations(repository, () => `opaque-token-${++sequence}-with-sufficient-length`);
  const issued = await service.issueCards(2);
  assert.equal(issued.length, 2);
  assert.equal(issued[0]?.cardCode, "GS-CARD-OPAQUE-TOK");
  assert.equal((await service.inventory())[0]?.cardCode, issued[0]?.cardCode);
  assert.equal("cardToken" in (await service.inventory())[0]!, false);
});

test("staff cannot issue an unsafe card batch or assign a card before payment", async () => {
  const repository = new Cards();
  const service = new StaffOperations(repository);
  await assert.rejects(() => service.issueCards(101), /between 1 and 100/);
  await assert.rejects(() => service.assignCard("GS-404", "GS-CARD-AVAILABLE"), /Box not found/);
});

test("staff fulfilment transitions obey the box state machine", async () => {
  const repository = new Cards();
  const service = new StaffOperations(repository);
  await assert.rejects(() => service.advanceFulfilment("GS-00001", "packed"), /packing record/);
  await service.recordPacking("GS-00001", { packedBy: "Ada", checklistComplete: true, notes: null });
  const packed = await service.advanceFulfilment("GS-00001", "packed");
  assert.equal(packed.fulfilmentStatus, "packed");
  assert.equal(repository.saved?.fulfilmentStatus, "packed");
  await assert.rejects(() => service.advanceFulfilment("GS-00001", "delivered"), /Cannot move/);
});

test("a packing record requires a completed checklist and stays private", async () => {
  const service = new StaffOperations(new Cards());
  await assert.rejects(() => service.recordPacking("GS-00001", { packedBy: "Ada", checklistComplete: false, notes: null }), /checklist/);
  await service.recordPacking("GS-00001", { packedBy: "Ada", checklistComplete: true, notes: "Fragile" });
  assert.equal((await service.packingRecord("GS-00001")).notes, "Fragile");
});

test("collection and delivery proof records remain staff-only operational data", async () => {
  const service = new StaffOperations(new Cards());
  await assert.rejects(() => service.collectionRecord("GS-00001"), /not found/);
});

test("staff can void only an available card", async () => {
  const repository = new Cards();
  const service = new StaffOperations(repository);
  await service.voidCard("GS-CARD-AVAILABLE");
  assert.equal(repository.voided, "GS-CARD-AVAILABLE");
  await assert.rejects(() => service.voidCard("GS-CARD-ASSIGNED"), /Only an available card/);
  await assert.rejects(() => service.voidCard("not-a-card"), /Card code is not valid/);
});

test("staff can create a root box with a new trail identity", async () => {
  const repository = new Cards();
  const service = new StaffOperations(repository, () => "root-trail-code-unique");
  const box = await service.createStarterBox();
  assert.deepEqual(box, { boxNumber: "GS-00002", trailCode: "TRAIL-ROOT-TRAIL-C" });
  assert.equal(repository.starterTrailCode, "TRAIL-ROOT-TRAIL-C");
});

test("staff replacement atomically requires a paid box and an available replacement card", async () => {
  const repository = new Cards();
  const service = new StaffOperations(repository);
  await service.replaceCard("GS-00001", "GS-CARD-REPLACEMENT");
  assert.equal(repository.replacement?.cardCode, "GS-CARD-REPLACEMENT");
  await assert.rejects(() => service.replaceCard("GS-00001", "GS-CARD-UNAVAILABLE"), /assigned box and an available card/);
});

test("staff overview contains operations data but no participant contact data", async () => {
  const overview = await new StaffOperations(new Cards()).boxOverview("GS-00001");
  assert.equal(overview.trailCode, "TRAIL-ONE");
  assert.equal(overview.cardCode, "GS-CARD-ONE");
  assert.equal("email" in overview, false);
  await assert.rejects(() => new StaffOperations(Object.assign(new Cards(), { overview: null })).boxOverview("GS-404"), /Box not found/);
});

test("staff can search operational boxes without participant contacts", async () => {
  const service = new StaffOperations(new Cards());
  assert.equal((await service.searchBoxes("GS")).length, 1);
  await assert.rejects(() => service.searchBoxes("x"), /at least two/);
});

test("an administrator can provision a staff identity with an opaque token", async () => {
  const user = await new StaffOperations(new Cards()).provisionStaffUser("Ops@example.com", "operations");
  assert.equal(user.email, "ops@example.com"); assert.equal(user.role, "operations"); assert.ok(user.apiToken.length >= 24);
});

test("an administrator can revoke a provisioned staff identity", async () => {
  const service = new StaffOperations(new Cards());
  await service.revokeStaffUser("ops@example.com");
  await assert.rejects(() => service.revokeStaffUser("missing@example.com"), /not found/);
});

test("staff user listings never expose API tokens", async () => {
  const users = await new StaffOperations(new Cards()).staffUsers();
  assert.equal(users[0]?.email, "ops@example.com"); assert.equal("apiToken" in users[0]!, false);
});

test("an administrator can rotate an active staff token", async () => {
  const user = await new StaffOperations(new Cards()).rotateStaffUserToken("ops@example.com");
  assert.equal(user.role, "operations"); assert.ok(user.apiToken.length >= 24);
});

test("an administrator can change an active staff role", async () => {
  await new StaffOperations(new Cards()).changeStaffRole("ops@example.com", "admin");
  await assert.rejects(() => new StaffOperations(new Cards()).changeStaffRole("missing@example.com", "admin"), /not found/);
});

test("the final active administrator cannot be revoked or demoted", async () => {
  const repository = new Cards(); repository.lastAdmin = true; const service = new StaffOperations(repository);
  await assert.rejects(() => service.revokeStaffUser("ops@example.com"), /last active administrator/);
  await assert.rejects(() => service.changeStaffRole("ops@example.com", "operations"), /last active administrator/);
});

test("reminders can only be queued through a consented recipient channel", async () => {
  const service = new StaffOperations(new Cards()); await service.scheduleReminder("GS-00001", "pass_forward");
  await assert.rejects(() => service.scheduleReminder("GS-00001", "receipt_confirmation"), /consented recipient email/);
});

test("reminder job views expose state but not recipient contacts", async () => {
  const jobs = await new StaffOperations(new Cards()).reminderJobs("GS-00001"); assert.equal(jobs[0]?.status, "queued"); assert.equal("email" in jobs[0]!, false);
});

test("only queued reminders can be cancelled", async () => {
  const service = new StaffOperations(new Cards()); await service.cancelScheduledReminder("GS-00001", "pass_forward");
  await assert.rejects(() => service.cancelScheduledReminder("GS-00001", "receipt_confirmation"), /not found/);
});

test("only failed reminders can be retried", async () => {
  const service = new StaffOperations(new Cards()); await service.retryFailedReminder("GS-00001", "receipt_confirmation");
  await assert.rejects(() => service.retryFailedReminder("GS-00001", "pass_forward"), /not found/);
});

test("stale reminder claims can be recovered", async () => { assert.equal(await new StaffOperations(new Cards()).recoverStaleReminderClaims(), 2); });

test("staff delivery details are validated and remain separate from the box overview", async () => {
  const repository = new Cards();
  const service = new StaffOperations(repository);
  await service.recordDeliveryDetails("GS-00001", { addressLine1: "12 Market Road", addressLine2: null, city: "Lagos", region: "Lagos", deliveryNotes: "Call at gate" });
  assert.equal((await service.deliveryDetails("GS-00001")).addressLine1, "12 Market Road");
  assert.equal("addressLine1" in (await service.boxOverview("GS-00001")), false);
  await assert.rejects(() => service.recordDeliveryDetails("GS-00001", { addressLine1: "", addressLine2: null, city: "Lagos", region: null, deliveryNotes: null }), /Address is not valid/);
});

test("staff intake retains private contacts while recipient display consent stays recipient-controlled", async () => {
  const service = new StaffOperations(new Cards());
  await service.recordParticipantIntake("GS-00001", { giver: { firstName: "Dayo", lastInitial: "L", area: "Surulere", email: "dayo@example.com", phone: null, displayConsent: true }, recipient: { firstName: "Teni", lastInitial: "A", area: "Yaba", email: null, phone: "+234 800 000 0000", displayConsent: true }, giverNote: "Thank you" });
  const intake = await service.participantIntake("GS-00001");
  assert.equal(intake.giver.displayConsent, true);
  assert.equal(intake.recipient.displayConsent, false);
  await assert.rejects(() => service.recordParticipantIntake("GS-00001", { giver: intake.giver, recipient: { ...intake.recipient, phone: null }, giverNote: null }), /contact method/);
});
