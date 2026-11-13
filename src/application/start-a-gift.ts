import { normalizeCheckout, type CheckoutDetails, type CheckoutInput, type PendingOrder } from "./pass-it-forward.js";
import { createOpaqueToken } from "../infrastructure/secrets.js";

/**
 * "Start a gift box": anyone can buy the first box of a new trail from the website. The order is identified by a
 * checkout token kept in the buyer's browser, so resubmitting the form reuses one pending order. The trail and its
 * first box are created only when payment is verified, by the same confirmation path as passed-forward boxes.
 */
export interface StartAGiftRepository {
  /** Returns null when the order for this token is no longer awaiting payment (already paid or stopped). */
  createPendingStarterOrder(checkoutToken: string, details: CheckoutDetails): Promise<PendingOrder | null>;
}

const tokenPattern = /^[A-Za-z0-9_-]{32,}$/;

export class StartAGift {
  constructor(private readonly repository: StartAGiftRepository) {}

  async createOrder(checkoutToken: string | undefined, input: CheckoutInput): Promise<PendingOrder & { details: CheckoutDetails; checkoutToken: string }> {
    const details = normalizeCheckout(input);
    let token = checkoutToken && tokenPattern.test(checkoutToken) ? checkoutToken : createOpaqueToken();
    let order = await this.repository.createPendingStarterOrder(token, details);
    // The previous order from this browser is already paid: this is a new gift, so start a fresh order.
    if (!order) { token = createOpaqueToken(); order = await this.repository.createPendingStarterOrder(token, details); }
    if (!order) throw new Error("The order could not be created");
    return { ...order, details, checkoutToken: token };
  }
}
