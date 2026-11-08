import { createOpaqueToken, hashOpaqueToken } from "../infrastructure/secrets.js";
import type { RecipientJourneyRepository } from "./recipient-journey.js";
import type { PassItForwardRepository } from "./pass-it-forward.js";
import type { EmailSender } from "../infrastructure/email.js";

export type HelpCategory = "not_arrived" | "damaged" | "lost_access" | "other";
export const helpCategoryLabels: Record<HelpCategory, string> = {
  not_arrived: "My box hasn't arrived", damaged: "It arrived damaged or something is wrong",
  lost_access: "I lost my card or changed phones", other: "Something else"
};
export interface HelpRequestSummary {
  id: string; boxNumber: string; category: HelpCategory; message: string | null; contact: string | null;
  status: "open" | "resolved"; createdAt: Date; resolvedAt: Date | null; resolvedBy: string | null;
}

export type ReminderChannel = "email" | "sms";
export type PassForwardReminderStatus = "scheduled" | "sent" | "accepted" | "declined";
/** Stored verbatim with each request as evidence of what the recipient agreed to. */
export const reminderConsentText = "Send me one reminder about this box. Nothing else.";
export const reminderDelayHours = 24;
export interface ReminderLink { id: string; boxId: string; boxNumber: string; trailId: string; status: PassForwardReminderStatus; }
export interface StaffReminder {
  id: string; boxNumber: string; channel: ReminderChannel; destination: string; sendAt: Date; status: PassForwardReminderStatus;
  sentAt: Date | null; respondedAt: Date | null;
  /** The box was passed forward after the reminder was requested, so the reminder is no longer needed. */
  passedOn: boolean;
  /** Automatic email delivery attempts; at 3 the reminder is left for staff to send by hand. */
  attempts: number;
}
export const maxAutomaticAttempts = 3;

export interface SupportRepository {
  createHelpRequest(boxId: string, input: { category: HelpCategory; message: string | null; contact: string | null }): Promise<void>;
  countOpenHelpRequests(boxId: string): Promise<number>;
  listHelpRequests(status: "open" | "resolved", limit: number): Promise<HelpRequestSummary[]>;
  listHelpRequestsForBox(boxNumber: string): Promise<HelpRequestSummary[]>;
  resolveHelpRequest(id: string, actor: string): Promise<boolean>;
  /** Returns false when the box already has a reminder (one per box, ever). */
  createPassForwardReminder(boxId: string, reminder: { channel: ReminderChannel; destination: string; consentText: string; sendAt: Date; tokenHash: string }): Promise<boolean>;
  findPassForwardReminderForBox(boxId: string): Promise<{ status: PassForwardReminderStatus; sendAt: Date } | null>;
  findPassForwardReminderByToken(tokenHash: string): Promise<ReminderLink | null>;
  /** Atomically records the first answer; "declined" also marks the box decided. Returns false if already answered. */
  respondToPassForwardReminder(id: string, response: "accepted" | "declined"): Promise<boolean>;
  listPassForwardReminders(limit: number): Promise<StaffReminder[]>;
  /** Replaces the link token of a due, scheduled reminder. Returns false otherwise. */
  issuePassForwardReminderLink(id: string, tokenHash: string): Promise<boolean>;
  markPassForwardReminderSent(id: string): Promise<boolean>;
  /**
   * Atomically claims one due, scheduled email reminder that has not been passed on, is not claimed by another sender in
   * the last 10 minutes, and has fewer than 3 attempts; counts the attempt. Returns null when nothing is due.
   */
  claimDueEmailReminder(): Promise<{ id: string; destination: string } | null>;
  /** Stores a recovery link for a delivered, already-received box. Returns false if the box is not eligible. */
  createHolderRecoveryLink(boxNumber: string, link: { tokenHash: string; expiresAt: Date; createdBy: string }): Promise<boolean>;
  /**
   * Atomically uses an unexpired, unused link: ends every holder session for its box and stores the new one.
   * Returns false when the link is unknown, used or expired.
   */
  consumeHolderRecoveryLink(tokenHash: string, newSessionTokenHash: string): Promise<boolean>;
}
type Store = SupportRepository & Pick<PassItForwardRepository, keyof RecipientJourneyRepository | "createReferral">;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+() -]{7,30}$/;
export class SupportValidationError extends Error {}

/** "Not yet / I need help". Open to anyone holding the card; it reveals nothing beyond the printed box number. */
export class HelpDesk {
  constructor(private readonly repository: Store) {}

