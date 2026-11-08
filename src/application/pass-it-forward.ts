import type { RecipientBox, RecipientJourneyRepository } from "./recipient-journey.js";

export interface Referral {
  id: string;
  parentBoxId: string;
  trailId: string;
  expiresAt: Date;
}
/**
 * `reference` names the order (one per referral). `paymentReference` is a fresh, single-use reference for this
 * checkout attempt, because Paystack rejects a reused reference. `trackerToken` is returned only when the order is
 * first created; the raw token is not stored, so retries rely on the tracker cookie set the first time.
 */
export interface PendingOrder { reference: string; paymentReference: string; status: "pending_payment"; trackerToken: string | null; }
export interface PassItForwardRepository extends RecipientJourneyRepository {
  createReferral(parentBox: RecipientBox): Promise<string>;
  findReferral(token: string): Promise<Referral | null>;
  /** Creates the order on first call; later calls add a new payment attempt to the same pending order. Throws once it is paid. */
  createPendingOrder(referral: Referral, customerEmail: string): Promise<PendingOrder>;
}
export type CheckoutPage = { kind: "ready"; trailId: string } | { kind: "invalid-referral" };

export class PassItForward {
  constructor(private readonly repository: PassItForwardRepository) {}

  async begin(cardToken: string, holderSession: string | undefined): Promise<{ referralToken: string }> {
    const box = await this.repository.findByCardToken(cardToken);
    if (!box || !holderSession) throw new Error("A confirmed holder is required");
    const session = await this.repository.findHolderSession(holderSession);
    if (!session || session.boxId !== box.id) throw new Error("This device does not hold this box");
    if (box.fulfilmentStatus !== "delivered" || !["confirmed", "registered", "decided"].includes(box.recipientStatus)) {
      throw new Error("This box is not ready to be passed forward");
    }
    return { referralToken: await this.repository.createReferral(box) };
  }

  async decline(cardToken: string, holderSession: string | undefined): Promise<void> {
    const box = await this.repository.findByCardToken(cardToken);
    if (!box || !holderSession) throw new Error("A confirmed holder is required");
    const session = await this.repository.findHolderSession(holderSession);
    if (!session || session.boxId !== box.id) throw new Error("This device does not hold this box");
    if (box.fulfilmentStatus !== "delivered" || !["confirmed", "registered", "decided"].includes(box.recipientStatus)) throw new Error("This box is not ready for a decision");
    await this.repository.save({ ...box, recipientStatus: "decided" });
  }

  async checkoutPage(referralToken: string | undefined): Promise<CheckoutPage> {
    if (!referralToken) return { kind: "invalid-referral" };
    const referral = await this.repository.findReferral(referralToken);
    return referral ? { kind: "ready", trailId: referral.trailId } : { kind: "invalid-referral" };
  }

  async createOrder(referralToken: string | undefined, customerEmail: string): Promise<PendingOrder> {
    if (!referralToken) throw new Error("A valid referral is required");
    const referral = await this.repository.findReferral(referralToken);
    if (!referral) throw new Error("Referral not found or expired");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) throw new Error("A valid email is required");
    return this.repository.createPendingOrder(referral, customerEmail.trim().toLowerCase());
  }
}
