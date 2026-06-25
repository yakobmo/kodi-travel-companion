import { DEMO_TRIP_GROUP_UUID, demoRelationalMembers } from "./demoRelationalIds.js";
import { createSupabaseServerClient } from "./supabaseClient.js";

export async function ensureDemoRelationalBase() {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return null;
  }

  const now = new Date().toISOString();
  const { error: groupError } = await supabase
    .from("trip_groups")
    .upsert(
      {
        id: DEMO_TRIP_GROUP_UUID,
        name: "צפון יוון",
        google_source_url: "https://maps.app.goo.gl/MspoN6j9CJDyGmtb8",
        google_source_state: "demo_link_ready",
        updated_at: now
      },
      { onConflict: "id", ignoreDuplicates: true }
    );

  if (groupError) {
    throw new Error(`Supabase demo trip group seed failed: ${groupError.message}`);
  }

  const { error: membersError } = await supabase.from("trip_members").upsert(
    demoRelationalMembers.map((member) => ({
      id: member.uuid,
      trip_group_id: DEMO_TRIP_GROUP_UUID,
      display_name: member.displayName,
      role: member.role,
      can_chat_with_agent: member.canChatWithAgent,
      can_mark_visited: member.canMarkVisited,
      can_manage_places: member.canManagePlaces,
      can_manage_members: member.canManageMembers,
      updated_at: now
    }))
  );

  if (membersError) {
    throw new Error(`Supabase demo members seed failed: ${membersError.message}`);
  }

  return supabase;
}