  async page(cardToken: string): Promise<{ kind: "ready"; boxNumber: string } | { kind: "not-found" }> {
    const box = await this.repository.findByCardToken(cardToken);
    return box ? { kind: "ready", boxNumber: box.boxNumber } : { kind: "not-found" };
  }

  async submit(cardToken: string, input: { category: string; message: string; contact: string }): Promise<void> {
    const box = await this.repository.findByCardToken(cardToken);
    if (!box) throw new Error("Box not found");
    if (!(input.category in helpCategoryLabels)) throw new SupportValidationError("Choose what you need help with.");
    const message = input.message.trim() || null; const contact = input.contact.trim() || null;
    if (message && message.length > 1000) throw new SupportValidationError("Your message can be up to 1,000 characters.");
    if (contact && (contact.length > 120 || (!emailPattern.test(contact) && !phonePattern.test(contact)))) throw new SupportValidationError("Enter an email address or phone number we can reach you on, or leave it blank.");
    if (await this.repository.countOpenHelpRequests(box.id) >= 3) throw new SupportValidationError("We already have your request for this box and will be in touch soon.");
    await this.repository.createHelpRequest(box.id, { category: input.category as HelpCategory, message, contact });
  }

  openRequests(): Promise<HelpRequestSummary[]> { return this.repository.listHelpRequests("open", 200); }
  resolvedRequests(): Promise<HelpRequestSummary[]> { return this.repository.listHelpRequests("resolved", 100); }
  requestsForBox(boxNumber: string): Promise<HelpRequestSummary[]> { return this.repository.listHelpRequestsForBox(boxNumber); }
  async resolve(id: string, actor: string): Promise<void> { if (!await this.repository.resolveHelpRequest(id, actor)) throw new Error("That request is already resolved or does not exist"); }
}

export const recoveryLinkHours = 48;

/** "I changed phones": staff-issued, single-use links that move a received box to a new phone. */
export class HolderRecovery {
  constructor(private readonly repository: SupportRepository, private readonly now = () => new Date()) {}

  /** Administrator only (enforced by the caller): returns the raw link once; only its hash is stored. */
  async issue(boxNumber: string, actor: string, baseUrl: string): Promise<{ link: string; expiresAt: Date }> {
    const token = createOpaqueToken();
    const expiresAt = new Date(this.now().getTime() + recoveryLinkHours * 60 * 60 * 1000);
    if (!await this.repository.createHolderRecoveryLink(boxNumber, { tokenHash: hashOpaqueToken(token), expiresAt, createdBy: actor })) {
      throw new Error("A recovery link can only be issued for a delivered box that has already been received");
    }
    return { link: `${baseUrl.replace(/\/$/, "")}/h/${token}`, expiresAt };
  }

  /** Returns the new holder session token, or null when the link cannot be used. */
  async use(token: string): Promise<string | null> {
    const session = createOpaqueToken();
    return await this.repository.consumeHolderRecoveryLink(hashOpaqueToken(token), hashOpaqueToken(session)) ? session : null;
  }
}

/** The privacy-safe reminder text. It never names the giver, the recipient or anyone on the trail. */
export function reminderMessage(link: string): string {
  return `You wanted to pass your Gratitude Stories box forward. A gentle reminder: would you like to continue your trail? ${link} This is the only reminder we will send.`;
}

/** "Remind me in 24 hours": one consented reminder per box, whose link brings the holder back to the choice on any phone. */
export class PassForwardReminders {
  constructor(private readonly repository: Store, private readonly now = () => new Date()) {}

  private async holderBox(cardToken: string, holderSession: string | undefined) {
    const box = await this.repository.findByCardToken(cardToken);
    const session = holderSession ? await this.repository.findHolderSession(holderSession) : null;
    if (!box || !session || session.boxId !== box.id) throw new Error("Only the confirmed holder can ask for a reminder");
    if (box.fulfilmentStatus !== "delivered" || !["confirmed", "registered", "decided"].includes(box.recipientStatus)) throw new Error("This box is not ready for a decision");
    return box;
  }

  /** For the decision card: when the reminder is (or was) due, if one exists. */
  async status(cardToken: string): Promise<{ status: PassForwardReminderStatus; sendAt: Date } | null> {
    const box = await this.repository.findByCardToken(cardToken);
    return box ? this.repository.findPassForwardReminderForBox(box.id) : null;
  }

  async canRequest(cardToken: string, holderSession: string | undefined): Promise<boolean> {
    try { const box = await this.holderBox(cardToken, holderSession); return !await this.repository.findPassForwardReminderForBox(box.id); } catch { return false; }
  }

