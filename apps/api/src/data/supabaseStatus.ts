import { createClient } from "@supabase/supabase-js";

export interface SupabaseRuntimeStatus {
  configured: boolean;
  urlPresent: boolean;
  serviceRoleKeyPresent: boolean;
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

export async function checkSupabaseRuntime(): Promise<SupabaseRuntimeStatus> {
  const checkedAt = new Date().toISOString();
  const { url, serviceRoleKey } = getSupabaseConfig();
  const urlPresent = Boolean(url);
  const serviceRoleKeyPresent = Boolean(serviceRoleKey);

  if (!url || !serviceRoleKey) {
    return {
      configured: false,
      urlPresent,
      serviceRoleKeyPresent,
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
      reachable: true,
      bridgeTableReady: true,
      checkedAt
    };
  } catch (error) {
    return {
      configured: true,
      urlPresent,
      serviceRoleKeyPresent,
      reachable: false,
      bridgeTableReady: false,
      checkedAt,
      error: error instanceof Error ? error.message : "unknown_supabase_runtime_error"
    };
  }
}
