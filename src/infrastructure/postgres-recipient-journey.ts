import { Pool } from "pg";
import type { RecipientBox, RecipientJourneyRepository, RecipientProfile, TrailMember } from "../application/recipient-journey.js";
import type { CheckoutDetails, PassItForwardRepository, PendingOrder, Referral } from "../application/pass-it-forward.js";
import type { PaymentConfirmationStore, PaymentOrder } from "../application/payment-confirmation.js";
import type { FulfilmentRepository } from "../application/fulfilment.js";
import type { Box } from "../domain/box.js";
import type { GiverTrackerRepository, GiverTrackingRecord } from "../application/giver-tracker.js";
import type { AuditEvent, BoxParticipantIntake, CardStatus, CollectionRecord, DeliveryDetails, DeliveryRecord, NewPrintedCard, PackingRecord, PrivateParticipant, PrintedCard, ProvisionedStaffUser, ReminderJob, ReminderKind, StarterBox, StaffBoxOverview, StaffOperationsRepository, StaffRole, StaffUserSummary } from "../application/staff-operations.js";
import { createOpaqueToken, createReference, hashOpaqueToken } from "./secrets.js";
import type { DeliverableReminder, ReminderDeliveryStore } from "../application/reminders.js";
import type { MyStoriesRepository, StorySummary } from "../application/my-stories.js";

type BoxRow = {
  id: string; box_number: string; trail_id: string; parent_box_id: string | null; depth: number;
  fulfilment_status: RecipientBox["fulfilmentStatus"]; recipient_status: RecipientBox["recipientStatus"];
  giver_first_name: string | null; giver_last_initial: string | null; giver_area: string | null; giver_display_consent: boolean | null; giver_note: string | null; giver_display_name: string | null;
};
type MemberRow = { position: number; first_name: string | null; last_initial: string | null; area: string | null; display_consent: boolean | null };

export class PostgresRecipientJourneyRepository implements RecipientJourneyRepository, PassItForwardRepository, PaymentConfirmationStore, FulfilmentRepository, GiverTrackerRepository, StaffOperationsRepository, ReminderDeliveryStore, MyStoriesRepository {
  constructor(private readonly pool: Pool, private readonly passOnAmountKobo: number) {}

  async ping(): Promise<void> { await this.pool.query("SELECT 1"); }
  async close(): Promise<void> { await this.pool.end(); }
  async findStaffIdentityByToken(token: string): Promise<{ actor: string; role: StaffRole } | null> { const q=await this.pool.query<{email:string;role:StaffRole}>(`SELECT email,role FROM staff_users WHERE api_token_hash=$1 AND active=true AND revoked_at IS NULL`,[hashOpaqueToken(token)]); const r=q.rows[0]; return r?{actor:r.email,role:r.role}:null; }

  async findByCardToken(cardToken: string): Promise<RecipientBox | null> {
    const tokenHash = hashOpaqueToken(cardToken);
    const result = await this.pool.query<BoxRow>(`
      SELECT b.id, b.box_number, b.trail_id, b.parent_box_id, b.depth, b.fulfilment_status, b.recipient_status,
        giver.first_name AS giver_first_name, giver.last_initial AS giver_last_initial, giver.area AS giver_area,
        giver.display_consent AS giver_display_consent, b.giver_note, b.giver_display_name
      FROM boxes b LEFT JOIN participants giver ON giver.id = b.giver_participant_id
      LEFT JOIN box_cards card ON card.id = b.card_id
      WHERE card.token_hash = $1 OR b.qr_token_hash = $1`, [tokenHash]);
    const row = result.rows[0];
    if (!row) return null;
    // Only this box's own lineage: the starter (giver of the root box) at position 1, then the recipient of
    // each ancestor box. Sibling branches and anyone after this box are never included.
    const members = await this.pool.query<MemberRow>(`
      WITH RECURSIVE lineage AS (
        SELECT id, parent_box_id, depth, giver_participant_id, recipient_participant_id FROM boxes WHERE id = $1
        UNION ALL
        SELECT parent.id, parent.parent_box_id, parent.depth, parent.giver_participant_id, parent.recipient_participant_id
        FROM boxes parent JOIN lineage child ON parent.id = child.parent_box_id
      )
      SELECT 1 AS position, p.first_name, p.last_initial, p.area, p.display_consent
      FROM lineage l LEFT JOIN participants p ON p.id = l.giver_participant_id WHERE l.parent_box_id IS NULL
      UNION ALL
      SELECT l.depth + 2, p.first_name, p.last_initial, p.area, p.display_consent
      FROM lineage l LEFT JOIN participants p ON p.id = l.recipient_participant_id WHERE l.id <> $1
      ORDER BY position ASC`, [row.id]);
    return {
      id: row.id, boxNumber: row.box_number, trailId: row.trail_id, parentBoxId: row.parent_box_id, depth: row.depth,
      cardToken, fulfilmentStatus: row.fulfilment_status, recipientStatus: row.recipient_status,
      giver: row.giver_first_name && row.giver_last_initial && row.giver_area && row.giver_display_consent !== null
        ? { firstName: row.giver_first_name, lastInitial: row.giver_last_initial, area: row.giver_area, displayConsent: row.giver_display_consent }
        : null,
      giverName: row.giver_display_name,
      giverNote: row.giver_note,
      members: members.rows.map((member): TrailMember => ({ position: member.position, participant: {
        firstName: member.first_name, lastInitial: member.last_initial, area: member.area, displayConsent: member.display_consent ?? false
      } }))
    };
  }

