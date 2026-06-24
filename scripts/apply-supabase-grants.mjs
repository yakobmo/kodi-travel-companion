import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const root = process.cwd();
const grantsPath = path.join(root, "supabase", "service-role-grants.sql");
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
  const grantsSql = await readFile(grantsPath, "utf8");
  await sql.unsafe(grantsSql);
  const rows = await sql`
    select
      has_schema_privilege('service_role', 'public', 'USAGE') as schema_usage,
      has_table_privilege('service_role', 'public.demo_storage_states', 'SELECT') as can_select,
      has_table_privilege('service_role', 'public.demo_storage_states', 'INSERT') as can_insert,
      has_table_privilege('service_role', 'public.demo_storage_states', 'UPDATE') as can_update
  `;
  const result = rows[0];

  if (!result?.schema_usage || !result?.can_select || !result?.can_insert || !result?.can_update) {
    throw new Error("Service-role grants were applied but verification did not pass.");
  }

  console.log("Supabase service-role grants applied successfully.");
  console.log("Verified service_role privileges on public.demo_storage_states.");
} finally {
  await sql.end({ timeout: 5 });
}
