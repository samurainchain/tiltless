# Tiltless — Trading Journal (iOS)

Product name: Tiltless, domain tiltless.xyz (renamed from the working name Mirror). The Xcode project, targets, Swift types and browser storage keys (`mirror.settings`, IndexedDB `mirror`, backup format `mirror-backup`) keep the old name on purpose: renaming them would lose users' data or needs a Mac to verify.

Full product spec: docs/SPEC.md. Read the relevant section before every task.

## Stack
- Swift 6, SwiftUI, iOS 26+, Xcode 26
- SwiftData + CloudKit (private DB), Swift Charts, Vision, WidgetKit
- RevenueCat for subscriptions (entitlement: "pro")
- No third-party UI libraries, no Combine, no ad/tracking SDKs

## Architecture rules
- Feature folders under Features/, each with View + @Observable ViewModel
- Business logic only in Core/ services, injected via @Environment
- Views never compute stats and never call RevenueCat directly
- All money values are Decimal, never Double
- Each trade belongs to an Account with an AssetClass (cryptoSpot, cryptoPerp, stock, futures); entry form fields and PnL math depend on it (futures use contract multiplier, see SPEC section 6)
- SwiftData models: every property optional or defaulted, no unique constraints, optional relationships (CloudKit requirement)
- StatsEngine = pure functions, fully unit-tested with Swift Testing

## UI rules
- Use only DesignSystem tokens and components; no hardcoded colors, fonts or spacing
- Native iOS 26 components and gestures first (sheets, swipe actions, context menus, Liquid Glass navigation)
- Every user-facing string goes through Localizable.xcstrings (en, ru, es)
- Numbers use .monospacedDigit(); profit/loss always shows sign, not only color
- Support Dynamic Type and VoiceOver on every screen

## Paywall rules (App Store Guideline 3.1.2)
- Billed amount is the most prominent price element
- No free-trial toggle; trial belongs to the annual plan card
- Show trial length and post-trial price; Restore, Terms, Privacy always visible
- Prices come from RevenueCat Offerings, never hardcoded

## Workflow
- When the owner has to run something (SQL, commands, config), paste the full code in the chat, ready to copy; don't only point to a file in the repo
- Work one stage of docs/SPEC.md section 11 at a time
- Before coding, write a short plan and list files you will touch
- After coding: build, run tests, fix all warnings
- Never delete or rename models without a migration plan
- Ask me before adding any dependency

