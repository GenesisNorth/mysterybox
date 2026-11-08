import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifiedPaystackTransaction {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  customerEmail: string;
}
export interface PaymentGateway {
  verify(reference: string): Promise<VerifiedPaystackTransaction>;
}

export interface PaystackCheckoutInput {
  reference: string;
  email: string;
  amountKobo: number;
  callbackUrl: string;
}

export interface InitializedPaystackTransaction {
  reference: string;
  authorizationUrl: string;
}

export class PaystackGateway implements PaymentGateway {
  constructor(private readonly secretKey: string, private readonly baseUrl = "https://api.paystack.co") {}

  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = createHmac("sha512", this.secretKey).update(rawBody).digest("hex");
    if (signature.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  }

  async verify(reference: string): Promise<VerifiedPaystackTransaction> {
    const response = await fetch(`${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${this.secretKey}` }
    });
    if (!response.ok) throw new Error(`Paystack verification failed with HTTP ${response.status}`);
    const payload = await response.json() as { status: boolean; data?: { reference: string; status: string; amount: number; currency: string; customer?: { email?: string } } };
    if (!payload.status || !payload.data?.customer?.email) throw new Error("Paystack returned an incomplete verification response");
    return { reference: payload.data.reference, status: payload.data.status, amount: payload.data.amount, currency: payload.data.currency, customerEmail: payload.data.customer.email };
  }

  async initialize(input: PaystackCheckoutInput): Promise<InitializedPaystackTransaction> {
    if (!Number.isInteger(input.amountKobo) || input.amountKobo <= 0) throw new Error("Paystack amount must be a positive integer in kobo");
    const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.secretKey}`, "content-type": "application/json" },
      body: JSON.stringify({ email: input.email, amount: input.amountKobo, reference: input.reference, callback_url: input.callbackUrl })
    });
    if (!response.ok) throw new Error(`Paystack initialization failed with HTTP ${response.status}`);
    const payload = await response.json() as { status: boolean; data?: { reference?: string; authorization_url?: string } };
    if (!payload.status || !payload.data?.reference || !payload.data.authorization_url) throw new Error("Paystack returned an incomplete initialization response");
    if (payload.data.reference !== input.reference) throw new Error("Paystack initialization returned the wrong reference");
    return { reference: payload.data.reference, authorizationUrl: payload.data.authorization_url };
  }
}
