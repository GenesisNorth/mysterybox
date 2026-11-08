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
export type DeliveryTo = "giver" | "recipient";
/** What the buyer types at checkout. Every field is untrusted until normalized by `normalizeCheckout`. */
export interface CheckoutInput {
  email: string; giverName: string; note: string; deliveryTo: string;
  deliveryName: string; deliveryPhone: string; addressLine1: string; addressLine2: string; city: string; region: string; deliveryNotes: string;
}
/**
 * The story and shipping label for the next box. `giverName` and `note` are shown to the next recipient (typing the
 * name is the giver's consent for that one person to see it; it never affects the public trail). Delivery fields are
 * private and only ever reach staff fulfilment views.
 */
export interface CheckoutDetails {
  customerEmail: string; giverName: string; note: string | null; deliveryTo: DeliveryTo;
  deliveryName: string; deliveryPhone: string; addressLine1: string; addressLine2: string | null; city: string; region: string | null; deliveryNotes: string | null;
}
/** A problem the buyer can fix on the form, as opposed to an expired or invalid referral. */
export class CheckoutValidationError extends Error {}

export interface PassItForwardRepository extends RecipientJourneyRepository {
  createReferral(parentBox: Pick<RecipientBox, "id" | "trailId">): Promise<string>;
  findReferral(token: string): Promise<Referral | null>;
  /**
   * Creates the order on first call; later calls add a new payment attempt to the same pending order and replace its
   * checkout details with the latest ones. Throws once it is paid.
   */
  createPendingOrder(referral: Referral, details: CheckoutDetails): Promise<PendingOrder>;
}

export function normalizeCheckout(input: CheckoutInput): CheckoutDetails {
  const fail = (message: string): never => { throw new CheckoutValidationError(message); };
  const required = (value: string, min: number, max: number, message: string) => { const clean = value.trim().replace(/\s+/g, " "); return clean.length < min || clean.length > max ? fail(message) : clean; };
  const optional = (value: string, max: number, message: string) => { const clean = value.trim(); return clean.length > max ? fail(message) : clean || null; };
  const customerEmail = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) || customerEmail.length > 254) fail("Enter a valid email address.");
  const giverName = required(input.giverName, 1, 40, "Enter the first name they will see (up to 40 characters).");
  if (!/^[\p{L}][\p{L}' -]*$/u.test(giverName)) fail("Your name can only contain letters, spaces, hyphens and apostrophes.");
  if (input.deliveryTo !== "giver" && input.deliveryTo !== "recipient") fail("Choose where we should deliver the box.");
  const deliveryPhone = input.deliveryPhone.trim();
  if (!/^[0-9+() -]{7,30}$/.test(deliveryPhone) || deliveryPhone.replace(/\D/g, "").length < 7) fail("Enter a phone number the courier can call.");
  return {
    customerEmail, giverName,
    note: optional(input.note, 500, "Your note can be up to 500 characters."),
    deliveryTo: input.deliveryTo as DeliveryTo,
    deliveryName: required(input.deliveryName, 2, 80, "Enter the name of the person receiving the delivery."),
    deliveryPhone,
    addressLine1: required(input.addressLine1, 2, 160, "Enter the delivery address."),
    addressLine2: optional(input.addressLine2, 160, "Address line 2 is too long."),
    city: required(input.city, 2, 80, "Enter the city."),
    region: optional(input.region, 80, "Area or state is too long."),
    deliveryNotes: optional(input.deliveryNotes, 500, "Delivery instructions can be up to 500 characters.")
  };
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

  async createOrder(referralToken: string | undefined, input: CheckoutInput): Promise<PendingOrder & { details: CheckoutDetails }> {
    if (!referralToken) throw new Error("A valid referral is required");
    const referral = await this.repository.findReferral(referralToken);
    if (!referral) throw new Error("Referral not found or expired");
    const details = normalizeCheckout(input);
    return { ...await this.repository.createPendingOrder(referral, details), details };
  }
}