  async save(box: RecipientBox): Promise<void> {
    await this.pool.query(`UPDATE boxes SET recipient_status = $2, received_at = CASE WHEN $2 = 'confirmed' THEN COALESCE(received_at, now()) ELSE received_at END WHERE id = $1`, [box.id, box.recipientStatus]);
  }

  async claimReceipt(boxId: string): Promise<boolean> {
    const result = await this.pool.query(`
      UPDATE boxes SET recipient_status = 'confirmed', received_at = COALESCE(received_at, now())
      WHERE id = $1 AND fulfilment_status = 'delivered' AND recipient_status IN ('unknown', 'scanned')`, [boxId]);
    return result.rowCount === 1;
  }

  async createHolderSession(boxId: string): Promise<string> {
    const token = createOpaqueToken();
    await this.pool.query(`INSERT INTO holder_sessions (box_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '30 days')`, [boxId, hashOpaqueToken(token)]);
    return token;
  }

  async findHolderSession(sessionToken: string): Promise<{ boxId: string } | null> {
    const result = await this.pool.query<{ box_id: string }>(`SELECT box_id FROM holder_sessions WHERE token_hash = $1 AND expires_at > now()`, [hashOpaqueToken(sessionToken)]);
    return result.rows[0] ? { boxId: result.rows[0].box_id } : null;
  }

