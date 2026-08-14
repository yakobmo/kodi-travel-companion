create table if not exists public.trip_member_contacts (
  member_id uuid primary key references public.trip_members(id) on delete cascade,
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  phone_e164 text not null,
  whatsapp_wa_id text,
  phone_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_group_id, phone_e164),
  unique (trip_group_id, whatsapp_wa_id)
);

create table if not exists public.whatsapp_message_receipts (
  provider_message_id text primary key,
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  sender_wa_id text not null,
  received_at timestamptz not null default now()
);

create index if not exists trip_member_contacts_phone_idx
  on public.trip_member_contacts(trip_group_id, phone_e164);
create index if not exists whatsapp_message_receipts_received_idx
  on public.whatsapp_message_receipts(received_at desc);

alter table public.trip_member_contacts enable row level security;
alter table public.whatsapp_message_receipts enable row level security;

grant select, insert, update, delete on table public.trip_member_contacts to service_role;
grant select, insert, update, delete on table public.whatsapp_message_receipts to service_role;