## Web app (web/)
- React + TypeScript + Vite, deployed to GitHub Pages by .github/workflows/web.yml
- Same product rules as the iOS app: SPEC is the source of truth, money via big.js decimal strings (never floats), design tokens in src/design/tokens.css
- Data lives in the browser (IndexedDB) behind the JournalBackend interface; SyncingBackend records every write and CloudSync syncs with Supabase (last-write-wins per record, tombstones for deletes). Schema: web/supabase/schema.sql; project URL and anon key in src/app/cloudConfig.ts (never the service_role key)
- System mistake tags have fixed ids (`system-<key>`) so copies from different devices merge
- Per-trade math in src/core/pnl.ts, pure and unit-tested (Vitest)
- Every user-facing string goes through src/i18n/messages (en, ru, es); the ru/es catalogs are type-checked against en
- Screenshot reader (free plan: 5 reads a month, Pro unlimited; FREE_SCREENSHOT_READS in src/core/entitlements.ts): Tesseract.js runs in the browser with English and Russian models (src/features/entry/recognize.ts); text-to-fields parsing is pure and tested (src/core/ocr). Exchange screens in English, Russian and Spanish are read (Spanish needs no model of its own: its labels are Latin and the parser accepts lost accents). Share cards over artwork (BingX and the like) get a second, color-masked reading when the first falls short, and their prices are checked against the printed ROI and leverage. Synthetic screenshots live in test-fixtures/ocr (regenerate with scripts/ocr-fixtures/generate.cjs); measure accuracy with scripts/ocr-fixtures/accuracy.cjs against a running preview. Never commit real exchange screenshots
- Two pages (SPEC 4.0): tiltless.xyz is the landing page (index.html, src/landing.tsx, src/features/landing; en/ru/es) and the journal is tiltless.xyz/app/ (app/index.html, src/main.tsx). Same origin, so browser data is shared. The landing page forwards old journal links (/#/…), sign-in links (?code=) and home-screen installs to /app/, and keeps ?ref= partner links. Paths to public files, /tesseract/, /sw.js and the legal pages are absolute from the root. Demo numbers only, labelled; no invented testimonials. The landing shows the real app: public/landing/<locale>-{analytics,today,trades,rules}.webp, taken from the demo journal by scripts/landing-shots/capture.cjs (instructions in its header); retake them when those screens change. Browser scripts start at /app/ or #/today
- Legal pages: static English HTML in public/privacy/ and public/terms/ (styles in public/legal.css), linked from Profile and the onboarding welcome; they describe what the app really does with data, so update them when data flows change (new provider, analytics, payments)
- Accessibility: token contrast is unit-tested (WCAG AA); `npm run audit:a11y` checks every screen in a browser against a running preview (names, alt text, ids, headings, 200% text, focus)
- Before pushing: `npm run typecheck`, `npm test`, `npm run build` in web/
- Monetization: Pro is on sale on the web since 2026-10-28 (`PRO_ON_SALE = true`), paid in crypto; the journal stays free and Pro unlocks the deeper features (SPEC section 8, src/core/entitlements.ts). Later Pro via Stripe, preferably RevenueCat Web Billing so the `pro` entitlement is shared with iOS; web prices slightly below iOS (SPEC section 8, "Веб-версия"). Stripe billing (web/supabase/functions/billing-*, src/app/billing.ts, ProSection) is built and was tested end to end in test mode; Profile hides it until `PRO_ON_SALE` in src/app/billing.ts is turned on with live keys and Terms/Privacy/Refund pages. Blocked for now (2026-10): the owner has Russian documents only, so Stripe (the current test account is registered in Mexico and needs an RFC), Paddle and Lemon Squeezy can't be activated; payments wait until the owner has a legal seller status in a supported country. Don't try to switch to live mode or suggest workarounds that misstate the seller's country
- Crypto payments (the current way to sell Pro, `PAYMENT_PROVIDER = 'crypto'`): NOWPayments invoices for a month or a year of Pro, no auto-renewal. Functions crypto-invoice (GET prices, POST invoice) and crypto-webhook (reads every payment back from the NOWPayments API before granting; the IPN signature is only logged); tables crypto_orders and pro_access, Pro extended once per order by the SQL function apply_crypto_order. Pure logic in supabase/functions/_shared/cryptoPayments.ts, tested in src/core/billing. `?pro=preview` shows the Pro section in one browser tab before it is on sale. Tested end to end 2026-10-28: the owner paid the $44.99 annual pass (USDC on Solana, converted to the USDT TRC20 payout wallet) and Pro showed as active until 2027-10-28. The monthly pass is $15.99: NOWPayments' minimum depends on the payout wallet (TRC20 payouts put it near $14-20); the payout wallet moves to USDC on Solana, where it is ~$9 for every coin and $14.4 for USDT TRC20 (GET crypto-invoice?minimums&to=usdcsol lists them). Free vs Pro, the 7-day trial (30 days for accounts created through 2026-11-30, the launch offer: LAUNCH_OFFER_ENDS in src/core/entitlements.ts and the start_pro_trial trigger; the owner ran docs/migrations/2026-10-28-launch-offer.sql on 2026-10-29 and moved trials started since 2026-10-28 to 30 days) and the Refund Policy are done (SPEC section 8, src/core/entitlements.ts, src/app/entitlement.tsx, public/refund/); launching is docs/pro-launch.md (30-day gift for existing users, then PRO_ON_SALE = true)
- Partner program (SPEC section 8): 30% of a referred trader's Pro payments for 12 months, payable after 14 days, paid by hand in USDT (TRC20) monthly from $30. Tables partners, referrals, partner_commissions and functions become_partner, set_payout_wallet, claim_referral, partner_stats in web/supabase/schema.sql; commissions are written by apply_crypto_order. Browser side in src/app/referral.ts (link kept 60 days in `mirror.referral`), pure rules in src/core/referral.ts, page in src/features/partners. Owner's payout queries: docs/partners.md. Live: the owner ran docs/migrations/2026-10-28-partners.sql and 2026-10-28-pro-trial.sql on 2026-10-28 and saw the partner link appear

- Telegram bot (SPEC 4.10): Profile → Telegram links a chat (one-time /start code); evening summary, limit alert and review reminder from web/supabase/functions/telegram-* (pure logic in _shared/telegram.ts, tested in src/core/telegram), table telegram_links, hourly pg_cron job. Live since 2026-11-02: the owner set it up by docs/telegram.md (secrets, migration, webhook) and linked a chat; `TELEGRAM_READY = true` in src/app/telegram.ts. Never ask for or commit the bot token
- Web push (SPEC 4.10): Profile → Notifications, push-account function, push_subscriptions table, sent by the same hourly telegram-digest; crypto on WebCrypto in _shared/webPush.ts (no library). Hidden until the owner creates VAPID keys by docs/push.md and the public key is set in src/app/push.ts; the private key never leaves Supabase secrets
- Economic calendar (SPEC 4.3/4.7): high-impact events from the Forex Factory weekly feed through the econ-calendar function (one shared copy in the market_cache table, refreshed at most every 30 minutes because the feed refuses frequent askers; the owner created the table on 2026-11-03), shown as our own list in Analytics and in Today's brief; replaced the Investing.com iframe
- Liquidation map (SPEC 4.7, Pro dashboard block): OKX candles and open interest through the market-data function, the estimate in src/core/liquidationMap.ts, canvas in features/market. A model, never presented as exchanges' real levels or as a signal
- Trade price charts (crypto): Binance public klines from data-api.binance.vision, opt-in like the economic calendar (src/core/chart.ts, features/trades/TradeChart.tsx)

## Design direction
- Four styles the user picks (Profile: a grid of previews, every style × accent in the current theme with an AA badge, palette copied in src/design/appearance.ts and tested against the tokens; or the theme menu in the top bar): "glow" (the default again since 2026-11-11, after the owner's desktop mockups; saved "soft" moves to glow once via the `glowStyle` flag), "soft", "flat" and "graphite". The desktop shell (2026-11-11): a full-width top bar with the date and the account switcher, a tinted lit current tab, amounts in Geist Mono in glow, trade entry as a right side sheet (Sheet `side`), Today as a 12-column grid from 1200 px with the limits inside the day card, the trade table grouped by day with Tags (amber: mistakes are warnings, red only for money lost) and Emotion columns, and today's loss meter and trade count on Rules. Graphite (src/design/graphite.css, added 2026-11-08 after the Supabase home page the owner showed) keeps flat's tokens and adds 16px cards lit faintly from the top edge, roomier padding, sentence-case card titles (the rule shared with soft.css), light large page titles and quiet outlined dark buttons. Soft (src/design/soft.css, after Obsidian's settings, the owner's reference) is calm neutral greys (#1e1e1e page, #262626 panels and sidebar), large-radius panels without outlines, raised grey buttons and selects, a bordered pill for the current page, sentence-case section titles and labels in the text face, switches for on/off settings; its greys are covered by contrast.test.ts. Flat is the Supabase-dashboard look: near-black background, thin 1px borders, small uppercase monospace labels, dense cards. Glow (src/design/glow.css, inspired by the Deadlock Mod Manager the owner likes) adds the accent's light: corner glows over a faint grid, translucent cards with a lit top edge, a filled glowing current tab, glowing primary buttons and hero numbers
- Five accents (emerald by default, amber, violet, blue, pink) in tokens.css, each with a dark and a light variant, all WCAG AA (contrast.test.ts covers every accent and theme). No red accent: red means loss. Profit and loss colors never change with the accent
- Type: Geist (text) and Geist Mono (labels, scales), self-hosted in web/public/fonts with the OFL license, through --font-body and --font-mono; canvases (share cards, charts) use the same families. iOS uses the same families: TTFs in Mirror/Resources/Fonts registered at launch by FontRegistry, DSFont tokens via Font.custom(_:size:relativeTo:) so Dynamic Type still scales (added 2026-11-06 without a Mac build: check it on the next Xcode build)
- Further visual work should go through these tokens and styles, not one-off colors

## Instagram marketing
- Skills /ig-reel, /ig-viral, /ig-caption, /ig-carousel, /ig-story, /ig-profile, /ig-plan, /ig-human, /ig-comment, /ig-reply, /ig-dm, /ig-repurpose, /ig-audit live in .claude/skills/ig-* (third-party, MIT, copied unchanged; see .claude/skills/LICENSE-instagram-agent-skill)
- Their files live in the repo, not in ~/.claude/instagram (the cloud container is temporary): read and write marketing/instagram/voice.md, swipe.md, plan.md and log.md wherever a skill says ~/.claude/instagram/
- Nothing is posted without the owner's yes; no profit or income claims (Meta ad policy, SPEC)
- Threads (@tiltless.xyz) is in Russian for the Russian-speaking audience (owner's decision 2026-11-11), while Instagram and TikTok stay Spanish for Mexico: posts in marketing/threads/week-N.md, results in marketing/threads/log.md; times in Moscow, scheduled in Threads itself
- Video skills (third-party, copied unchanged; sources in .claude/skills/SOURCES-video-skills.md): remotion-* (Remotion's agent skills) and hyperframes, hyperframes-cli, hyperframes-registry, media-use, remotion-to-hyperframes, reverse-any-video, style-sampling (HeyGen HyperFrames, Apache 2.0). Their tools (yt-dlp, whisper.cpp, HyperFrames CLI via npx) are installed per session by marketing/video-tools/setup.sh; FFmpeg is already in the container
- Reels the owner sends for ideas: the cloud session can't open Instagram or TikTok links (Instagram wants a login, TikTok blocks bots; don't work around either), so the owner uploads the video file and `bash marketing/video-tools/analyze.sh <file>` makes a contact sheet of frames and timed speech (whisper). Note what's worth borrowing in marketing/instagram/swipe.md. YouTube links work with yt-dlp. Agent Reach (Panniantong/agent-reach) was looked at on 2026-11-03 and not installed: its Instagram channel needs a logged-in browser on the owner's computer
