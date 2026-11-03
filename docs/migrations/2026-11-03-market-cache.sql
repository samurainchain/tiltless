-- Shared cache for public market data (the economic calendar feed). Run once in Supabase → SQL
-- Editor. Safe to run again.

create table if not exists public.market_cache (
  key text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.market_cache enable row level security;
