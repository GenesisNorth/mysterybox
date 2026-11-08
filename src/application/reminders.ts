import type { ReminderKind } from "./staff-operations.js";

export interface DeliverableReminder { id: string; kind: ReminderKind; email: string; }
export interface ReminderDeliveryStore {
  claimNext(): Promise<DeliverableReminder | null>;
  markSent(id: string): Promise<void>;
  markFailed(id: string): Promise<void>;
}
export interface ReminderGateway { send(input: DeliverableReminder): Promise<void>; }

/** A worker calls this once per invocation; providers remain outside the domain. */
export class ReminderDispatcher {
  constructor(private readonly store: ReminderDeliveryStore, private readonly gateway: ReminderGateway) {}
  async dispatchOne(): Promise<boolean> {
    const reminder = await this.store.claimNext();
    if (!reminder) return false;
    try { await this.gateway.send(reminder); await this.store.markSent(reminder.id); return true; }
    catch { await this.store.markFailed(reminder.id); throw new Error("Reminder delivery failed"); }
  }
}
