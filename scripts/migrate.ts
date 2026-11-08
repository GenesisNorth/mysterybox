import { Pool } from "pg";
import { loadMigrations } from "./migrations.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to run migrations");

const pool = new Pool({ connectionString: databaseUrl });
const migrations = await loadMigrations();

try {
  const client = await pool.connect();
  try {
    // Serialize concurrent deploys; the lock is released when the session ends.
    await client.query(`SELECT pg_advisory_lock(hashtext('gratitude_stories_migrations'))`);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    for (const migration of migrations) {
      try {
        await client.query("BEGIN");
        const applied = await client.query(`SELECT 1 FROM schema_migrations WHERE id = $1`, [migration.id]);
        if (applied.rowCount === 0) {
          await client.query(migration.sql);
          await client.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [migration.id]);
          console.log(`Applied ${migration.id}`);
        } else console.log(`${migration.id} already applied`);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }
  } finally { client.release(); }
} finally { await pool.end(); }
