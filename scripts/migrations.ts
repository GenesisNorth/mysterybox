import { readdir, readFile } from "node:fs/promises";
import { projectPath } from "../src/infrastructure/project-root.js";

export interface Migration { id: string; sql: string; }

/**
 * Migration 001 is db/schema.sql and must never be edited once applied.
 * Every later change is a new, numbered file in db/migrations (e.g. 004_add_x.sql), applied in name order.
 */
export async function loadMigrations(): Promise<Migration[]> {
  const directory = projectPath("db", "migrations");
  const files = (await readdir(directory)).filter((file) => /^\d{3}_[a-z0-9_]+\.sql$/.test(file)).sort();
  const migrations: Migration[] = [{ id: "001_initial_schema", sql: await readFile(projectPath("db", "schema.sql"), "utf8") }];
  for (const file of files) {
    const id = file.replace(/\.sql$/, "");
    if (id.startsWith("001_")) throw new Error(`${file}: 001 is reserved for db/schema.sql`);
    migrations.push({ id, sql: await readFile(projectPath("db", "migrations", file), "utf8") });
  }
  return migrations;
}
