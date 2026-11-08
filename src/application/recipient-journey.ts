import { confirmReceipt, type Box } from "../domain/box.js";
import { publicLabel, type ParticipantDisplay } from "../domain/public-trail.js";

/** Position 1 is the trail's starter (giver of the root box); the recipient of a box at depth d is at d + 2. */
export interface TrailMember { position: number; participant: ParticipantDisplay; }
/** `members` holds only this box's own lineage (starter and ancestor recipients), never other branches or later people. */
/**
 * `giverName` is the name a pass-forward giver typed at checkout for this recipient to see; it takes precedence over
 * the consent-based `giver` label used for staff-created boxes.
 */
export interface RecipientBox extends Box { cardToken: string; giver: ParticipantDisplay | null; giverName: string | null; giverNote: string | null; members: TrailMember[]; }
export interface RecipientProfile { firstName: string | null; lastInitial: string | null; area: string | null; displayConsent: boolean; }
export interface RecipientJourneyRepository {
  findByCardToken(cardToken: string): Promise<RecipientBox | null>;
  save(box: RecipientBox): Promise<void>;
  /** Atomically marks a delivered, unconfirmed box as confirmed. Returns false if it was already claimed. */
  claimReceipt(boxId: string): Promise<boolean>;
  createHolderSession(boxId: string): Promise<string>;
  findHolderSession(sessionToken: string): Promise<{ boxId: string } | null>;
  updateRecipientProfile(boxId: string, profile: RecipientProfile): Promise<void>;
  updateReminderPreference(boxId: string, emailOptIn: boolean): Promise<void>;
  findReminderPreference(boxId: string): Promise<boolean>;
}
export type BoxPage =
  | { kind: "not-found" } | { kind: "inactive" } | { kind: "in-transit"; boxNumber: string }
  | { kind: "confirm-receipt"; boxNumber: string }
  | { kind: "reveal"; boxNumber: string; giver: string; note: string | null; trail: string[]; position: number }
  /** Shown to anyone other than the holder once a box has been received: public-safe labels only, no note or actions. */
  | { kind: "read-only"; boxNumber: string; trail: string[] };
export type ProfilePage = { kind: "ready" } | { kind: "not-found" } | { kind: "not-authorized" };

export class RecipientJourney {
  constructor(private readonly repository: RecipientJourneyRepository) {}
  async getPage(cardToken: string, holderSession?: string): Promise<BoxPage> {
    const box = await this.repository.findByCardToken(cardToken);
    if (!box) return { kind: "not-found" };
    if (box.fulfilmentStatus === "cancelled" || box.fulfilmentStatus === "refunded") return { kind: "inactive" };
    if (box.fulfilmentStatus !== "delivered") return { kind: "in-transit", boxNumber: box.boxNumber };
    if (box.recipientStatus === "unknown" || box.recipientStatus === "scanned") return { kind: "confirm-receipt", boxNumber: box.boxNumber };
    const trail = [...box.members].sort((a, b) => a.position - b.position).map((member) => publicLabel(member.participant));
    if (!await this.holdsBox(box.id, holderSession)) return { kind: "read-only", boxNumber: box.boxNumber, trail };
    return { kind: "reveal", boxNumber: box.boxNumber, giver: box.giverName ?? (box.giver ? publicLabel(box.giver) : "Someone who cares"), note: box.giverNote, trail, position: box.depth + 2 };
  }

  /** The first device to confirm a delivered box becomes its only holder; a holder confirming again changes nothing. */
  async confirm(cardToken: string, holderSession?: string): Promise<{ sessionToken: string }> {
    const box = await this.repository.findByCardToken(cardToken);
    if (!box) throw new Error("Box not found");
    if (holderSession && await this.holdsBox(box.id, holderSession)) return { sessionToken: holderSession };
    confirmReceipt(box);
    if (!await this.repository.claimReceipt(box.id)) throw new Error("This box has already been received");
    return { sessionToken: await this.repository.createHolderSession(box.id) };
  }

  async profilePage(cardToken: string, holderSession: string | undefined): Promise<ProfilePage> {
    const box = await this.repository.findByCardToken(cardToken);
    if (!box) return { kind: "not-found" };
    if (!await this.holdsBox(box.id, holderSession)) return { kind: "not-authorized" };
    if (box.fulfilmentStatus !== "delivered" || !["confirmed", "registered", "decided"].includes(box.recipientStatus)) return { kind: "not-authorized" };
    return { kind: "ready" };
  }

  async registerProfile(cardToken: string, holderSession: string | undefined, input: { firstName: string; lastInitial: string; area: string; displayConsent: boolean }): Promise<void> {
    const page = await this.profilePage(cardToken, holderSession);
    if (page.kind !== "ready") throw new Error("Only the confirmed holder can update this profile");
    const profile = this.normalizeProfile(input);
    const box = await this.repository.findByCardToken(cardToken);
    if (!box) throw new Error("Box not found");
    await this.repository.updateRecipientProfile(box.id, profile);
  }
  async reminderPreference(cardToken: string, holderSession: string | undefined): Promise<boolean> {
    const page = await this.profilePage(cardToken, holderSession); if (page.kind !== "ready") throw new Error("Only the confirmed holder can manage reminders");
    const box = await this.repository.findByCardToken(cardToken); if (!box) throw new Error("Box not found"); return this.repository.findReminderPreference(box.id);
  }
  async setReminderPreference(cardToken: string, holderSession: string | undefined, emailOptIn: boolean): Promise<void> {
    const page = await this.profilePage(cardToken, holderSession); if (page.kind !== "ready") throw new Error("Only the confirmed holder can manage reminders");
    const box = await this.repository.findByCardToken(cardToken); if (!box) throw new Error("Box not found"); await this.repository.updateReminderPreference(box.id, emailOptIn);
  }

  private async holdsBox(boxId: string, holderSession: string | undefined): Promise<boolean> {
    return Boolean(holderSession && (await this.repository.findHolderSession(holderSession))?.boxId === boxId);
  }

  private normalizeProfile(input: { firstName: string; lastInitial: string; area: string; displayConsent: boolean }): RecipientProfile {
    if (!input.displayConsent) return { firstName: null, lastInitial: null, area: null, displayConsent: false };
    const firstName = input.firstName.trim();
    const lastInitial = input.lastInitial.trim().toUpperCase();
    const area = input.area.trim();
    if (!/^[\p{L}'-]{1,40}$/u.test(firstName) || !/^[\p{L}]$/u.test(lastInitial) || area.length < 2 || area.length > 80) {
      throw new Error("Enter a first name, one last initial, and an area to appear on the trail");
    }
    return { firstName, lastInitial, area, displayConsent: true };
  }
}
