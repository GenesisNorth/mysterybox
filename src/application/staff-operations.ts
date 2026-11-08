import { randomUUID } from "node:crypto";
import { createOpaqueToken } from "../infrastructure/secrets.js";
import type { FulfilmentRepository } from "./fulfilment.js";
import { moveFulfilment, type Box, type FulfilmentStatus } from "../domain/box.js";

export type CardStatus = "available" | "assigned" | "voided";

export interface PrintedCard {
  cardCode: string;
  status: CardStatus;
  assignedBoxNumber: string | null;
  assignedAt: Date | null;
}

export interface NewPrintedCard {
  cardCode: string;
  cardToken: string;
}
export interface StarterBox {
  boxNumber: string;
  trailCode: string;
}
export interface StaffBoxOverview {
  boxNumber: string;
  trailCode: string;
  parentBoxNumber: string | null;
  depth: number;
  fulfilmentStatus: FulfilmentStatus;
  recipientStatus: Box["recipientStatus"];
  cardCode: string | null;
  cardStatus: CardStatus | null;
  createdAt: Date;
  packedAt: Date | null;
  collectedAt: Date | null;
  deliveredAt: Date | null;
}
export interface DeliveryDetails {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string | null;
  deliveryNotes: string | null;
}
export interface PrivateParticipant {
  firstName: string | null;
  lastInitial: string | null;
  area: string | null;
  email: string | null;
  phone: string | null;
  displayConsent: boolean;
}
export interface BoxParticipantIntake { giver: PrivateParticipant; recipient: PrivateParticipant; giverNote: string | null; }
export interface PackingRecord { packedBy: string; checklistComplete: boolean; notes: string | null; recordedAt: Date; }
export interface CollectionRecord { courier: string; handoffReference: string | null; recordedAt: Date; }
export interface DeliveryRecord { deliveredBy: string; proofReference: string; recordedAt: Date; }
export interface AuditEvent { actor: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown>; occurredAt: Date; }
export type StaffRole = "admin" | "operations";
export interface ProvisionedStaffUser { email: string; role: StaffRole; apiToken: string; }
export interface StaffUserSummary { email: string; role: StaffRole; active: boolean; createdAt: Date; revokedAt: Date | null; }
export type ReminderKind = "receipt_confirmation" | "pass_forward";
export interface ReminderJob { kind: ReminderKind; status: "queued" | "processing" | "sent" | "failed" | "cancelled"; scheduledAt: Date; sentAt: Date | null; }

export interface StaffOperationsRepository extends FulfilmentRepository {
  createPrintedCards(cards: readonly NewPrintedCard[]): Promise<void>;
  listPrintedCards(status?: CardStatus): Promise<PrintedCard[]>;
  voidPrintedCard(cardCode: string): Promise<boolean>;
  replacePrintedCard(box: import("../domain/box.js").Box, cardCode: string): Promise<boolean>;
  createStarterBox(trailCode: string): Promise<StarterBox>;
  findStaffBoxOverview(boxNumber: string): Promise<StaffBoxOverview | null>;
  saveDeliveryDetails(boxId: string, details: DeliveryDetails): Promise<void>;
  findDeliveryDetails(boxNumber: string): Promise<DeliveryDetails | null>;
  saveParticipantIntake(boxId: string, intake: BoxParticipantIntake): Promise<void>;
  findParticipantIntake(boxNumber: string): Promise<BoxParticipantIntake | null>;
  savePackingRecord(boxId: string, record: Omit<PackingRecord, "recordedAt">): Promise<void>;
  findPackingRecord(boxNumber: string): Promise<PackingRecord | null>;
  saveCollectionRecord(boxId: string, record: Omit<CollectionRecord, "recordedAt">): Promise<void>;
  findCollectionRecord(boxNumber: string): Promise<CollectionRecord | null>;
  saveDeliveryRecord(boxId: string, record: Omit<DeliveryRecord, "recordedAt">): Promise<void>;
  findDeliveryRecord(boxNumber: string): Promise<DeliveryRecord | null>;
  findAuditEventsForBoxNumber(boxNumber: string, limit: number): Promise<AuditEvent[]>;
  findAuditEventsForStaffEmail(email: string, limit: number): Promise<AuditEvent[]>;
  searchStaffBoxes(query: string, limit: number): Promise<StaffBoxOverview[]>;
  createStaffUser(user: ProvisionedStaffUser): Promise<void>;
  revokeStaffUser(email: string): Promise<boolean>;
  listStaffUsers(): Promise<StaffUserSummary[]>;
  rotateStaffUserToken(email: string, apiToken: string): Promise<StaffRole | null>;
  queueReminder(boxNumber: string, kind: ReminderKind): Promise<boolean>;
  findReminderJobs(boxNumber: string): Promise<ReminderJob[]>;
  cancelReminder(boxNumber: string, kind: ReminderKind): Promise<boolean>;
  retryReminder(boxNumber: string, kind: ReminderKind): Promise<boolean>;
  recoverStaleReminders(): Promise<number>;
  updateStaffRole(email: string, role: StaffRole): Promise<boolean>;
  isLastActiveAdmin(email: string): Promise<boolean>;
}

