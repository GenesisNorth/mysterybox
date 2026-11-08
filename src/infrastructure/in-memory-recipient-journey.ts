import { randomUUID } from "node:crypto";
import type { RecipientBox, RecipientJourneyRepository, RecipientProfile } from "../application/recipient-journey.js";
import type { CheckoutDetails, PassItForwardRepository, PendingOrder, Referral } from "../application/pass-it-forward.js";
import { createOpaqueToken, createReference, hashOpaqueToken } from "./secrets.js";
import type { GiverTrackerRepository, GiverTrackingRecord } from "../application/giver-tracker.js";
import type { MyStoriesRepository, StorySummary } from "../application/my-stories.js";

export class InMemoryRecipientJourneyRepository implements RecipientJourneyRepository, PassItForwardRepository, GiverTrackerRepository, MyStoriesRepository {
  private readonly boxes = new Map<string, RecipientBox>();
  private readonly sessions = new Map<string, { boxId: string }>();
  private readonly referrals = new Map<string, Referral>();
  private readonly orders = new Map<string, { reference: string; parentBoxId: string; details: CheckoutDetails; paid: boolean; childCardToken?: string }>();
  private readonly trackers = new Map<string, GiverTrackingRecord>();
  private readonly recipientProfiles = new Map<string, RecipientProfile>();
  private readonly reminderPreferences = new Map<string, boolean>();
  private readonly magicLinks = new Map<string, { boxId: string; accountId: string }>();
  private readonly storySessions = new Map<string, string>();
  private readonly accounts = new Map<string, string>();
  private readonly storyAccess = new Map<string, Set<string>>();
  constructor(seed: RecipientBox[]) { for (const box of seed) this.boxes.set(box.cardToken, structuredClone(box)); }
  async findByCardToken(cardToken: string): Promise<RecipientBox | null> { const box = this.boxes.get(cardToken); return box ? structuredClone(box) : null; }
  async save(box: RecipientBox): Promise<void> { this.boxes.set(box.cardToken, structuredClone(box)); }
  async claimReceipt(boxId: string): Promise<boolean> {
    for (const [token, box] of this.boxes) {
      if (box.id !== boxId) continue;
      if (box.fulfilmentStatus !== "delivered" || (box.recipientStatus !== "unknown" && box.recipientStatus !== "scanned")) return false;
      this.boxes.set(token, { ...box, recipientStatus: "confirmed" }); return true;
    }
    return false;
  }
  async createHolderSession(boxId: string): Promise<string> { const sessionToken = createOpaqueToken(); this.sessions.set(sessionToken, { boxId }); return sessionToken; }
  async findHolderSession(sessionToken: string): Promise<{ boxId: string } | null> { return this.sessions.get(sessionToken) ?? null; }
  async updateRecipientProfile(boxId: string, profile: RecipientProfile): Promise<void> {
    for (const [token, box] of this.boxes) {
      if (box.id === boxId) {
        this.recipientProfiles.set(boxId, structuredClone(profile));
        // Registering never moves a box backwards: a "decided" recipient who edits their label stays decided.
        if (box.recipientStatus === "confirmed") this.boxes.set(token, { ...box, recipientStatus: "registered" });
        return;
      }
    }
    throw new Error("Box not found");
  }
  recipientProfileFor(boxId: string): RecipientProfile | null { return this.recipientProfiles.get(boxId) ?? null; }
  async updateReminderPreference(boxId: string, emailOptIn: boolean): Promise<void> { this.reminderPreferences.set(boxId, emailOptIn); }
  async findReminderPreference(boxId: string): Promise<boolean> { return this.reminderPreferences.get(boxId) ?? false; }
  async requestMagicLink(boxId: string, email: string, token: string): Promise<void> { const accountId = this.accounts.get(email) ?? `account-${this.accounts.size + 1}`; this.accounts.set(email, accountId); this.magicLinks.set(token, { boxId, accountId }); }
  async consumeMagicLink(token: string): Promise<{ accountId: string } | null> { const link = this.magicLinks.get(token); if (!link) return null; this.magicLinks.delete(token); const boxes=this.storyAccess.get(link.accountId) ?? new Set<string>(); boxes.add(link.boxId); this.storyAccess.set(link.accountId,boxes); return { accountId: link.accountId }; }
  async createSession(accountId: string, token: string): Promise<void> { this.storySessions.set(token, accountId); }
  async findSession(token: string): Promise<{ accountId: string } | null> { const accountId = this.storySessions.get(token); return accountId ? { accountId } : null; }
  async listStories(accountId: string): Promise<StorySummary[]> { const accessed = this.storyAccess.get(accountId) ?? new Set<string>(); return [...this.boxes.values()].filter((box) => accessed.has(box.id)).map((box) => ({ boxNumber: box.boxNumber, fulfilmentStatus: box.fulfilmentStatus, recipientStatus: box.recipientStatus })); }
  async createReferral(parentBox: RecipientBox): Promise<string> {
    const token = createOpaqueToken();
    this.referrals.set(hashOpaqueToken(token), { id: randomUUID(), parentBoxId: parentBox.id, trailId: parentBox.trailId, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
    return token;
  }
  async findReferral(token: string): Promise<Referral | null> {
    const referral = this.referrals.get(hashOpaqueToken(token));
    return referral && referral.expiresAt > new Date() ? referral : null;
  }
  async createPendingOrder(referral: Referral, details: CheckoutDetails): Promise<PendingOrder> {
    const existing = this.orders.get(referral.id);
    if (existing) {
      if (existing.paid) throw new Error("This order is no longer awaiting payment");
      existing.details = structuredClone(details);
      return { reference: existing.reference, paymentReference: createReference("PAY"), status: "pending_payment", trackerToken: null };
    }
    const trackerToken = createOpaqueToken();
    const reference = createReference("ORD");
    this.orders.set(referral.id, { reference, parentBoxId: referral.parentBoxId, details: structuredClone(details), paid: false });
    this.trackers.set(hashOpaqueToken(trackerToken), { orderReference: reference, orderStatus: "pending_payment", paidAt: null, packedAt: null, collectedAt: null, deliveredAt: null });
    return { reference, paymentReference: reference, status: "pending_payment", trackerToken };
  }
  async findByTrackerToken(token: string): Promise<GiverTrackingRecord | null> { return this.trackers.get(hashOpaqueToken(token)) ?? null; }
  orderDetailsFor(reference: string): CheckoutDetails | null { return [...this.orders.values()].find((order) => order.reference === reference)?.details ?? null; }

  /**
   * DEMO ONLY: stands in for a verified payment plus fulfilment, so the full chain can be walked in a browser without
   * Paystack or staff. Creates the child box already delivered and returns its card token. Never wired in production.
   */
  async simulatePaidAndDelivered(reference: string): Promise<{ cardToken: string }> {
    const order = [...this.orders.values()].find((candidate) => candidate.reference === reference);
    if (!order) throw new Error("Order not found");
    if (order.childCardToken) return { cardToken: order.childCardToken };
    const parent = [...this.boxes.values()].find((box) => box.id === order.parentBoxId);
    if (!parent) throw new Error("Parent box not found");
    const parentRecipient = this.recipientProfiles.get(parent.id) ?? { firstName: null, lastInitial: null, area: null, displayConsent: false };
    const cardToken = createOpaqueToken();
    const now = new Date();
    this.boxes.set(cardToken, {
      id: randomUUID(), boxNumber: `GS-${String(this.boxes.size + 1).padStart(5, "0")}`, trailId: parent.trailId, parentBoxId: parent.id,
      depth: parent.depth + 1, cardToken, fulfilmentStatus: "delivered", recipientStatus: "unknown",
      giver: null, giverName: order.details.giverName, giverNote: order.details.note,
      members: [...parent.members, { position: parent.depth + 2, participant: parentRecipient }]
    });
    order.paid = true; order.childCardToken = cardToken;
    for (const [hash, tracker] of this.trackers) if (tracker.orderReference === reference) this.trackers.set(hash, { ...tracker, orderStatus: "paid", paidAt: now, packedAt: now, collectedAt: now, deliveredAt: now });
    return { cardToken };
  }
}

/** A recipient at depth 2: Teni started the trail (#1), Chioma (#2) passed to Dayo (#3), who passed to "you" (#4). */
export const demoRecipientBoxes: RecipientBox[] = [{
  id: "box-demo-1", boxNumber: "GS-00001", trailId: "trail-demo", parentBoxId: "box-demo-parent", depth: 2,
  cardToken: "demo-card-token", fulfilmentStatus: "delivered", recipientStatus: "unknown",
  giver: { firstName: "Dayo", lastInitial: "L", area: "Surulere", displayConsent: true }, giverName: null,
  giverNote: "You have carried so many of us this year. This one is for you.",
  members: [
    { position: 1, participant: { firstName: "Teni", lastInitial: "A", area: "Yaba", displayConsent: true } },
    { position: 2, participant: { firstName: "Chioma", lastInitial: "N", area: "Ikeja", displayConsent: true } },
    { position: 3, participant: { firstName: "Dayo", lastInitial: "L", area: "Surulere", displayConsent: true } }
  ]
}];
