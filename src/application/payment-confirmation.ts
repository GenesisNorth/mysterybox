import type { PaymentGateway, VerifiedPaystackTransaction } from "../infrastructure/paystack.js";

export interface PaymentOrder {
  reference: string;
  amountKobo: number;
  currency: string;
  customerEmail: string;
}
export interface PaymentConfirmationStore {
  findOrder(reference: string): Promise<PaymentOrder | null>;
  markPaidAndCreateChild(reference: string): Promise<{ childBoxId: string; alreadyProcessed: boolean }>;
}

export class PaymentConfirmation {
  constructor(private readonly gateway: PaymentGateway, private readonly store: PaymentConfirmationStore) {}

  async confirm(reference: string): Promise<{ childBoxId: string; alreadyProcessed: boolean }> {
    const order = await this.store.findOrder(reference);
    if (!order) throw new Error("Order not found");
    const payment = await this.gateway.verify(reference);
    this.assertMatchesOrder(payment, order);
    return this.store.markPaidAndCreateChild(reference);
  }

  private assertMatchesOrder(payment: VerifiedPaystackTransaction, order: PaymentOrder): void {
    if (payment.status !== "success") throw new Error("Payment has not succeeded");
    if (payment.reference !== order.reference) throw new Error("Payment reference does not match the order");
    if (payment.amount !== order.amountKobo || payment.currency !== order.currency || payment.customerEmail.toLowerCase() !== order.customerEmail.toLowerCase()) {
      throw new Error("Verified payment does not match the expected order");
    }
  }
}