  async updateRecipientProfile(boxId: string, profile: RecipientProfile): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<{ recipient_participant_id: string | null }>(`SELECT recipient_participant_id FROM boxes WHERE id = $1 FOR UPDATE`, [boxId]);
      const participantId = existing.rows[0]?.recipient_participant_id;
      if (participantId) {
        await client.query(`UPDATE participants SET first_name = $2, last_initial = $3, area = $4, display_consent = $5 WHERE id = $1`, [participantId, profile.firstName, profile.lastInitial, profile.area, profile.displayConsent]);
      } else {
        const participant = await client.query<{ id: string }>(`INSERT INTO participants (first_name, last_initial, area, display_consent) VALUES ($1, $2, $3, $4) RETURNING id`, [profile.firstName, profile.lastInitial, profile.area, profile.displayConsent]);
        const id = participant.rows[0]?.id;
        if (!id) throw new Error("Recipient profile could not be created");
        await client.query(`UPDATE boxes SET recipient_participant_id = $2 WHERE id = $1`, [boxId, id]);
      }
      // Registering never moves a box backwards: a "decided" recipient who edits their label stays decided.
      await client.query(`UPDATE boxes SET recipient_status = 'registered' WHERE id = $1 AND recipient_status = 'confirmed'`, [boxId]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async updateReminderPreference(boxId: string, emailOptIn: boolean): Promise<void> { await this.pool.query(`INSERT INTO reminder_preferences (box_id,email_opt_in) VALUES ($1,$2) ON CONFLICT (box_id) DO UPDATE SET email_opt_in=EXCLUDED.email_opt_in,updated_at=now()`,[boxId,emailOptIn]); }
  async findReminderPreference(boxId: string): Promise<boolean> { const q=await this.pool.query<{email_opt_in:boolean}>(`SELECT email_opt_in FROM reminder_preferences WHERE box_id=$1`,[boxId]); return q.rows[0]?.email_opt_in ?? false; }

  async createReferral(parentBox: RecipientBox): Promise<string> {
    const token = createOpaqueToken();
    await this.pool.query(`INSERT INTO referrals (parent_box_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '30 days')`, [parentBox.id, hashOpaqueToken(token)]);
    return token;
  }

  async findReferral(token: string): Promise<Referral | null> {
    const result = await this.pool.query<{ id: string; parent_box_id: string; trail_id: string; expires_at: Date }>(`
      SELECT r.id, r.parent_box_id, b.trail_id, r.expires_at
      FROM referrals r JOIN boxes b ON b.id = r.parent_box_id
      WHERE r.token_hash = $1 AND r.expires_at > now()`, [hashOpaqueToken(token)]);
    const row = result.rows[0];
    return row ? { id: row.id, parentBoxId: row.parent_box_id, trailId: row.trail_id, expiresAt: row.expires_at } : null;
  }

  async createPendingOrder(referral: Referral, details: CheckoutDetails): Promise<PendingOrder> {
    const customerEmail = details.customerEmail;
    const detailValues = [details.giverName, details.note, details.deliveryTo, details.deliveryName, details.deliveryPhone, details.addressLine1, details.addressLine2, details.city, details.region, details.deliveryNotes];
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Lock the referral so two simultaneous checkouts cannot both create its order.
      const locked = await client.query(`SELECT 1 FROM referrals WHERE id = $1 FOR UPDATE`, [referral.id]);
      if (locked.rowCount !== 1) throw new Error("Referral not found");
      const existing = await client.query<{ id: string; reference: string; status: string }>(`SELECT id, reference, status FROM orders WHERE referral_id = $1`, [referral.id]);
      const current = existing.rows[0];
      if (current) {
        if (current.status !== "pending_payment") throw new Error("This order is no longer awaiting payment");
        // The latest attempt's details win: the buyer may have corrected the note or address before paying.
        await client.query(`
          UPDATE orders SET giver_display_name = $2, gift_note = $3, delivery_to = $4, delivery_name = $5, delivery_phone = $6,
            delivery_address_line_1 = $7, delivery_address_line_2 = $8, delivery_city = $9, delivery_region = $10, delivery_notes = $11
          WHERE id = $1`, [current.id, ...detailValues]);
        const paymentReference = createReference("PAY");
        await client.query(`INSERT INTO payment_attempts (order_id, reference, customer_email) VALUES ($1, $2, $3)`, [current.id, paymentReference, customerEmail]);
        await client.query("COMMIT");
        return { reference: current.reference, paymentReference, status: "pending_payment", trackerToken: null };
      }
      const reference = createReference("ORD");
      const trackerToken = createOpaqueToken();
      const result = await client.query<{ id: string; reference: string; status: "pending_payment" }>(`
      INSERT INTO orders (reference, referral_id, trail_id, parent_box_id, amount_kobo, currency, customer_email, status,
        giver_display_name, gift_note, delivery_to, delivery_name, delivery_phone,
        delivery_address_line_1, delivery_address_line_2, delivery_city, delivery_region, delivery_notes)
      VALUES ($1, $2, $3, $4, $5, 'NGN', $6, 'pending_payment', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, reference, status`, [reference, referral.id, referral.trailId, referral.parentBoxId, this.passOnAmountKobo, customerEmail, ...detailValues]);
      const order = result.rows[0];
      if (!order) throw new Error("Order could not be created");
      await client.query(`INSERT INTO payment_attempts (order_id, reference, customer_email) VALUES ($1, $2, $3)`, [order.id, order.reference, customerEmail]);
      await client.query(`INSERT INTO giver_trackers (order_id, token_hash) VALUES ($1, $2)`, [order.id, hashOpaqueToken(trackerToken)]);
      await client.query("COMMIT");
      return { reference: order.reference, paymentReference: order.reference, status: order.status, trackerToken };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  /** Looks up by payment-attempt reference; the email to verify against is the one entered for that attempt. */
  async findOrder(reference: string): Promise<PaymentOrder | null> {
    const result = await this.pool.query<PaymentOrder>(`
      SELECT a.reference, o.amount_kobo AS "amountKobo", o.currency, a.customer_email AS "customerEmail"
      FROM payment_attempts a JOIN orders o ON o.id = a.order_id WHERE a.reference = $1`, [reference]);
    return result.rows[0] ?? null;
  }

  async markPaidAndCreateChild(reference: string): Promise<{ childBoxId: string; alreadyProcessed: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const orderResult = await client.query<{ id: string; parent_box_id: string; child_box_id: string | null; status: string; attempt_id: string }>(`
        SELECT o.id, o.parent_box_id, o.child_box_id, o.status, a.id AS attempt_id
        FROM payment_attempts a JOIN orders o ON o.id = a.order_id WHERE a.reference = $1 FOR UPDATE OF o`, [reference]);
      const order = orderResult.rows[0];
      if (!order) throw new Error("Order not found");
      // Record every verified attempt, so a second payment on an already-completed order is visible for refund.
      await client.query(`UPDATE payment_attempts SET verified_at = COALESCE(verified_at, now()) WHERE id = $1`, [order.attempt_id]);
      if (order.child_box_id) { await client.query("COMMIT"); return { childBoxId: order.child_box_id, alreadyProcessed: true }; }
      if (order.status !== "pending_payment") throw new Error("Order cannot be completed");
      const parentResult = await client.query<{ trail_id: string; depth: number; fulfilment_status: string }>(`SELECT trail_id, depth, fulfilment_status FROM boxes WHERE id = $1 FOR KEY SHARE`, [order.parent_box_id]);
      const parent = parentResult.rows[0];
      if (!parent || parent.fulfilment_status === "cancelled" || parent.fulfilment_status === "refunded") throw new Error("Parent box cannot be continued");
      const story = (await client.query<{
        giver_display_name: string | null; gift_note: string | null; delivery_to: "giver" | "recipient" | null; delivery_name: string | null; delivery_phone: string | null;
        delivery_address_line_1: string | null; delivery_address_line_2: string | null; delivery_city: string | null; delivery_region: string | null; delivery_notes: string | null;
      }>(`SELECT giver_display_name, gift_note, delivery_to, delivery_name, delivery_phone, delivery_address_line_1, delivery_address_line_2,
            delivery_city, delivery_region, delivery_notes FROM orders WHERE id = $1`, [order.id])).rows[0];
      const childResult = await client.query<{ id: string }>(`
        INSERT INTO boxes (box_number, trail_id, parent_box_id, depth, fulfilment_status, paid_at, giver_display_name, giver_note)
        VALUES ('GS-' || lpad(nextval('box_number_sequence')::text, 5, '0'), $1, $2, $3, 'paid', now(), $4, $5) RETURNING id`,
        [parent.trail_id, order.parent_box_id, parent.depth + 1, story?.giver_display_name ?? null, story?.gift_note ?? null]);
      const child = childResult.rows[0];
      if (!child) throw new Error("Child box could not be created");
      // The shipping label moves to the staff-only delivery record of the box it belongs to.
      if (story?.delivery_address_line_1 && story.delivery_city) {
        await client.query(`
          INSERT INTO delivery_details (box_id, address_line_1, address_line_2, city, region, delivery_notes, contact_name, contact_phone, delivery_to)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [child.id, story.delivery_address_line_1, story.delivery_address_line_2, story.delivery_city, story.delivery_region, story.delivery_notes, story.delivery_name, story.delivery_phone, story.delivery_to]);
      }
      await client.query(`UPDATE orders SET status = 'paid', child_box_id = $2 WHERE id = $1`, [order.id, child.id]);
      await client.query(`INSERT INTO story_box_access (account_id, box_id)
        SELECT access.account_id, $2 FROM story_box_access access WHERE access.box_id = $1
        ON CONFLICT DO NOTHING`, [order.parent_box_id, child.id]);
      await client.query("COMMIT");
      return { childBoxId: child.id, alreadyProcessed: false };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async findByBoxNumber(boxNumber: string): Promise<Box | null> {
    const result = await this.pool.query<{ id: string; box_number: string; trail_id: string; parent_box_id: string | null; depth: number; fulfilment_status: Box["fulfilmentStatus"]; recipient_status: Box["recipientStatus"] }>(`
      SELECT id, box_number, trail_id, parent_box_id, depth, fulfilment_status, recipient_status FROM boxes WHERE box_number = $1`, [boxNumber]);
    const row = result.rows[0];
    return row ? { id: row.id, boxNumber: row.box_number, trailId: row.trail_id, parentBoxId: row.parent_box_id, depth: row.depth, fulfilmentStatus: row.fulfilment_status, recipientStatus: row.recipient_status } : null;
  }

  async assignPrintedCard(box: Box, cardCode: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const card = await client.query<{ id: string }>(`UPDATE box_cards SET status = 'assigned', assigned_at = now() WHERE card_code = $1 AND status = 'available' RETURNING id`, [cardCode]);
      const cardId = card.rows[0]?.id;
      if (!cardId) throw new Error("Card is unavailable");
      const assigned = await client.query(`UPDATE boxes SET card_id = $2 WHERE id = $1 AND fulfilment_status = 'paid' AND card_id IS NULL`, [box.id, cardId]);
      if (assigned.rowCount !== 1) throw new Error("Box is not ready for a card");
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async replacePrintedCard(box: Box, cardCode: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query<{ card_id: string | null }>(`SELECT card_id FROM boxes WHERE id = $1 AND fulfilment_status = 'paid' FOR UPDATE`, [box.id]);
      const previousCardId = current.rows[0]?.card_id;
      if (!previousCardId) { await client.query("ROLLBACK"); return false; }
      const replacement = await client.query<{ id: string }>(`UPDATE box_cards SET status = 'assigned', assigned_at = now() WHERE card_code = $1 AND status = 'available' RETURNING id`, [cardCode]);
      const replacementId = replacement.rows[0]?.id;
      if (!replacementId) { await client.query("ROLLBACK"); return false; }
      await client.query(`UPDATE box_cards SET status = 'voided' WHERE id = $1 AND status = 'assigned'`, [previousCardId]);
      await client.query(`UPDATE boxes SET card_id = $2 WHERE id = $1`, [box.id, replacementId]);
      await client.query("COMMIT");
      return true;
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async createPrintedCards(cards: readonly NewPrintedCard[]): Promise<void> {
    if (cards.length === 0) return;
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      for (const card of cards) {
        await client.query(`INSERT INTO box_cards (card_code, token_hash) VALUES ($1, $2)`, [card.cardCode, hashOpaqueToken(card.cardToken)]);
      }
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async listPrintedCards(status?: CardStatus): Promise<PrintedCard[]> {
    const result = await this.pool.query<{ card_code: string; status: CardStatus; box_number: string | null; assigned_at: Date | null }>(`
      SELECT card.card_code, card.status, box.box_number, card.assigned_at
      FROM box_cards card LEFT JOIN boxes box ON box.card_id = card.id
      WHERE ($1::box_card_status IS NULL OR card.status = $1)
      ORDER BY card.created_at DESC, card.card_code ASC`, [status ?? null]);
    return result.rows.map((row) => ({ cardCode: row.card_code, status: row.status, assignedBoxNumber: row.box_number, assignedAt: row.assigned_at }));
  }

  async voidPrintedCard(cardCode: string): Promise<boolean> {
    const result = await this.pool.query(`UPDATE box_cards SET status = 'voided' WHERE card_code = $1 AND status = 'available'`, [cardCode]);
    return result.rowCount === 1;
  }

  async createStarterBox(trailCode: string): Promise<StarterBox> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const trail = await client.query<{ id: string }>(`INSERT INTO trails (code) VALUES ($1) RETURNING id`, [trailCode]);
      const trailId = trail.rows[0]?.id;
      if (!trailId) throw new Error("Trail could not be created");
      const box = await client.query<{ box_number: string }>(`
        INSERT INTO boxes (box_number, trail_id, depth, fulfilment_status)
        VALUES ('GS-' || lpad(nextval('box_number_sequence')::text, 5, '0'), $1, 0, 'created')
        RETURNING box_number`, [trailId]);
      const boxNumber = box.rows[0]?.box_number;
      if (!boxNumber) throw new Error("Starter box could not be created");
      await client.query("COMMIT");
      return { boxNumber, trailCode };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async findStaffBoxOverview(boxNumber: string): Promise<StaffBoxOverview | null> {
    const result = await this.pool.query<{
      box_number: string; trail_code: string; parent_box_number: string | null; depth: number;
      fulfilment_status: Box["fulfilmentStatus"]; recipient_status: Box["recipientStatus"];
      card_code: string | null; card_status: CardStatus | null; created_at: Date; packed_at: Date | null; collected_at: Date | null; delivered_at: Date | null;
    }>(`
      SELECT b.box_number, t.code AS trail_code, parent.box_number AS parent_box_number, b.depth,
        b.fulfilment_status, b.recipient_status, card.card_code, card.status AS card_status,
        b.created_at, b.packed_at, b.collected_at, b.delivered_at
      FROM boxes b
      JOIN trails t ON t.id = b.trail_id
      LEFT JOIN boxes parent ON parent.id = b.parent_box_id
      LEFT JOIN box_cards card ON card.id = b.card_id
      WHERE b.box_number = $1`, [boxNumber]);
    const row = result.rows[0];
    return row ? {
      boxNumber: row.box_number, trailCode: row.trail_code, parentBoxNumber: row.parent_box_number, depth: row.depth,
      fulfilmentStatus: row.fulfilment_status, recipientStatus: row.recipient_status, cardCode: row.card_code, cardStatus: row.card_status,
      createdAt: row.created_at, packedAt: row.packed_at, collectedAt: row.collected_at, deliveredAt: row.delivered_at
    } : null;
  }
  async searchStaffBoxes(query: string, limit: number): Promise<StaffBoxOverview[]> {
    const result = await this.pool.query<{ box_number:string; trail_code:string; parent_box_number:string|null; depth:number; fulfilment_status:Box["fulfilmentStatus"]; recipient_status:Box["recipientStatus"]; card_code:string|null; card_status:CardStatus|null; created_at:Date; packed_at:Date|null; collected_at:Date|null; delivered_at:Date|null }>(`SELECT b.box_number,t.code trail_code,parent.box_number parent_box_number,b.depth,b.fulfilment_status,b.recipient_status,card.card_code,card.status card_status,b.created_at,b.packed_at,b.collected_at,b.delivered_at FROM boxes b JOIN trails t ON t.id=b.trail_id LEFT JOIN boxes parent ON parent.id=b.parent_box_id LEFT JOIN box_cards card ON card.id=b.card_id WHERE b.box_number ILIKE '%' || $1 || '%' OR t.code ILIKE '%' || $1 || '%' ORDER BY b.created_at DESC LIMIT $2`,[query,limit]);
    return result.rows.map(r=>({boxNumber:r.box_number,trailCode:r.trail_code,parentBoxNumber:r.parent_box_number,depth:r.depth,fulfilmentStatus:r.fulfilment_status,recipientStatus:r.recipient_status,cardCode:r.card_code,cardStatus:r.card_status,createdAt:r.created_at,packedAt:r.packed_at,collectedAt:r.collected_at,deliveredAt:r.delivered_at}));
  }
  async createStaffUser(user: ProvisionedStaffUser): Promise<void> { await this.pool.query(`INSERT INTO staff_users (email,role,api_token_hash) VALUES ($1,$2,$3)`,[user.email,user.role,hashOpaqueToken(user.apiToken)]); }
  async revokeStaffUser(email: string): Promise<boolean> { const result=await this.pool.query(`UPDATE staff_users SET active=false,revoked_at=now() WHERE email=$1 AND active=true AND revoked_at IS NULL`,[email]); return result.rowCount===1; }
  async listStaffUsers(): Promise<StaffUserSummary[]> { const q=await this.pool.query<{email:string;role:StaffRole;active:boolean;created_at:Date;revoked_at:Date|null}>(`SELECT email,role,active,created_at,revoked_at FROM staff_users ORDER BY created_at DESC`); return q.rows.map(r=>({email:r.email,role:r.role,active:r.active,createdAt:r.created_at,revokedAt:r.revoked_at})); }
  async rotateStaffUserToken(email: string, apiToken: string): Promise<StaffRole | null> { const q=await this.pool.query<{role:StaffRole}>(`UPDATE staff_users SET api_token_hash=$2 WHERE email=$1 AND active=true AND revoked_at IS NULL RETURNING role`,[email,hashOpaqueToken(apiToken)]); return q.rows[0]?.role ?? null; }
  async updateStaffRole(email: string, role: StaffRole): Promise<boolean> { const q=await this.pool.query(`UPDATE staff_users SET role=$2 WHERE email=$1 AND active=true AND revoked_at IS NULL`,[email,role]); return q.rowCount===1; }
  async isLastActiveAdmin(email: string): Promise<boolean> { const q=await this.pool.query<{target_admin:boolean;admin_count:string}>(`SELECT EXISTS(SELECT 1 FROM staff_users WHERE email=$1 AND role='admin' AND active=true AND revoked_at IS NULL) target_admin, (SELECT count(*) FROM staff_users WHERE role='admin' AND active=true AND revoked_at IS NULL) admin_count`,[email]); const r=q.rows[0]; return r ? r.target_admin && Number(r.admin_count) <= 1 : false; }
  async queueReminder(boxNumber: string, kind: ReminderKind): Promise<boolean> { const q=await this.pool.query(`INSERT INTO reminder_jobs (box_id,kind) SELECT b.id,$2 FROM boxes b JOIN reminder_preferences p ON p.box_id=b.id AND p.email_opt_in=true JOIN participants r ON r.id=b.recipient_participant_id AND r.email IS NOT NULL WHERE b.box_number=$1 ON CONFLICT (box_id,kind) DO NOTHING RETURNING id`,[boxNumber,kind]); return q.rowCount===1; }
  async findReminderJobs(boxNumber: string): Promise<ReminderJob[]> { const q=await this.pool.query<{kind:ReminderKind;status:ReminderJob["status"];scheduled_at:Date;sent_at:Date|null}>(`SELECT j.kind,j.status,j.scheduled_at,j.sent_at FROM reminder_jobs j JOIN boxes b ON b.id=j.box_id WHERE b.box_number=$1 ORDER BY j.scheduled_at DESC`,[boxNumber]); return q.rows.map(r=>({kind:r.kind,status:r.status,scheduledAt:r.scheduled_at,sentAt:r.sent_at})); }
  async claimNextReminder(): Promise<DeliverableReminder | null> { const client=await this.pool.connect(); try { await client.query("BEGIN"); const q=await client.query<{id:string;kind:ReminderKind;email:string}>(`WITH next AS (SELECT j.id,j.kind,r.email FROM reminder_jobs j JOIN reminder_preferences p ON p.box_id=j.box_id AND p.email_opt_in=true JOIN boxes b ON b.id=j.box_id JOIN participants r ON r.id=b.recipient_participant_id AND r.email IS NOT NULL WHERE j.status='queued' AND j.scheduled_at<=now() ORDER BY j.scheduled_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE reminder_jobs j SET status='processing',claimed_at=now() FROM next WHERE j.id=next.id RETURNING j.id,next.kind,next.email`); await client.query("COMMIT"); const r=q.rows[0]; return r?{id:r.id,kind:r.kind,email:r.email}:null; } catch(e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); } }
  async markReminderSent(id: string): Promise<void> { await this.pool.query(`UPDATE reminder_jobs SET status='sent',sent_at=now() WHERE id=$1 AND status='processing'`,[id]); }
  async markReminderFailed(id: string): Promise<void> { await this.pool.query(`UPDATE reminder_jobs SET status='failed' WHERE id=$1 AND status='processing'`,[id]); }
  async recoverStaleReminders(): Promise<number> { const q=await this.pool.query(`UPDATE reminder_jobs SET status='queued',claimed_at=NULL WHERE status='processing' AND claimed_at < now() - interval '15 minutes'`); return q.rowCount ?? 0; }
  async claimNext(): Promise<DeliverableReminder | null> { return this.claimNextReminder(); }
  async markSent(id: string): Promise<void> { await this.markReminderSent(id); }
  async markFailed(id: string): Promise<void> { await this.markReminderFailed(id); }
  async requestMagicLink(boxId: string, email: string, token: string): Promise<void> { const client=await this.pool.connect(); try { await client.query("BEGIN"); const a=await client.query<{id:string}>(`INSERT INTO story_accounts (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id`,[email]); const accountId=a.rows[0]?.id; if(!accountId) throw new Error("Account unavailable"); await client.query(`INSERT INTO story_magic_links (account_id,box_id,token_hash,expires_at) VALUES ($1,$2,$3,now()+interval '30 minutes')`,[accountId,boxId,hashOpaqueToken(token)]); await client.query("COMMIT"); } catch(e){await client.query("ROLLBACK");throw e;} finally{client.release();} }
  async consumeMagicLink(token: string): Promise<{ accountId: string } | null> { const client=await this.pool.connect(); try { await client.query("BEGIN"); const q=await client.query<{account_id:string;box_id:string}>(`SELECT account_id,box_id FROM story_magic_links WHERE token_hash=$1 AND expires_at>now() AND used_at IS NULL FOR UPDATE`,[hashOpaqueToken(token)]); const link=q.rows[0]; if(!link){await client.query("COMMIT");return null;} await client.query(`UPDATE story_magic_links SET used_at=now() WHERE token_hash=$1`,[hashOpaqueToken(token)]); await client.query(`INSERT INTO story_box_access (account_id,box_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,[link.account_id,link.box_id]); await client.query("COMMIT");return {accountId:link.account_id}; } catch(e){await client.query("ROLLBACK");throw e;} finally{client.release();} }
  async createSession(accountId: string, token: string): Promise<void> { await this.pool.query(`INSERT INTO story_sessions (account_id,token_hash,expires_at) VALUES ($1,$2,now()+interval '90 days')`,[accountId,hashOpaqueToken(token)]); }
  async findSession(token: string): Promise<{ accountId: string } | null> { const q=await this.pool.query<{account_id:string}>(`SELECT account_id FROM story_sessions WHERE token_hash=$1 AND expires_at>now()`,[hashOpaqueToken(token)]); return q.rows[0]?{accountId:q.rows[0].account_id}:null; }
  async listStories(accountId: string): Promise<StorySummary[]> { const q=await this.pool.query<{box_number:string;fulfilment_status:string;recipient_status:string}>(`SELECT b.box_number,b.fulfilment_status,b.recipient_status FROM story_box_access a JOIN boxes b ON b.id=a.box_id WHERE a.account_id=$1 ORDER BY a.created_at DESC`,[accountId]); return q.rows.map(r=>({boxNumber:r.box_number,fulfilmentStatus:r.fulfilment_status,recipientStatus:r.recipient_status})); }
  async cancelReminder(boxNumber: string, kind: ReminderKind): Promise<boolean> { const q=await this.pool.query(`UPDATE reminder_jobs j SET status='cancelled' FROM boxes b WHERE j.box_id=b.id AND b.box_number=$1 AND j.kind=$2 AND j.status='queued'`,[boxNumber,kind]); return q.rowCount===1; }
  async retryReminder(boxNumber: string, kind: ReminderKind): Promise<boolean> { const q=await this.pool.query(`UPDATE reminder_jobs j SET status='queued',scheduled_at=now() FROM boxes b WHERE j.box_id=b.id AND b.box_number=$1 AND j.kind=$2 AND j.status='failed'`,[boxNumber,kind]); return q.rowCount===1; }

  async saveDeliveryDetails(boxId: string, details: DeliveryDetails): Promise<void> {
    await this.pool.query(`
      INSERT INTO delivery_details (box_id, address_line_1, address_line_2, city, region, delivery_notes, contact_name, contact_phone, delivery_to)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (box_id) DO UPDATE SET address_line_1 = EXCLUDED.address_line_1, address_line_2 = EXCLUDED.address_line_2,
        city = EXCLUDED.city, region = EXCLUDED.region, delivery_notes = EXCLUDED.delivery_notes,
        contact_name = COALESCE(EXCLUDED.contact_name, delivery_details.contact_name),
        contact_phone = COALESCE(EXCLUDED.contact_phone, delivery_details.contact_phone),
        delivery_to = COALESCE(EXCLUDED.delivery_to, delivery_details.delivery_to), updated_at = now()`,
      [boxId, details.addressLine1, details.addressLine2, details.city, details.region, details.deliveryNotes, details.contactName ?? null, details.contactPhone ?? null, details.deliveryTo ?? null]);
  }

  async findDeliveryDetails(boxNumber: string): Promise<DeliveryDetails | null> {
    const result = await this.pool.query<{ address_line_1: string; address_line_2: string | null; city: string; region: string | null; delivery_notes: string | null; contact_name: string | null; contact_phone: string | null; delivery_to: "giver" | "recipient" | null }>(`
      SELECT d.address_line_1, d.address_line_2, d.city, d.region, d.delivery_notes, d.contact_name, d.contact_phone, d.delivery_to
      FROM delivery_details d JOIN boxes b ON b.id = d.box_id WHERE b.box_number = $1`, [boxNumber]);
    const row = result.rows[0];
    return row ? { addressLine1: row.address_line_1, addressLine2: row.address_line_2, city: row.city, region: row.region, deliveryNotes: row.delivery_notes, contactName: row.contact_name, contactPhone: row.contact_phone, deliveryTo: row.delivery_to } : null;
  }

  async saveParticipantIntake(boxId: string, intake: BoxParticipantIntake): Promise<void> {
    const client = await this.pool.connect();
    const save = async (existingId: string | null, person: PrivateParticipant): Promise<string> => {
      if (existingId) { await client.query(`UPDATE participants SET first_name=$2,last_initial=$3,area=$4,email=$5,phone=$6,display_consent=$7 WHERE id=$1`, [existingId, person.firstName, person.lastInitial, person.area, person.email, person.phone, person.displayConsent]); return existingId; }
      const result = await client.query<{ id: string }>(`INSERT INTO participants (first_name,last_initial,area,email,phone,display_consent) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [person.firstName, person.lastInitial, person.area, person.email, person.phone, person.displayConsent]);
      if (!result.rows[0]) throw new Error("Participant could not be created"); return result.rows[0].id;
    };
    try {
      await client.query("BEGIN");
      const box = await client.query<{ giver_participant_id: string | null; recipient_participant_id: string | null }>(`SELECT giver_participant_id, recipient_participant_id FROM boxes WHERE id=$1 FOR UPDATE`, [boxId]);
      const current = box.rows[0]; if (!current) throw new Error("Box not found");
      const giverId = await save(current.giver_participant_id, intake.giver);
      const recipientId = await save(current.recipient_participant_id, intake.recipient);
      await client.query(`UPDATE boxes SET giver_participant_id=$2, recipient_participant_id=$3, giver_note=$4 WHERE id=$1`, [boxId, giverId, recipientId, intake.giverNote]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  async findParticipantIntake(boxNumber: string): Promise<BoxParticipantIntake | null> {
    const result = await this.pool.query<{
      giver_first_name: string | null; giver_last_initial: string | null; giver_area: string | null; giver_email: string | null; giver_phone: string | null; giver_display_consent: boolean | null;
      recipient_first_name: string | null; recipient_last_initial: string | null; recipient_area: string | null; recipient_email: string | null; recipient_phone: string | null; giver_note: string | null;
    }>(`SELECT g.first_name giver_first_name,g.last_initial giver_last_initial,g.area giver_area,g.email giver_email,g.phone giver_phone,g.display_consent giver_display_consent,r.first_name recipient_first_name,r.last_initial recipient_last_initial,r.area recipient_area,r.email recipient_email,r.phone recipient_phone,b.giver_note FROM boxes b LEFT JOIN participants g ON g.id=b.giver_participant_id LEFT JOIN participants r ON r.id=b.recipient_participant_id WHERE b.box_number=$1`, [boxNumber]);
    const row = result.rows[0]; if (!row || (!row.giver_first_name && !row.recipient_first_name)) return null;
    return { giver: { firstName: row.giver_first_name, lastInitial: row.giver_last_initial, area: row.giver_area, email: row.giver_email, phone: row.giver_phone, displayConsent: row.giver_display_consent ?? false }, recipient: { firstName: row.recipient_first_name, lastInitial: row.recipient_last_initial, area: row.recipient_area, email: row.recipient_email, phone: row.recipient_phone, displayConsent: false }, giverNote: row.giver_note };
  }

  async savePackingRecord(boxId: string, record: Omit<PackingRecord, "recordedAt">): Promise<void> {
    await this.pool.query(`INSERT INTO packing_records (box_id, packed_by, checklist_complete, notes) VALUES ($1,$2,$3,$4) ON CONFLICT (box_id) DO UPDATE SET packed_by=EXCLUDED.packed_by, checklist_complete=EXCLUDED.checklist_complete, notes=EXCLUDED.notes, recorded_at=now()`, [boxId, record.packedBy, record.checklistComplete, record.notes]);
  }

  async findPackingRecord(boxNumber: string): Promise<PackingRecord | null> {
    const result = await this.pool.query<{ packed_by: string; checklist_complete: boolean; notes: string | null; recorded_at: Date }>(`SELECT p.packed_by,p.checklist_complete,p.notes,p.recorded_at FROM packing_records p JOIN boxes b ON b.id=p.box_id WHERE b.box_number=$1`, [boxNumber]);
    const row = result.rows[0]; return row ? { packedBy: row.packed_by, checklistComplete: row.checklist_complete, notes: row.notes, recordedAt: row.recorded_at } : null;
  }
  async saveCollectionRecord(boxId: string, r: Omit<CollectionRecord, "recordedAt">): Promise<void> { await this.pool.query(`INSERT INTO collection_records (box_id,courier,handoff_reference) VALUES ($1,$2,$3) ON CONFLICT (box_id) DO UPDATE SET courier=EXCLUDED.courier,handoff_reference=EXCLUDED.handoff_reference,recorded_at=now()`, [boxId,r.courier,r.handoffReference]); }
  async findCollectionRecord(boxNumber: string): Promise<CollectionRecord | null> { const q=await this.pool.query<{courier:string;handoff_reference:string|null;recorded_at:Date}>(`SELECT c.courier,c.handoff_reference,c.recorded_at FROM collection_records c JOIN boxes b ON b.id=c.box_id WHERE b.box_number=$1`,[boxNumber]); const r=q.rows[0]; return r?{courier:r.courier,handoffReference:r.handoff_reference,recordedAt:r.recorded_at}:null; }
  async saveDeliveryRecord(boxId: string, r: Omit<DeliveryRecord, "recordedAt">): Promise<void> { await this.pool.query(`INSERT INTO delivery_records (box_id,delivered_by,proof_reference) VALUES ($1,$2,$3) ON CONFLICT (box_id) DO UPDATE SET delivered_by=EXCLUDED.delivered_by,proof_reference=EXCLUDED.proof_reference,recorded_at=now()`,[boxId,r.deliveredBy,r.proofReference]); }
  async findDeliveryRecord(boxNumber: string): Promise<DeliveryRecord | null> { const q=await this.pool.query<{delivered_by:string;proof_reference:string;recorded_at:Date}>(`SELECT d.delivered_by,d.proof_reference,d.recorded_at FROM delivery_records d JOIN boxes b ON b.id=d.box_id WHERE b.box_number=$1`,[boxNumber]); const r=q.rows[0]; return r?{deliveredBy:r.delivered_by,proofReference:r.proof_reference,recordedAt:r.recorded_at}:null; }
  async findAuditEventsForBoxNumber(boxNumber: string, limit: number): Promise<AuditEvent[]> { const q=await this.pool.query<{actor:string;action:string;target_type:string;target_id:string;metadata:Record<string,unknown>;occurred_at:Date}>(`SELECT e.actor,e.action,e.target_type,e.target_id,e.metadata,e.occurred_at FROM staff_audit_events e JOIN boxes b ON b.id::text=e.target_id WHERE b.box_number=$1 ORDER BY e.occurred_at DESC LIMIT $2`,[boxNumber,limit]); return q.rows.map(r=>({actor:r.actor,action:r.action,targetType:r.target_type,targetId:r.target_id,metadata:r.metadata,occurredAt:r.occurred_at})); }
  async findAuditEventsForStaffEmail(email: string, limit: number): Promise<AuditEvent[]> { const q=await this.pool.query<{actor:string;action:string;target_type:string;target_id:string;metadata:Record<string,unknown>;occurred_at:Date}>(`SELECT e.actor,e.action,e.target_type,e.target_id,e.metadata,e.occurred_at FROM staff_audit_events e JOIN staff_users u ON u.id::text=e.target_id WHERE u.email=$1 ORDER BY e.occurred_at DESC LIMIT $2`,[email,limit]); return q.rows.map(r=>({actor:r.actor,action:r.action,targetType:r.target_type,targetId:r.target_id,metadata:r.metadata,occurredAt:r.occurred_at})); }

  async saveFulfilmentStatus(box: Box): Promise<void> {
    const timestampColumn: Partial<Record<Box["fulfilmentStatus"], string>> = { paid: "paid_at", packed: "packed_at", collected: "collected_at", delivered: "delivered_at" };
    const column = timestampColumn[box.fulfilmentStatus];
    const timestamp = column ? `, ${column} = COALESCE(${column}, now())` : "";
    await this.pool.query(`UPDATE boxes SET fulfilment_status = $2${timestamp} WHERE id = $1`, [box.id, box.fulfilmentStatus]);
  }

  async findByTrackerToken(token: string): Promise<GiverTrackingRecord | null> {
    const result = await this.pool.query<{ reference: string; status: GiverTrackingRecord["orderStatus"]; paid_at: Date | null; packed_at: Date | null; collected_at: Date | null; delivered_at: Date | null }>(`
      SELECT o.reference, o.status, child.paid_at, child.packed_at, child.collected_at, child.delivered_at
      FROM giver_trackers tracker JOIN orders o ON o.id = tracker.order_id
      LEFT JOIN boxes child ON child.id = o.child_box_id
      WHERE tracker.token_hash = $1`, [hashOpaqueToken(token)]);
    const row = result.rows[0];
    return row ? { orderReference: row.reference, orderStatus: row.status, paidAt: row.paid_at, packedAt: row.packed_at, collectedAt: row.collected_at, deliveredAt: row.delivered_at } : null;
  }
}

export function postgresRecipientJourneyRepository(databaseUrl: string, passOnAmountKobo: number): PostgresRecipientJourneyRepository {
  if (!Number.isInteger(passOnAmountKobo) || passOnAmountKobo <= 0) throw new Error("PASS_ON_AMOUNT_KOBO must be a positive integer");
  return new PostgresRecipientJourneyRepository(new Pool({ connectionString: databaseUrl }), passOnAmountKobo);
}
