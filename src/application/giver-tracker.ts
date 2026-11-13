/**
 * The giver's private tracker: a road map of their box from order to delivery. It never shows anything about the
 * recipient after delivery, and nothing about the rest of the trail.
 */
export interface GiverTrackingRecord {
  orderReference: string;
  orderStatus: "pending_payment" | "paid" | "cancelled" | "refunded";
  /** True when this order started a new trail ("Start a gift box"), false when it passed a box on. */
  startedTrail: boolean;
  orderedAt: Date;
  paidAt: Date | null;
  packedAt: Date | null;
  collectedAt: Date | null;
  deliveredAt: Date | null;
}
export interface GiverTrackerRepository { findByTrackerToken(token: string): Promise<GiverTrackingRecord | null>; }

export type StageKey = "ordered" | "paid" | "packed" | "collected" | "delivered";
/** `stopped` marks where an order ended when it was cancelled or refunded. */
export type StageState = "done" | "current" | "upcoming" | "stopped";
export interface TrackerStage { key: StageKey; title: string; description: string; at: Date | null; state: StageState; }
export type GiverTrackerPage =
  | { kind: "not-found" }
  | {
    kind: "tracker"; orderReference: string; startedTrail: boolean; stages: TrackerStage[];
    /** How many stages are done, out of all of them. */
    progress: { done: number; total: number };
    complete: boolean; paymentConfirmed: boolean; stopped: "cancelled" | "refunded" | null;
  };

export class GiverTracker {
  constructor(private readonly repository: GiverTrackerRepository) {}

  async getPage(token: string): Promise<GiverTrackerPage> {
    const record = await this.repository.findByTrackerToken(token);
    if (!record) return { kind: "not-found" };
    const stopped = record.orderStatus === "cancelled" || record.orderStatus === "refunded" ? record.orderStatus : null;
    const plan: Omit<TrackerStage, "state">[] = [
      { key: "ordered", title: "Order placed", description: "Your note and delivery details are saved.", at: record.orderedAt },
      record.paidAt
        ? { key: "paid", title: "Payment confirmed", description: record.startedTrail ? "Your gift is confirmed and a new trail has begun." : "Your box has joined the trail.", at: record.paidAt }
        : { key: "paid", title: "Payment", description: "We are waiting for your payment to be confirmed.", at: null },
      { key: "packed", title: "Packed with care", description: "We packed the box with your note and its card.", at: record.packedAt },
      { key: "collected", title: "On the way", description: "A courier has the box and is taking it to them.", at: record.collectedAt },
      { key: "delivered", title: "Delivered", description: "It is in their hands. What happens next is their story.", at: record.deliveredAt }
    ];
    const firstOpen = plan.findIndex((stage) => stage.at === null);
    const stages = plan.map((stage, index): TrackerStage => ({
      ...stage,
      state: stage.at !== null ? "done" : index === firstOpen ? (stopped ? "stopped" : "current") : "upcoming"
    }));
    const done = stages.filter((stage) => stage.state === "done").length;
    return {
      kind: "tracker", orderReference: record.orderReference, startedTrail: record.startedTrail, stages,
      progress: { done, total: stages.length }, complete: record.deliveredAt !== null, paymentConfirmed: record.paidAt !== null, stopped
    };
  }
}