/** Operations intentionally return a raw token only when a card is first issued for printing. */
export class StaffOperations {
  constructor(private readonly repository: StaffOperationsRepository, private readonly token = () => randomUUID().replaceAll("-", "")) {}

  async issueCards(quantity: number): Promise<NewPrintedCard[]> {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new Error("Quantity must be an integer between 1 and 100");
    }
    const cards = Array.from({ length: quantity }, () => {
      const serial = this.token();
      return { cardCode: `GS-CARD-${serial.slice(0, 10).toUpperCase()}`, cardToken: this.token() };
    });
    await this.repository.createPrintedCards(cards);
    return cards;
  }

  async createStarterBox(): Promise<StarterBox> {
    return this.repository.createStarterBox(`TRAIL-${this.token().slice(0, 12).toUpperCase()}`);
  }

  async boxOverview(boxNumber: string): Promise<StaffBoxOverview> {
    const box = await this.repository.findStaffBoxOverview(boxNumber);
    if (!box) throw new Error("Box not found");
    return box;
  }

  async recordDeliveryDetails(boxNumber: string, input: DeliveryDetails): Promise<void> {
    const box = await this.repository.findByBoxNumber(boxNumber);
    if (!box) throw new Error("Box not found");
    if (["delivered", "cancelled", "refunded"].includes(box.fulfilmentStatus)) throw new Error("Delivery details can no longer be changed");
    await this.repository.saveDeliveryDetails(box.id, this.normalizeDeliveryDetails(input));
  }

  async deliveryDetails(boxNumber: string): Promise<DeliveryDetails> {
    const details = await this.repository.findDeliveryDetails(boxNumber);
    if (!details) throw new Error("Delivery details not found");
    return details;
  }

  async recordParticipantIntake(boxNumber: string, intake: BoxParticipantIntake): Promise<void> {
    const box = await this.repository.findByBoxNumber(boxNumber);
    if (!box) throw new Error("Box not found");
    if (["delivered", "cancelled", "refunded"].includes(box.fulfilmentStatus)) throw new Error("Participant details can no longer be changed");
    await this.repository.saveParticipantIntake(box.id, this.normalizeIntake(intake));
  }

  async recordPacking(boxNumber: string, record: Omit<PackingRecord, "recordedAt">): Promise<void> {
    const box = await this.repository.findByBoxNumber(boxNumber);
    if (!box) throw new Error("Box not found");
    if (box.fulfilmentStatus !== "paid") throw new Error("Only a paid box can be prepared for packing");
    const packedBy = record.packedBy.trim(); const notes = record.notes?.trim() || null;
    if (packedBy.length < 2 || packedBy.length > 80) throw new Error("Packer name is not valid");
    if (!record.checklistComplete) throw new Error("Packing checklist must be complete");
    if (notes && notes.length > 1000) throw new Error("Packing notes are too long");
    await this.repository.savePackingRecord(box.id, { packedBy, checklistComplete: true, notes });
  }

  async packingRecord(boxNumber: string): Promise<PackingRecord> {
    const record = await this.repository.findPackingRecord(boxNumber);
    if (!record) throw new Error("Packing record not found");
    return record;
  }

  async recordCollection(boxNumber: string, record: Omit<CollectionRecord, "recordedAt">): Promise<void> {
    const box = await this.repository.findByBoxNumber(boxNumber); if (!box) throw new Error("Box not found");
    if (box.fulfilmentStatus !== "packed") throw new Error("Only a packed box can be collected");
    const courier = record.courier.trim(); const handoffReference = record.handoffReference?.trim() || null;
    if (courier.length < 2 || courier.length > 80 || (handoffReference?.length ?? 0) > 120) throw new Error("Collection record is not valid");
    await this.repository.saveCollectionRecord(box.id, { courier, handoffReference });
  }
  async recordDelivery(boxNumber: string, record: Omit<DeliveryRecord, "recordedAt">): Promise<void> {
    const box = await this.repository.findByBoxNumber(boxNumber); if (!box) throw new Error("Box not found");
    if (box.fulfilmentStatus !== "collected") throw new Error("Only a collected box can be delivered");
    const deliveredBy = record.deliveredBy.trim(); const proofReference = record.proofReference.trim();
    if (deliveredBy.length < 2 || deliveredBy.length > 80 || proofReference.length < 2 || proofReference.length > 200) throw new Error("Delivery record is not valid");
    await this.repository.saveDeliveryRecord(box.id, { deliveredBy, proofReference });
  }
  async collectionRecord(boxNumber: string): Promise<CollectionRecord> { const record = await this.repository.findCollectionRecord(boxNumber); if (!record) throw new Error("Collection record not found"); return record; }
  async deliveryRecord(boxNumber: string): Promise<DeliveryRecord> { const record = await this.repository.findDeliveryRecord(boxNumber); if (!record) throw new Error("Delivery record not found"); return record; }
  async auditHistory(boxNumber: string): Promise<AuditEvent[]> { return this.repository.findAuditEventsForBoxNumber(boxNumber, 100); }
  async staffAuditHistory(email: string): Promise<AuditEvent[]> { return this.repository.findAuditEventsForStaffEmail(email.trim().toLowerCase(), 100); }
  async searchBoxes(query: string): Promise<StaffBoxOverview[]> { const term = query.trim(); if (term.length < 2) throw new Error("Search needs at least two characters"); return this.repository.searchStaffBoxes(term, 50); }
  async provisionStaffUser(email: string, role: StaffRole): Promise<ProvisionedStaffUser> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) throw new Error("A valid staff email is required");
    const user = { email: normalizedEmail, role, apiToken: createOpaqueToken() };
    await this.repository.createStaffUser(user); return user;
  }
  async revokeStaffUser(email: string): Promise<void> { const normalized = email.trim().toLowerCase(); if (await this.repository.isLastActiveAdmin(normalized)) throw new Error("Cannot revoke the last active administrator"); if (!await this.repository.revokeStaffUser(normalized)) throw new Error("Active staff user not found"); }
  async staffUsers(): Promise<StaffUserSummary[]> { return this.repository.listStaffUsers(); }
  async rotateStaffUserToken(email: string): Promise<ProvisionedStaffUser> { const normalized=email.trim().toLowerCase(); const apiToken=createOpaqueToken(); const role=await this.repository.rotateStaffUserToken(normalized, apiToken); if (!role) throw new Error("Active staff user not found"); return { email: normalized, role, apiToken }; }
  async scheduleReminder(boxNumber: string, kind: ReminderKind): Promise<void> { if (!await this.repository.queueReminder(boxNumber, kind)) throw new Error("A consented recipient email is required to schedule this reminder"); }
  async reminderJobs(boxNumber: string): Promise<ReminderJob[]> { return this.repository.findReminderJobs(boxNumber); }
  async cancelScheduledReminder(boxNumber: string, kind: ReminderKind): Promise<void> { if (!await this.repository.cancelReminder(boxNumber, kind)) throw new Error("Queued reminder not found"); }
  async retryFailedReminder(boxNumber: string, kind: ReminderKind): Promise<void> { if (!await this.repository.retryReminder(boxNumber, kind)) throw new Error("Failed reminder not found"); }
  async recoverStaleReminderClaims(): Promise<number> { return this.repository.recoverStaleReminders(); }
  async changeStaffRole(email: string, role: StaffRole): Promise<void> { const normalized=email.trim().toLowerCase(); if (role !== "admin" && await this.repository.isLastActiveAdmin(normalized)) throw new Error("Cannot demote the last active administrator"); if (!await this.repository.updateStaffRole(normalized, role)) throw new Error("Active staff user not found"); }

  async participantIntake(boxNumber: string): Promise<BoxParticipantIntake> {
    const intake = await this.repository.findParticipantIntake(boxNumber);
    if (!intake) throw new Error("Participant details not found");
    return intake;
  }

  private normalizeIntake(input: BoxParticipantIntake): BoxParticipantIntake {
    const clean = (value: string | null, max: number) => { const result = value?.trim() ?? ""; if (result.length > max) throw new Error("Participant field is too long"); return result || null; };
    const person = (value: PrivateParticipant, recipient: boolean): PrivateParticipant => {
      const result = { firstName: clean(value.firstName, 40), lastInitial: clean(value.lastInitial, 1), area: clean(value.area, 80), email: clean(value.email, 254), phone: clean(value.phone, 30), displayConsent: recipient ? false : value.displayConsent };
      if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error("Email is not valid");
      if (result.phone && !/^[0-9+() -]{7,30}$/.test(result.phone)) throw new Error("Phone is not valid");
      if (result.displayConsent && (!result.firstName || !/^[\p{L}]$/u.test(result.lastInitial ?? "") || !result.area)) throw new Error("A public label needs first name, last initial, and area");
      return result;
    };
    const recipient = person(input.recipient, true);
    if (!recipient.firstName || (!recipient.email && !recipient.phone)) throw new Error("Recipient first name and one contact method are required");
    return { giver: person(input.giver, false), recipient, giverNote: clean(input.giverNote, 2000) };
  }

  private normalizeDeliveryDetails(input: DeliveryDetails): DeliveryDetails {
    const required = (value: string, label: string, max: number) => {
      const clean = value.trim();
      if (clean.length < 2 || clean.length > max) throw new Error(`${label} is not valid`);
      return clean;
    };
    const optional = (value: string | null, label: string, max: number) => {
      const clean = value?.trim() ?? "";
      if (clean.length > max) throw new Error(`${label} is too long`);
      return clean || null;
    };
    return {
      addressLine1: required(input.addressLine1, "Address", 160),
      addressLine2: optional(input.addressLine2, "Address line 2", 160),
      city: required(input.city, "City", 80),
      region: optional(input.region, "Region", 80),
      deliveryNotes: optional(input.deliveryNotes, "Delivery notes", 500)
    };
  }

  async inventory(status?: CardStatus): Promise<PrintedCard[]> {
    return this.repository.listPrintedCards(status);
  }

  async voidCard(cardCode: string): Promise<void> {
    if (!/^GS-CARD-[A-Z0-9]+$/.test(cardCode)) throw new Error("Card code is not valid");
    if (!await this.repository.voidPrintedCard(cardCode)) throw new Error("Only an available card can be voided");
  }

  async assignCard(boxNumber: string, cardCode: string): Promise<void> {
    const box = await this.repository.findByBoxNumber(boxNumber);
    if (!box) throw new Error("Box not found");
    if (box.fulfilmentStatus !== "paid") throw new Error("Only a paid box can receive a printed card");
    if (!/^GS-CARD-[A-Z0-9]+$/.test(cardCode)) throw new Error("Card code is not valid");
    await this.repository.assignPrintedCard(box, cardCode);
  }

  async replaceCard(boxNumber: string, cardCode: string): Promise<void> {
    const box = await this.repository.findByBoxNumber(boxNumber);
    if (!box) throw new Error("Box not found");
    if (box.fulfilmentStatus !== "paid") throw new Error("Only a paid box can have its card replaced");
    if (!/^GS-CARD-[A-Z0-9]+$/.test(cardCode)) throw new Error("Card code is not valid");
    if (!await this.repository.replacePrintedCard(box, cardCode)) throw new Error("A replacement requires an assigned box and an available card");
  }

  async advanceFulfilment(boxNumber: string, nextStatus: FulfilmentStatus): Promise<Box> {
    const box = await this.repository.findByBoxNumber(boxNumber);
    if (!box) throw new Error("Box not found");
    const advanced = moveFulfilment(box, nextStatus);
    if (nextStatus === "packed" && !await this.repository.findPackingRecord(boxNumber)) throw new Error("A completed packing record is required");
    if (nextStatus === "collected" && !await this.repository.findCollectionRecord(boxNumber)) throw new Error("A collection record is required");
    if (nextStatus === "delivered" && !await this.repository.findDeliveryRecord(boxNumber)) throw new Error("A delivery record is required");
    await this.repository.saveFulfilmentStatus(advanced);
    return advanced;
  }
}
