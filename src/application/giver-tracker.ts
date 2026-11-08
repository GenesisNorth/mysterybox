export type TrackerStep = { label: "Payment confirmed" | "Box packed" | "Collected by courier" | "Delivered"; complete: boolean; current: boolean };
export interface GiverTrackingRecord {
  orderReference: string;
  orderStatus: "pending_payment" | "paid" | "cancelled" | "refunded";
  paidAt: Date | null;
  packedAt: Date | null;
  collectedAt: Date | null;
  deliveredAt: Date | null;
}
export interface GiverTrackerRepository { findByTrackerToken(token: string): Promise<GiverTrackingRecord | null>; }
export type GiverTrackerPage = { kind: "not-found" } | { kind: "tracker"; orderReference: string; steps: TrackerStep[]; complete: boolean };

export class GiverTracker {
  constructor(private readonly repository: GiverTrackerRepository) {}
  async getPage(token: string): Promise<GiverTrackerPage> {
    const record = await this.repository.findByTrackerToken(token);
    if (!record) return { kind: "not-found" };
    const timestamps = [record.paidAt, record.packedAt, record.collectedAt, record.deliveredAt];
    const labels: TrackerStep["label"][] = ["Payment confirmed", "Box packed", "Collected by courier", "Delivered"];
    const steps = labels.map((label, index) => ({ label, complete: timestamps[index] !== null, current: timestamps[index] === null && (index === 0 || timestamps[index - 1] !== null) }));
    return { kind: "tracker", orderReference: record.orderReference, steps, complete: record.deliveredAt !== null };
  }
}
