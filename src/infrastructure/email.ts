/** A plain-text email. Messages must never contain trail participants' names or contact details. */
export interface EmailMessage { to: string; subject: string; text: string; }
export interface EmailSender { readonly name: string; send(message: EmailMessage): Promise<void>; }

/** Resend (https://resend.com) over its HTTPS API; no SDK dependency. Swap this class to change provider. */
export class ResendEmailSender implements EmailSender {
  readonly name = "resend";
  constructor(private readonly apiKey: string, private readonly from: string, private readonly fetchImpl: typeof fetch = fetch, private readonly endpoint = "https://api.resend.com/emails") {}
  async send(message: EmailMessage): Promise<void> {
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text }),
      signal: AbortSignal.timeout(10_000)
    });
    // The response body can echo the recipient address, so it is deliberately not included in the error.
    if (!response.ok) throw new Error(`Email provider rejected the message with HTTP ${response.status}`);
  }
}

/** Development only: prints emails (including their secret links) to the server log instead of sending them. */
export class DevelopmentLogEmailSender implements EmailSender {
  readonly name = "development-log";
  async send(message: EmailMessage): Promise<void> { console.info(JSON.stringify({ event: "email.development", ...message })); }
}

/**
 * EMAIL_PROVIDER=resend (with RESEND_API_KEY and EMAIL_FROM) or EMAIL_PROVIDER=log (development only).
 * Unset means email is off: reminders stay manual and My Stories links are not sent.
 */
export function emailSenderFromEnvironment(env: NodeJS.ProcessEnv): EmailSender | null {
  const provider = env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (!provider) return null;
  if (provider === "log") {
    if (env.NODE_ENV === "production") throw new Error("EMAIL_PROVIDER=log would print secret links to the logs; it is not allowed in production");
    return new DevelopmentLogEmailSender();
  }
  if (provider === "resend") {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("EMAIL_PROVIDER=resend needs RESEND_API_KEY and EMAIL_FROM");
    return new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  throw new Error(`Unknown EMAIL_PROVIDER "${env.EMAIL_PROVIDER}"`);
}
