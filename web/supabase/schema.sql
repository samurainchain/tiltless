-- Mirror cloud sync: one row per journal record, private to its owner.
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run. Safe to run again
-- after updates: every statement either creates what's missing or replaces it.

create table if not exists public.journal_records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  -- When the record changed on the device that changed it; decides conflicts.
  updated_at timestamptz not null,
  -- When the server stored this version; lets devices pull only what's new.
  server_updated_at timestamptz not null default now(),
  primary key (user_id, collection, id)
);

-- Kinds of records the app syncs. Re-created on every run, so it also updates older setups.
alter table public.journal_records drop constraint if exists journal_records_collection_check;
alter table public.journal_records add constraint journal_records_collection_check
  check (collection in ('accounts', 'trades', 'mistakes', 'setups', 'rules', 'reviews', 'checkins', 'images', 'profile'));

create index if not exists journal_records_pull on public.journal_records (user_id, server_updated_at);

-- Each user sees and changes only their own rows.
alter table public.journal_records enable row level security;

drop policy if exists "Users manage their own journal" on public.journal_records;
create policy "Users manage their own journal" on public.journal_records
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Saves a batch of changes, keeping whichever version of each record is newer.
create or replace function public.push_journal_records(records jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.journal_records as existing (user_id, collection, id, data, deleted, updated_at, server_updated_at)
  select auth.uid(), r.collection, r.id, r.data, r.deleted, r.updated_at, now()
  from jsonb_to_recordset(records) as r(collection text, id text, data jsonb, deleted boolean, updated_at timestamptz)
  on conflict (user_id, collection, id) do update
    set data = excluded.data,
        deleted = excluded.deleted,
        updated_at = excluded.updated_at,
        server_updated_at = now()
    where existing.updated_at < excluded.updated_at;
$$;

revoke all on function public.push_journal_records(jsonb) from public, anon;
grant execute on function public.push_journal_records(jsonb) to authenticated;

-- Trade screenshots: a private bucket, files under "<user id>/<image id>.jpg".
insert into storage.buckets (id, name, public)
values ('trade-images', 'trade-images', false)
on conflict (id) do nothing;

drop policy if exists "Users manage their own screenshots" on storage.objects;
create policy "Users manage their own screenshots" on storage.objects
  for all to authenticated
  using (bucket_id = 'trade-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'trade-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Billing: one row per user with their Stripe customer and subscription status. Written only by
-- the billing functions (service role); each user can read their own row to see Pro.
create table if not exists public.billing_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  status text not null default 'none',
  plan text,
  price_id text,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  event_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists billing_subscriptions_customer on public.billing_subscriptions (stripe_customer_id);

alter table public.billing_subscriptions enable row level security;

drop policy if exists "Users read their own subscription" on public.billing_subscriptions;
create policy "Users read their own subscription"
  on public.billing_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

-- Feedback from the app (ideas, problems). Anyone can send a message, signed in or not; nobody
-- can read the table through the API, only the owner in the dashboard (Table Editor → feedback).
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  kind text not null default 'idea' check (kind in ('idea', 'problem', 'other')),
  message text not null check (char_length(message) between 1 and 4000),
  email text check (email is null or char_length(email) <= 320),
  locale text check (locale is null or char_length(locale) <= 10),
  page text check (page is null or char_length(page) <= 64)
);

alter table public.feedback enable row level security;

grant insert on public.feedback to anon, authenticated;

drop policy if exists "Anyone can send feedback" on public.feedback;
create policy "Anyone can send feedback"
  on public.feedback for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- Crypto payments (NOWPayments): one row per invoice. Written only by the crypto functions
-- (service role); no policies, so the API can't read or change orders.
create table if not exists public.crypto_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('monthly', 'annual')),
  price_amount numeric(12, 2) not null check (price_amount > 0),
  price_currency text not null default 'usd',
  invoice_id text,
  payment_id text,
  status text not null default 'created',
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crypto_orders_user on public.crypto_orders (user_id);

alter table public.crypto_orders enable row level security;

-- Pro bought as a pass: until when it lasts. Each user reads their own row.
create table if not exists public.pro_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  pro_until timestamptz not null,
  source text not null default 'crypto',
  updated_at timestamptz not null default now()
);

alter table public.pro_access enable row level security;

drop policy if exists "Users read their own Pro access" on public.pro_access;
create policy "Users read their own Pro access"
  on public.pro_access for select to authenticated
  using ((select auth.uid()) = user_id);

