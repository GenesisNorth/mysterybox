import type { FulfilmentStatus } from "../domain/box.js";

/** Aggregate numbers for the staff dashboard. Never contains names, contacts or addresses. */
export interface DashboardAnalytics {
  generatedAt: Date;
  totals: {
    boxes: number; trails: number; activeTrails: number; delivered: number; passedOn: number;
    revenueKobo: number; longestTrail: number; medianFulfilmentHours: number | null;
  };
  pipeline: Record<FulfilmentStatus, number>;
  /** Delivered boxes, then how far their recipients got. Each step is a subset of the one before. */
  journey: { delivered: number; opened: number; received: number; decided: number; passedOn: number };
  /** The last 12 weeks, oldest first; weeks start on Monday (Lagos time). */
  weekly: { weekStart: Date; created: number; delivered: number }[];
  /** Boxes per generation: 1 = starter boxes. */
  generations: { generation: number; boxes: number }[];
  attention: { overdueToPack: number; openHelp: number; oldestHelpAt: Date | null; cardsInStock: number; remindersDue: number };
  recentActivity: { actor: string; action: string; boxNumber: string | null; occurredAt: Date }[];
}

export interface AnalyticsRepository { dashboardAnalytics(): Promise<DashboardAnalytics>; }

export const emptyPipeline = (): Record<FulfilmentStatus, number> => ({ created: 0, paid: 0, packed: 0, collected: 0, delivered: 0, cancelled: 0, refunded: 0 });
