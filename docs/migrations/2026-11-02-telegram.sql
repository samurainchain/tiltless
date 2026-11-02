-- Telegram bot (SPEC section 4.10). Run once in Supabase → SQL Editor, after:
--   1. Database → Extensions: turn on pg_cron and pg_net.
--   2. Edge Functions → Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET,
--      TELEGRAM_CRON_SECRET (see docs/telegram.md).
-- Replace PASTE_TELEGRAM_CRON_SECRET below with the same value as the TELEGRAM_CRON_SECRET secret.

create table if not exists public.telegram_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  chat_id bigint unique,
  link_code text unique,
  link_code_expires_at timestamptz,
  time_zone text not null default 'UTC',
  language text not null default 'en' check (language in ('en', 'ru', 'es')),
  daily_summary boolean not null default true,
  limit_alerts boolean not null default true,
  review_reminder boolean not null default true,
  last_daily_sent date,
  last_review_sent date,
  last_limit_sent date,
  linked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.telegram_links enable row level security;

-- The job's key lives in the vault, not in the job's text.
select vault.create_secret('PASTE_TELEGRAM_CRON_SECRET', 'telegram_cron_secret');

-- Every hour at :05, ask telegram-digest to send whatever summaries are due.
select cron.schedule(
  'telegram-digest',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://vmjyzwrrueoyxcuzpeil.supabase.co/functions/v1/telegram-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'telegram_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
