import { Pool } from "pg";
import { loadMigrations } from "./migrations.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to inspect migration status");
const pool = new Pool({ connectionString: databaseUrl });
try {
  const result = await pool.query<{ id: string; applied_at: Date }>(`SELECT id, applied_at FROM schema_migrations ORDER BY id ASC`);
  const applied = new Set(result.rows.map((row) => row.id));
  const pending = (await loadMigrations()).map((migration) => migration.id).filter((id) => !applied.has(id));
  console.log(JSON.stringify({ migrations: result.rows, pending }, null, 2));
} finally { await pool.end(); }
