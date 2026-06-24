import { createClient } from "@supabase/supabase-js";

export interface SupabaseRuntimeStatus {
  configured: boolean;
  urlPresent: boolean;
  serviceRoleKeyPresent: boolean;
  keyRole?: string;
  reachable: boolean;
  bridgeTableReady: boolean;
  checkedAt: string;
  error?: string;
}

function getSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

function decodeJwtPayload(token: string) {
  const [, payload] = token.split(".");
  if (!payload) {
    return null;
  }

  try {
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(paddedPayload, "base64").toString("utf8")) as { role?: unknown };
  } catch {
    return null;
  }
}

export async function checkSupabaseRuntime(): Promise<SupabaseRuntimeStatus> {
  const checkedAt = new Date().toISOString();
  const { url, serviceRoleKey } = getSupabaseConfig();
  const urlPresent = Boolean(url);
  const serviceRoleKeyPresent = Boolean(serviceRoleKey);
  const keyRole = serviceRoleKey ? String(decodeJwtPayload(serviceRoleKey)?.role ?? "unknown") : undefined;

  if (!url || !serviceRoleKey) {
    return {
      configured: false,
      urlPresent,
      serviceRoleKeyPresent,
      keyRole,
      reachable: false,
      bridgeTableReady: false,
      checkedAt
    };
  }

  try {
    const supabase = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    const { error } = await supabase.from("demo_storage_states").select("storage_key", { count: "exact", head: true });

    if (error) {
      return {
        configured: true,
        urlPresent,
        serviceRoleKeyPresent,
        keyRole,
        reachable: true,
        bridgeTableReady: false,
        checkedAt,
        error: error.message
      };
    }

    return {
      configured: true,
      urlPresent,
      serviceRoleKeyPresent,
      keyRole,
      reachable: true,
      bridgeTableReady: true,
      checkedAt
    };
  } catch (error) {
    return {
      configured: true,
      urlPresent,
      serviceRoleKeyPresent,
      keyRole,
      reachable: false,
      bridgeTableReady: false,
      checkedAt,
      error: error instanceof Error ? error.message : "unknown_supabase_runtime_error"
    };
  }
}
