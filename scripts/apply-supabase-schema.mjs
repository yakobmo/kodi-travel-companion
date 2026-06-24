import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const root = process.cwd();
const schemaPath = path.join(root, "supabase", "schema.sql");
const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Missing SUPABASE_DB_URL or DATABASE_URL.");
  console.error("Set it locally before running this script. Do not commit it.");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  ssl: "require",
  max: 1,
  idle_timeout: 5,
  connect_timeout: 20
});

try {
  const schemaSql = await readFile(schemaPath, "utf8");
  await sql.unsafe(schemaSql);
  const rows = await sql`
    select to_regclass('public.demo_storage_states') as bridge_table
  `;

  if (rows[0]?.bridge_table !== "demo_storage_states") {
    throw new Error("Schema applied, but public.demo_storage_states was not found.");
  }

  console.log("Supabase schema applied successfully.");
  console.log("Verified table: public.demo_storage_states");
} finally {
  await sql.end({ timeout: 5 });
}
