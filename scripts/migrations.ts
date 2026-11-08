import { readdir, readFile } from "node:fs/promises";

export interface Migration { id: string; sql: string; }

/**
 * Migration 001 is db/schema.sql and must never be edited once applied.
 * Every later change is a new, numbered file in db/migrations (e.g. 004_add_x.sql), applied in name order.
 */
export async function loadMigrations(): Promise<Migration[]> {
  const directory = new URL("../db/migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((file) => /^\d{3}_[a-z0-9_]+\.sql$/.test(file)).sort();
  const migrations: Migration[] = [{ id: "001_initial_schema", sql: await readFile(new URL("../db/schema.sql", import.meta.url), "utf8") }];
  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    if (id.startsWith("001_")) throw new Error(`${file}: 001 is reserved for db/schema.sql`);
    migrations.push({ id, sql: await readFile(new URL(file, directory), "utf8") });
  }
  return migrations;
}
