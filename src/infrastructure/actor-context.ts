import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

/**
 * Who is acting in the current request or job: a staff email, "public", "paystack-webhook", or a worker name.
 * The database audit trigger reads it from the transaction-local `app.actor` setting.
 */
const storage = new AsyncLocalStorage<{ actor: string }>();

export function runWithActor<T>(actor: string, work: () => T): T { return storage.run({ actor }, work); }
/** Narrows the actor once a request has authenticated (e.g. "public" → a staff email). */
export function setActor(actor: string): void { const store = storage.getStore(); if (store) store.actor = actor; }
export function currentActor(): string | undefined { return storage.getStore()?.actor; }

const writes = /\b(INSERT|UPDATE|DELETE)\b/i;
const setActorSql = "SELECT set_config('app.actor', $1, true)";

/**
 * A pg Pool wrapper that attributes every write to the current actor.
 * - A standalone write runs in its own short transaction with `app.actor` set.
 * - A client from `connect()` sets `app.actor` right after its `BEGIN`.
 * `set_config(..., true)` is transaction-local, so the value can never leak to another request on a pooled connection.
 */
export class ActorAwarePool {
  constructor(private readonly pool: Pool) {}

  async query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>> {
    const actor = currentActor();
    if (!actor || !writes.test(text)) return this.pool.query<R>(text, values);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(setActorSql, [actor]);
      const result = await client.query<R>(text, values);
      await client.query("COMMIT");
      return result;
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  }

  async connect(): Promise<PoolClient> {
    const client = await this.pool.connect();
    const actor = currentActor();
    if (!actor) return client;
    const query = client.query.bind(client) as (...args: unknown[]) => Promise<unknown>;
    return new Proxy(client, {
      get(target, property) {
        if (property === "query") {
          return async (...args: unknown[]) => {
            const result = await query(...args);
            if (typeof args[0] === "string" && /^\s*BEGIN\b/i.test(args[0])) await query(setActorSql, [actor]);
            return result;
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
  }

  end(): Promise<void> { return this.pool.end(); }
}
