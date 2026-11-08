import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { ActorAwarePool, currentActor, runWithActor, setActor } from "./actor-context.js";

function fakePool() {
  const log: string[] = []; let released = 0;
  const client = { query: async (text: string, values?: unknown[]) => { log.push(values ? `${text} ${JSON.stringify(values)}` : text); return { rows: [], rowCount: 1 }; }, release: () => { released++; } };
  const pool = { query: async (text: string) => { log.push(`pool: ${text}`); return { rows: [], rowCount: 0 }; }, connect: async () => client, end: async () => undefined };
  return { pool: new ActorAwarePool(pool as unknown as Pool), log, released: () => released };
}

test("standalone writes run in a transaction that names the actor; reads and actorless work are untouched", async () => {
  const { pool, log, released } = fakePool();
  await pool.query("SELECT 1");
  await pool.query("UPDATE boxes SET x = 1");
  await runWithActor("ops@example.com", async () => { await pool.query("SELECT box_number FROM boxes"); await pool.query("UPDATE boxes SET x = $1", [2]); });
  assert.deepEqual(log, [
    "pool: SELECT 1", "pool: UPDATE boxes SET x = 1", "pool: SELECT box_number FROM boxes",
    "BEGIN", `SELECT set_config('app.actor', $1, true) ["ops@example.com"]`, "UPDATE boxes SET x = $1 [2]", "COMMIT"
  ]);
  assert.equal(released(), 1);
});

test("explicit transactions get the actor straight after BEGIN", async () => {
  const { pool, log } = fakePool();
  await runWithActor("public", async () => {
    setActor("admin@example.com");
    const client = await pool.connect();
    await client.query("BEGIN"); await client.query("INSERT INTO trails (code) VALUES ($1)", ["T"]); await client.query("COMMIT"); client.release();
  });
  assert.deepEqual(log, ["BEGIN", `SELECT set_config('app.actor', $1, true) ["admin@example.com"]`, `INSERT INTO trails (code) VALUES ($1) ["T"]`, "COMMIT"]);
});

test("each request keeps its own actor even when interleaved", async () => {
  const seen: string[] = [];
  await Promise.all(["a@example.com", "b@example.com"].map((actor) => runWithActor("public", async () => {
    setActor(actor); await new Promise((resolve) => setTimeout(resolve, actor.startsWith("a") ? 10 : 1)); seen.push(`${actor}=${currentActor()}`);
  })));
  assert.deepEqual(seen.sort(), ["a@example.com=a@example.com", "b@example.com=b@example.com"]);
  assert.equal(currentActor(), undefined);
});
