# Telegram bot: setup

The code is in the repo (web/supabase/functions/telegram-*, web/src/app/telegram.ts,
Profile → Telegram). The functions deploy by themselves on push (.github/workflows/supabase-functions.yml).
What only the owner can do, once:

1. **Create the bot.** In Telegram open @BotFather → /newbot → name "Tiltless" → username, for
   example `tiltless_journal_bot`. BotFather answers with a token like `123456:ABC…`. Keep it
   private: don't paste it in chats or commits.
   Optional, in BotFather: /setdescription, /setuserpic (the logo), /setabouttext.
2. **Secrets.** Supabase → Edge Functions → Secrets → add:
   - `TELEGRAM_BOT_TOKEN`: the token from BotFather
   - `TELEGRAM_BOT_USERNAME`: the bot's username without @
   - `TELEGRAM_WEBHOOK_SECRET`: any long random string (letters, digits, `_` and `-`, up to 256)
   - `TELEGRAM_CRON_SECRET`: another long random string
   A random string: in a terminal `openssl rand -hex 32`, or any password generator.
3. **Database.** Supabase → Database → Extensions: turn on `pg_cron` and `pg_net`. Then SQL
   Editor → paste docs/migrations/2026-11-02-telegram.sql, replace `PASTE_TELEGRAM_CRON_SECRET`
   with the value of `TELEGRAM_CRON_SECRET`, Run.
4. **Webhook.** Open in a browser, once:
   `https://vmjyzwrrueoyxcuzpeil.supabase.co/functions/v1/telegram-webhook?setup=<TELEGRAM_WEBHOOK_SECRET>`
   It answers "Webhook set to …".
5. **Try it.** Open `https://tiltless.xyz/app/?telegram=preview#/profile` signed in → Telegram →
   Connect → Open Telegram → Start. The bot says it is connected and Profile shows the switches.
6. **Turn it on for everyone**: `TELEGRAM_READY = true` in web/src/app/telegram.ts (ask Claude).

## What it sends

- Evening summary after 21:00 local time, on days with closed trades on real accounts.
- "Daily limit reached", at most once a day, when the app sees a limit reached (sent from the
  open app through telegram-account).
- Weekly review reminder on the review weekday after 10:00, with the last 7 days' result.

The hourly job (pg_cron, `telegram-digest`, minute 5) decides what is due for each linked
trader from their time zone. Check it: SQL `select * from cron.job_run_details order by start_time desc limit 5;`
and the function's logs in Supabase.

## Turning it off

`select cron.unschedule('telegram-digest');` stops the summaries; `TELEGRAM_READY = false`
hides the section. A trader leaves with /stop or "Disconnect" in Profile.
