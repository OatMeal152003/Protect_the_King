-- Protect the King — Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).

-- Rooms
create table if not exists public.rooms (
  code text primary key,
  created_at timestamptz not null default now(),
  white_present boolean not null default false,
  black_present boolean not null default false
);

-- Moves (one row per move, ordered by id)
create table if not exists public.moves (
  id bigserial primary key,
  room_code text not null references public.rooms(code) on delete cascade,
  from_sq text not null,
  to_sq text not null,
  promotion text,
  fen text not null,
  white_ms integer not null default 0,
  black_ms integer not null default 0,
  move_uid text,
  created_at timestamptz not null default now()
);

-- RLS: anonymous play, room code acts as the secret
alter table public.rooms enable row level security;
alter table public.moves enable row level security;

create policy "rooms read"   on public.rooms for select using (true);
create policy "rooms insert" on public.rooms for insert with check (true);
create policy "rooms update" on public.rooms for update using (true);

create policy "moves read"   on public.moves for select using (true);
create policy "moves insert" on public.moves for insert with check (true);

-- Realtime replication
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.moves;
