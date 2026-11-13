/**
 * Data retention. Two jobs:
 * - purge: delete expired single-use secrets (sessions, sign-in, referral and recovery links) that no longer serve a purpose;
 * - erase: on a "delete my details" request, remove one person's personal data from a finished box while keeping the
 *   trail's structure intact (the person then appears as "A friend").
 * Payment records (orders and payment attempts, including the buyer's email) are kept for financial record-keeping.
 * Confirm that policy, and retention periods, in the privacy/legal review for the launch jurisdiction.
 */
export type ErasureSubject = "recipient" | "giver";
export interface PurgeResult { holderSessions: number; storySessions: number; storyLinks: number; referrals: number; recoveryLinks: number; staffSessions?: number; staffPasswordLinks?: number; }

export interface PrivacyRepository {
  /** Deletes expired secrets older than `graceDays`; referrals only when no order was ever created from them. */
  purgeExpiredSecrets(graceDays: number): Promise<PurgeResult>;
  /** Returns false when the box does not exist or is still being fulfilled. */
  erasePersonalData(boxNumber: string, subject: ErasureSubject, actor: string): Promise<boolean>;
}

export class DataRetention {
  constructor(private readonly repository: PrivacyRepository) {}
  purge(graceDays = 7): Promise<PurgeResult> { return this.repository.purgeExpiredSecrets(graceDays); }
  async erase(boxNumber: string, subject: string, actor: string): Promise<void> {
    if (subject !== "recipient" && subject !== "giver") throw new Error("Choose whose details to erase");
    if (!await this.repository.erasePersonalData(boxNumber, subject, actor)) throw new Error("Details can only be erased once a box is delivered, cancelled or refunded");
  }
}