-- Pro trial (SPEC section 8): every new account gets 7 days of Pro from sign-up; accounts made
-- through November 30, 2026 (before noon UTC on December 1) get 30 days, the launch offer
-- (LAUNCH_OFFER_ENDS in src/core/entitlements.ts). A purchase during the trial adds its month or
-- year on top of the trial's end.
create or replace function public.start_pro_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pro_access (user_id, pro_until, source)
    values (new.id, now() + case when now() < timestamptz '2026-12-01 12:00:00+00' then interval '30 days' else interval '7 days' end, 'trial')
    on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.start_pro_trial() from public, anon, authenticated;

drop trigger if exists start_pro_trial on auth.users;
create trigger start_pro_trial
  after insert on auth.users
  for each row execute function public.start_pro_trial();

-- Applies a paid order once: marks it applied and adds its month or year to the user's Pro,
-- counting from the current end when Pro is still running, and credits the referring partner.
-- Returns the new end, or null when the order was already applied. Only the service role may call it.
create or replace function public.apply_crypto_order(p_order uuid, p_payment text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  paid public.crypto_orders;
  period interval;
  until timestamptz;
  partner uuid;
  first_paid timestamptz;
begin
  update public.crypto_orders
    set applied_at = now(), status = 'paid', payment_id = p_payment, updated_at = now()
    where id = p_order and applied_at is null
    returning * into paid;
  if not found then
    return null;
  end if;
  period := case when paid.plan = 'annual' then interval '1 year' else interval '1 month' end;
  insert into public.pro_access (user_id, pro_until, source)
    values (paid.user_id, now() + period, 'crypto')
    on conflict (user_id) do update
      set pro_until = greatest(public.pro_access.pro_until, now()) + period, source = 'crypto', updated_at = now()
    returning pro_until into until;
  -- Partner program: 30% of payments in the 12 months from the trader's first one, payable after 14 days.
  select r.partner_user_id into partner from public.referrals r where r.referred_user_id = paid.user_id;
  if partner is not null then
    select min(applied_at) into first_paid from public.crypto_orders where user_id = paid.user_id and applied_at is not null;
    if paid.applied_at < first_paid + interval '12 months' then
      insert into public.partner_commissions (order_id, partner_user_id, amount, available_at)
        values (paid.id, partner, round(paid.price_amount * 0.30, 2), now() + interval '14 days')
        on conflict (order_id) do nothing;
    end if;
  end if;
  return until;
end;
$$;

revoke all on function public.apply_crypto_order(uuid, text) from public, anon, authenticated;
grant execute on function public.apply_crypto_order(uuid, text) to service_role;

-- Partner program (SPEC section 8). A partner shares tiltless.xyz/?ref=<code>; a trader who signs
-- up within 60 days of opening the link (kept in their browser) is theirs, and the partner earns
-- 30% of that trader's Pro payments for 12 months from the first one. A commission becomes
-- payable 14 days after the payment; the owner pays out in USDT (TRC20) by hand once a month from
-- $30 and marks the rows paid (queries in docs/partners.md). Partners see counts and sums only,
-- never who signed up.
create table if not exists public.partners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[a-z0-9]{6,16}$'),
  payout_wallet text check (payout_wallet is null or payout_wallet ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'),
  created_at timestamptz not null default now()
);

alter table public.partners enable row level security;

drop policy if exists "Partners read their own row" on public.partners;
create policy "Partners read their own row"
  on public.partners for select to authenticated
  using ((select auth.uid()) = user_id);

-- Who referred whom. No policies: read only through partner_stats().
create table if not exists public.referrals (
  referred_user_id uuid primary key references auth.users (id) on delete cascade,
  partner_user_id uuid not null references public.partners (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  check (referred_user_id <> partner_user_id)
);

create index if not exists referrals_partner on public.referrals (partner_user_id);

alter table public.referrals enable row level security;

-- One commission per paid order. No policies: written by apply_crypto_order, read through
-- partner_stats(), marked paid by the owner.
create table if not exists public.partner_commissions (
  order_id uuid primary key references public.crypto_orders (id) on delete cascade,
  partner_user_id uuid not null references public.partners (user_id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  available_at timestamptz not null,
  paid_out_at timestamptz,
  payout_tx text,
  created_at timestamptz not null default now()
);

create index if not exists partner_commissions_partner on public.partner_commissions (partner_user_id);

alter table public.partner_commissions enable row level security;

-- Makes the signed-in user a partner (once) and returns their row with a new random code.
create or replace function public.become_partner()
returns public.partners
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  mine public.partners;
begin
  if me is null then
    raise exception 'not signed in';
  end if;
  loop
    select * into mine from public.partners where user_id = me;
    if found then
      return mine;
    end if;
    begin
      insert into public.partners (user_id, code)
        values (me, substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
        returning * into mine;
      return mine;
    exception when unique_violation then
      -- The code was taken, or another tab just made this user a partner: look again.
      null;
    end;
  end loop;
end;
$$;

-- Sets or clears the partner's USDT (TRC20) payout address; the table checks its format.
create or replace function public.set_payout_wallet(p_wallet text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.partners set payout_wallet = nullif(trim(p_wallet), '') where user_id = auth.uid();
$$;

-- Ties the signed-in user to the partner whose code they arrived with. Only for a new account
-- (created in the last 7 days) that has never paid, never for oneself, and only once. Returns
-- 'ok' or why not. The 60-day window is checked in the browser, which saw the link.
create or replace function public.claim_referral(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  partner uuid;
  joined timestamptz;
begin
  if me is null then
    return 'not_signed_in';
  end if;
  if exists (select 1 from public.referrals where referred_user_id = me) then
    return 'already_referred';
  end if;
  select user_id into partner from public.partners where code = lower(trim(p_code));
  if partner is null then
    return 'unknown_code';
  end if;
  if partner = me then
    return 'self';
  end if;
  select created_at into joined from auth.users where id = me;
  if joined < now() - interval '7 days' then
    return 'existing_account';
  end if;
  if exists (select 1 from public.crypto_orders where user_id = me and applied_at is not null) then
    return 'already_paying';
  end if;
  insert into public.referrals (referred_user_id, partner_user_id) values (me, partner)
    on conflict (referred_user_id) do nothing;
  return 'ok';
end;
$$;

-- The signed-in partner's link and totals, or null for someone who isn't a partner.
create or replace function public.partner_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'code', p.code,
    'payout_wallet', p.payout_wallet,
    'referred', (select count(*) from public.referrals r where r.partner_user_id = p.user_id),
    'paying', (
      select count(distinct o.user_id) from public.partner_commissions c
        join public.crypto_orders o on o.id = c.order_id
        where c.partner_user_id = p.user_id
    ),
    'pending', (
      select coalesce(sum(amount), 0) from public.partner_commissions c
        where c.partner_user_id = p.user_id and c.paid_out_at is null and c.available_at > now()
    ),
    'available', (
      select coalesce(sum(amount), 0) from public.partner_commissions c
        where c.partner_user_id = p.user_id and c.paid_out_at is null and c.available_at <= now()
    ),
    'paid', (
      select coalesce(sum(amount), 0) from public.partner_commissions c
        where c.partner_user_id = p.user_id and c.paid_out_at is not null
    )
  )
  from public.partners p
  where p.user_id = auth.uid();
$$;

revoke all on function public.become_partner() from public, anon;
revoke all on function public.set_payout_wallet(text) from public, anon;
revoke all on function public.claim_referral(text) from public, anon;
revoke all on function public.partner_stats() from public, anon;
grant execute on function public.become_partner() to authenticated;
grant execute on function public.set_payout_wallet(text) to authenticated;
grant execute on function public.claim_referral(text) to authenticated;
grant execute on function public.partner_stats() to authenticated;

-- Telegram (SPEC section 4.10): which chat gets a trader's summaries and alerts. Written only by
-- the telegram-* functions with the service role; no policies, so the app can't read other rows.
create table if not exists public.telegram_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  chat_id bigint unique,
  -- One-time code from "Connect", sent back by Telegram as /start <code>.
  link_code text unique,
  link_code_expires_at timestamptz,
  time_zone text not null default 'UTC',
  language text not null default 'en' check (language in ('en', 'ru', 'es')),
  daily_summary boolean not null default true,
  limit_alerts boolean not null default true,
  review_reminder boolean not null default true,
  -- Local days already messaged, so the hourly job and several devices send once.
  last_daily_sent date,
  last_review_sent date,
  last_limit_sent date,
  linked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.telegram_links enable row level security;
-- The hourly job that sends summaries is set up once by docs/migrations/2026-11-02-telegram.sql.

-- Web push (SPEC section 4.10): devices that get the evening summary and review reminder.
-- Written only by push-account and telegram-digest with the service role; no policies.
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
