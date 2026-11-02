-- Web push notifications (SPEC section 4.10). Run once in Supabase → SQL Editor, after the
-- Telegram migration (its hourly job also sends the pushes). Safe to run again.

create table if not exists public.push_subscriptions (
  -- The push service address of one browser on one device.
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  time_zone text not null default 'UTC',
  language text not null default 'en' check (language in ('en', 'ru', 'es')),
  daily_summary boolean not null default true,
  review_reminder boolean not null default true,
  last_daily_sent date,
  last_review_sent date,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
