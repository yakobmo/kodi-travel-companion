import { getActiveDemoStorageDriverName } from "./demoStorage.js";
import { DEMO_GROUP_ID, DEMO_TRIP_GROUP_UUID, demoMemberUuidById } from "./demoRelationalIds.js";
import { ensureDemoRelationalBase } from "./demoRelationalSeed.js";

export type PushSubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

export type StoredPushSubscription = {
  id?: string;
  tripGroupId: string;
  memberId: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: string;
  lastSeenAt: string;
};

const demoPushSubscriptions = new Map<string, StoredPushSubscription>();

type PushSubscriptionRow = {
  id: string;
  trip_group_id: string;
  member_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
};

function mapMemberUuidToDemoId(memberUuid: string) {
  return Object.entries(demoMemberUuidById).find(([, uuid]) => uuid === memberUuid)?.[0] ?? memberUuid;
}

function mapPushSubscriptionRow(row: PushSubscriptionRow): StoredPushSubscription {
  return {
    id: row.id,
    tripGroupId: DEMO_GROUP_ID,
    memberId: mapMemberUuidToDemoId(row.member_id),
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth
    },
    userAgent: row.user_agent ?? undefined,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  };
}

export async function countDemoPushSubscriptionsAsync() {
  if (getActiveDemoStorageDriverName() === "supabase") {
    const supabase = await ensureDemoRelationalBase();
    if (supabase) {
      const { count, error } = await supabase
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("trip_group_id", DEMO_TRIP_GROUP_UUID)
        .is("revoked_at", null);

      if (error) {
        throw new Error(`Supabase push subscription count failed: ${error.message}`);
      }

      return count ?? 0;
    }
  }

  return demoPushSubscriptions.size;
}

export async function saveDemoPushSubscriptionAsync(input: {
  memberId: string;
  subscription: PushSubscriptionPayload;
  userAgent?: string;
}) {
  const now = new Date().toISOString();

  if (getActiveDemoStorageDriverName() === "supabase") {
    const supabase = await ensureDemoRelationalBase();
    const memberUuid = demoMemberUuidById[input.memberId];
    if (supabase && memberUuid) {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            trip_group_id: DEMO_TRIP_GROUP_UUID,
            member_id: memberUuid,
            endpoint: input.subscription.endpoint,
            p256dh: input.subscription.keys.p256dh,
            auth: input.subscription.keys.auth,
            user_agent: input.userAgent ?? null,
            last_seen_at: now,
            revoked_at: null
          },
          { onConflict: "endpoint" }
        )
        .select("id, trip_group_id, member_id, endpoint, p256dh, auth, user_agent, created_at, last_seen_at")
        .single();

      if (error) {
        throw new Error(`Supabase push subscription save failed: ${error.message}`);
      }

      const { error: preferenceError } = await supabase.from("notification_preferences").upsert(
        {
          trip_group_id: DEMO_TRIP_GROUP_UUID,
          member_id: memberUuid,
          chat_messages_enabled: true,
          updated_at: now
        },
        { onConflict: "trip_group_id,member_id" }
      );

      if (preferenceError) {
        throw new Error(`Supabase notification preference save failed: ${preferenceError.message}`);
      }

      return mapPushSubscriptionRow(data as PushSubscriptionRow);
    }
  }

  const previous = demoPushSubscriptions.get(input.subscription.endpoint);
  const nextSubscription: StoredPushSubscription = {
    tripGroupId: DEMO_GROUP_ID,
    memberId: input.memberId,
    endpoint: input.subscription.endpoint,
    keys: {
      p256dh: input.subscription.keys.p256dh,
      auth: input.subscription.keys.auth
    },
    userAgent: input.userAgent,
    createdAt: previous?.createdAt ?? now,
    lastSeenAt: now
  };
  demoPushSubscriptions.set(input.subscription.endpoint, nextSubscription);
  return structuredClone(nextSubscription);
}

export async function loadDemoPushSubscriptionsForMessageAsync(senderMemberId?: string) {
  if (getActiveDemoStorageDriverName() === "supabase") {
    const supabase = await ensureDemoRelationalBase();
    if (supabase) {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id, trip_group_id, member_id, endpoint, p256dh, auth, user_agent, created_at, last_seen_at")
        .eq("trip_group_id", DEMO_TRIP_GROUP_UUID)
        .is("revoked_at", null);

      if (error) {
        throw new Error(`Supabase push subscription load failed: ${error.message}`);
      }

      return (data ?? [])
        .map((row) => mapPushSubscriptionRow(row as PushSubscriptionRow))
        .filter((subscription) => subscription.memberId !== senderMemberId);
    }
  }

  return Array.from(demoPushSubscriptions.values())
    .filter((subscription) => subscription.memberId !== senderMemberId)
    .map((subscription) => structuredClone(subscription));
}

export async function revokeDemoPushSubscriptionAsync(endpoint: string) {
  if (getActiveDemoStorageDriverName() === "supabase") {
    const supabase = await ensureDemoRelationalBase();
    if (supabase) {
      const { error } = await supabase
        .from("push_subscriptions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("endpoint", endpoint);

      if (error) {
        throw new Error(`Supabase push subscription revoke failed: ${error.message}`);
      }
    }
  }

  demoPushSubscriptions.delete(endpoint);
}

export async function recordDemoNotificationDeliveryAsync(input: {
  messageId?: string;
  recipientMemberId: string;
  subscriptionId?: string;
  status: "sent" | "failed" | "revoked" | "skipped";
  providerError?: string;
}) {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return;
  }

  const supabase = await ensureDemoRelationalBase();
  const recipientMemberUuid = demoMemberUuidById[input.recipientMemberId];
  if (!supabase || !recipientMemberUuid) {
    return;
  }

  const { error } = await supabase.from("notification_deliveries").insert({
    trip_group_id: DEMO_TRIP_GROUP_UUID,
    message_id: input.messageId,
    recipient_member_id: recipientMemberUuid,
    subscription_id: input.subscriptionId ?? null,
    status: input.status,
    provider_error: input.providerError ?? null,
    sent_at: input.status === "sent" ? new Date().toISOString() : null
  });

  if (error) {
    throw new Error(`Supabase notification delivery record failed: ${error.message}`);
  }
}
