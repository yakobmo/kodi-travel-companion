import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const grantsSqlPath = fileURLToPath(new URL("../../../../supabase/service-role-grants.sql", import.meta.url));
const relationalRouteMigrationSqlPath = fileURLToPath(
  new URL("../../../../supabase/relational-route-migration.sql", import.meta.url)
);
const setupStateMigrationSqlPath = fileURLToPath(new URL("../../../../supabase/setup-state-migration.sql", import.meta.url));
const eventLogMigrationSqlPath = fileURLToPath(new URL("../../../../supabase/event-log-migration.sql", import.meta.url));

export interface SupabaseGrantApplyResult {
  configured: boolean;
  authorized: boolean;
  applied: boolean;
  verified: boolean;
  checkedAt: string;
  error?: string;
}

export interface SupabaseMigrationApplyResult extends SupabaseGrantApplyResult {
  migration: "relational_routes" | "setup_state" | "event_log";
}

export function isValidMigrationAdminToken(input: string | undefined) {
  return Boolean(process.env.MIGRATION_ADMIN_TOKEN && input && input === process.env.MIGRATION_ADMIN_TOKEN);
}

function getDatabaseUrl() {
  return process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
}

export async function applySupabaseServiceRoleGrants(): Promise<SupabaseGrantApplyResult> {
  const checkedAt = new Date().toISOString();
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return {
      configured: false,
      authorized: true,
      applied: false,
      verified: false,
      checkedAt,
      error: "missing_SUPABASE_DB_URL_or_DATABASE_URL"
    };
  }

  const sql = postgres(databaseUrl, {
    ssl: "require",
    max: 1,
    idle_timeout: 5,
    connect_timeout: 20
  });

  try {
    await sql.unsafe(await readFile(grantsSqlPath, "utf8"));
    const rows = await sql`
      select
        has_schema_privilege('service_role', 'public', 'USAGE') as schema_usage,
        has_table_privilege('service_role', 'public.trip_groups', 'SELECT') as can_select_groups,
        has_table_privilege('service_role', 'public.group_messages', 'INSERT') as can_insert_messages,
        has_table_privilege('service_role', 'public.live_locations', 'UPDATE') as can_update_locations,
        has_table_privilege('service_role', 'public.group_routes', 'UPDATE') as can_update_routes
    `;
    const verification = rows[0];
    const verified = Boolean(
      verification?.schema_usage &&
        verification?.can_select_groups &&
        verification?.can_insert_messages &&
        verification?.can_update_locations &&
        verification?.can_update_routes
    );

    return {
      configured: true,
      authorized: true,
      applied: true,
      verified,
      checkedAt,
      error: verified ? undefined : "service_role_grant_verification_failed"
    };
  } catch (error) {
    return {
      configured: true,
      authorized: true,
      applied: false,
      verified: false,
      checkedAt,
      error: error instanceof Error ? error.message : "unknown_grant_apply_error"
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function applySupabaseRelationalRouteMigration(): Promise<SupabaseMigrationApplyResult> {
  const checkedAt = new Date().toISOString();
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return {
      migration: "relational_routes",
      configured: false,
      authorized: true,
      applied: false,
      verified: false,
      checkedAt,
      error: "missing_SUPABASE_DB_URL_or_DATABASE_URL"
    };
  }

  const sql = postgres(databaseUrl, {
    ssl: "require",
    max: 1,
    idle_timeout: 5,
    connect_timeout: 20
  });

  try {
    await sql.unsafe(await readFile(relationalRouteMigrationSqlPath, "utf8"));
    const rows = await sql`
      select to_regclass('public.trip_places_trip_group_source_place_idx') as source_place_idx
    `;
    const verified = rows[0]?.source_place_idx === "trip_places_trip_group_source_place_idx";

    return {
      migration: "relational_routes",
      configured: true,
      authorized: true,
      applied: true,
      verified,
      checkedAt,
      error: verified ? undefined : "relational_route_migration_verification_failed"
    };
  } catch (error) {
    return {
      migration: "relational_routes",
      configured: true,
      authorized: true,
      applied: false,
      verified: false,
      checkedAt,
      error: error instanceof Error ? error.message : "unknown_relational_route_migration_error"
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function applySupabaseSetupStateMigration(): Promise<SupabaseMigrationApplyResult> {
  const checkedAt = new Date().toISOString();
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return {
      migration: "setup_state",
      configured: false,
      authorized: true,
      applied: false,
      verified: false,
      checkedAt,
      error: "missing_SUPABASE_DB_URL_or_DATABASE_URL"
    };
  }

  const sql = postgres(databaseUrl, {
    ssl: "require",
    max: 1,
    idle_timeout: 5,
    connect_timeout: 20
  });

  try {
    await sql.unsafe(await readFile(setupStateMigrationSqlPath, "utf8"));
    const rows = await sql`
      select
        to_regclass('public.trip_groups') as trip_groups_table,
        exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'trip_groups'
            and column_name = 'setup_saved_at'
        ) as has_setup_saved_at
    `;
    const verified = rows[0]?.trip_groups_table === "trip_groups" && Boolean(rows[0]?.has_setup_saved_at);

    return {
      migration: "setup_state",
      configured: true,
      authorized: true,
      applied: true,
      verified,
      checkedAt,
      error: verified ? undefined : "setup_state_migration_verification_failed"
    };
  } catch (error) {
    return {
      migration: "setup_state",
      configured: true,
      authorized: true,
      applied: false,
      verified: false,
      checkedAt,
      error: error instanceof Error ? error.message : "unknown_setup_state_migration_error"
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export async function applySupabaseEventLogMigration(): Promise<SupabaseMigrationApplyResult> {
  const checkedAt = new Date().toISOString();
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return {
      migration: "event_log",
      configured: false,
      authorized: true,
      applied: false,
      verified: false,
      checkedAt,
      error: "missing_SUPABASE_DB_URL_or_DATABASE_URL"
    };
  }

  const sql = postgres(databaseUrl, {
    ssl: "require",
    max: 1,
    idle_timeout: 5,
    connect_timeout: 20
  });

  try {
    await sql.unsafe(await readFile(eventLogMigrationSqlPath, "utf8"));
    const rows = await sql`
      select
        to_regclass('public.group_events') as group_events_table,
        exists (
          select 1
          from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = 'group_events'
        ) as group_events_realtime
    `;
    const verified = rows[0]?.group_events_table === "group_events" && Boolean(rows[0]?.group_events_realtime);

    return {
      migration: "event_log",
      configured: true,
      authorized: true,
      applied: true,
      verified,
      checkedAt,
      error: verified ? undefined : "event_log_migration_verification_failed"
    };
  } catch (error) {
    return {
      migration: "event_log",
      configured: true,
      authorized: true,
      applied: false,
      verified: false,
      checkedAt,
      error: error instanceof Error ? error.message : "unknown_event_log_migration_error"
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