  /** Returns the raw link token. Production discards it (staff re-issue a fresh one when sending); local development shows it as a preview. */
  async request(cardToken: string, holderSession: string | undefined, input: { channel: string; destination: string; consent: boolean }): Promise<{ token: string; sendAt: Date }> {
    const box = await this.holderBox(cardToken, holderSession);
    if (input.channel !== "email" && input.channel !== "sms") throw new SupportValidationError("Choose email or text message.");
    const destination = input.channel === "email" ? input.destination.trim().toLowerCase() : input.destination.trim();
    if (input.channel === "email" && (!emailPattern.test(destination) || destination.length > 254)) throw new SupportValidationError("Enter a valid email address.");
    if (input.channel === "sms" && (!phonePattern.test(destination) || destination.replace(/\D/g, "").length < 7)) throw new SupportValidationError("Enter a valid phone number.");
    if (!input.consent) throw new SupportValidationError("Tick the box to agree to one reminder.");
    const token = createOpaqueToken();
    const sendAt = new Date(this.now().getTime() + reminderDelayHours * 60 * 60 * 1000);
    if (!await this.repository.createPassForwardReminder(box.id, { channel: input.channel, destination, consentText: reminderConsentText, sendAt, tokenHash: hashOpaqueToken(token) })) {
      throw new SupportValidationError("You already asked for a reminder about this box.");
    }
    return { token, sendAt };
  }

  async linkPage(token: string): Promise<{ kind: "ready"; boxNumber: string } | { kind: "answered"; response: "accepted" | "declined" } | { kind: "invalid" }> {
    const reminder = await this.repository.findPassForwardReminderByToken(hashOpaqueToken(token));
    if (!reminder) return { kind: "invalid" };
    if (reminder.status === "accepted" || reminder.status === "declined") return { kind: "answered", response: reminder.status };
    return { kind: "ready", boxNumber: reminder.boxNumber };
  }

  /** "Yes, pass it forward now": signs this phone in as the holder and starts a referral for checkout. */
  async accept(token: string): Promise<{ sessionToken: string; referralToken: string }> {
    const reminder = await this.repository.findPassForwardReminderByToken(hashOpaqueToken(token));
    if (!reminder || reminder.status === "declined") throw new Error("This reminder link is no longer valid");
    if (reminder.status !== "accepted" && !await this.repository.respondToPassForwardReminder(reminder.id, "accepted")) throw new Error("This reminder link is no longer valid");
    return { sessionToken: await this.repository.createHolderSession(reminder.boxId), referralToken: await this.repository.createReferral({ id: reminder.boxId, trailId: reminder.trailId }) };
  }

  /** "No thanks" is final: no further reminders, and the box is marked decided. Their place on the trail is unchanged. */
  async decline(token: string): Promise<void> {
    const reminder = await this.repository.findPassForwardReminderByToken(hashOpaqueToken(token));
    if (!reminder || reminder.status === "accepted" || reminder.status === "declined") throw new Error("This reminder link is no longer valid");
    if (!await this.repository.respondToPassForwardReminder(reminder.id, "declined")) throw new Error("This reminder link is no longer valid");
  }

  list(): Promise<StaffReminder[]> { return this.repository.listPassForwardReminders(200); }

  /** Issues a fresh single-use link for a due reminder and returns the exact message for staff to send. */
  async prepare(id: string, baseUrl: string): Promise<{ message: string; link: string }> {
    const token = createOpaqueToken();
    if (!await this.repository.issuePassForwardReminderLink(id, hashOpaqueToken(token))) throw new Error("Only a scheduled reminder that is due can be prepared");
    const link = `${baseUrl.replace(/\/$/, "")}/r/${token}`;
    return { message: reminderMessage(link), link };
  }

  /**
   * Sends due email reminders through the provider: each gets a fresh single-use link, then is marked sent.
   * A failed send is retried by a later run (up to 3 attempts), then left for staff. Returns how many were sent.
   */
  async dispatchDueEmails(sender: EmailSender, baseUrl: string, limit = 20): Promise<{ sent: number; failed: number }> {
    let sent = 0; let failed = 0;
    for (let i = 0; i < limit; i++) {
      const due = await this.repository.claimDueEmailReminder();
      if (!due) break;
      try {
        const { message } = await this.prepare(due.id, baseUrl);
        await sender.send({ to: due.destination, subject: "A gentle reminder from Gratitude Stories", text: message });
        await this.markSent(due.id); sent++;
      } catch { failed++; }
    }
    return { sent, failed };
  }

  async markSent(id: string): Promise<void> { if (!await this.repository.markPassForwardReminderSent(id)) throw new Error("Only a scheduled reminder can be marked sent"); }
}
