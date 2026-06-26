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
    select
      to_regclass('public.trip_groups') as trip_groups_table,
      to_regclass('public.group_messages') as group_messages_table,
      to_regclass('public.live_locations') as live_locations_table,
      to_regclass('public.group_routes') as group_routes_table
  `;

  if (
    rows[0]?.trip_groups_table !== "trip_groups" ||
    rows[0]?.group_messages_table !== "group_messages" ||
    rows[0]?.live_locations_table !== "live_locations" ||
    rows[0]?.group_routes_table !== "group_routes"
  ) {
    throw new Error("Schema applied, but one or more relational runtime tables were not found.");
  }

  console.log("Supabase schema applied successfully.");
  console.log("Verified relational runtime tables.");
} finally {
  await sql.end({ timeout: 5 });
}
