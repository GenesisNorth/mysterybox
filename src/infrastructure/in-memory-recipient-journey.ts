import { randomUUID } from "node:crypto";
import type { RecipientBox, RecipientJourneyRepository, RecipientProfile } from "../application/recipient-journey.js";
import type { PassItForwardRepository, PendingOrder, Referral } from "../application/pass-it-forward.js";
import { createOpaqueToken, createReference, hashOpaqueToken } from "./secrets.js";
import type { GiverTrackerRepository, GiverTrackingRecord } from "../application/giver-tracker.js";
import type { MyStoriesRepository, StorySummary } from "../application/my-stories.js";

export class InMemoryRecipientJourneyRepository implements RecipientJourneyRepository, PassItForwardRepository, GiverTrackerRepository, MyStoriesRepository {
  private readonly boxes = new Map<string, RecipientBox>();
  private readonly sessions = new Map<string, { boxId: string }>();
  private readonly referrals = new Map<string, Referral>();
  private readonly orders = new Map<string, PendingOrder>();
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
  async createPendingOrder(referral: Referral, _customerEmail: string): Promise<PendingOrder> {
    const existing = this.orders.get(referral.id);
    if (existing) return { ...existing, paymentReference: createReference("PAY"), trackerToken: null };
    const trackerToken = createOpaqueToken();
    const reference = createReference("ORD");
    const order = { reference, paymentReference: reference, status: "pending_payment" as const, trackerToken };
    this.orders.set(referral.id, order);
    this.trackers.set(hashOpaqueToken(trackerToken), { orderReference: order.reference, orderStatus: "pending_payment", paidAt: null, packedAt: null, collectedAt: null, deliveredAt: null });
    return order;
  }
  async findByTrackerToken(token: string): Promise<GiverTrackingRecord | null> { return this.trackers.get(hashOpaqueToken(token)) ?? null; }
}

/** A recipient at depth 2: Teni started the trail (#1), Chioma (#2) passed to Dayo (#3), who passed to "you" (#4). */
export const demoRecipientBoxes: RecipientBox[] = [{
  id: "box-demo-1", boxNumber: "GS-00001", trailId: "trail-demo", parentBoxId: "box-demo-parent", depth: 2,
  cardToken: "demo-card-token", fulfilmentStatus: "delivered", recipientStatus: "unknown",
  giver: { firstName: "Dayo", lastInitial: "L", area: "Surulere", displayConsent: true },
  giverNote: "You have carried so many of us this year. This one is for you.",
  members: [
    { position: 1, participant: { firstName: "Teni", lastInitial: "A", area: "Yaba", displayConsent: true } },
    { position: 2, participant: { firstName: "Chioma", lastInitial: "N", area: "Ikeja", displayConsent: true } },
    { position: 3, participant: { firstName: "Dayo", lastInitial: "L", area: "Surulere", displayConsent: true } }
  ]
}];
