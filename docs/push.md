# Web push notifications: setup

Code: web/supabase/functions/push-account (subscriptions), web/supabase/functions/telegram-digest
(sends the evening summary and review reminder to Telegram chats and push devices),
_shared/webPush.ts (encryption and VAPID signature on WebCrypto, tested in src/core/push),
web/src/app/push.ts and Profile → Notifications. The functions deploy on push.

Once, by the owner:

1. **Keys.** Open any site in Chrome → F12 → Console (if Chrome refuses to paste, type
   `allow pasting` first) → paste and press Enter:

   ```js
   (async()=>{const k=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign']);const pub=new Uint8Array(await crypto.subtle.exportKey('raw',k.publicKey));const b=u=>btoa(String.fromCharCode(...u)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');const jwk=await crypto.subtle.exportKey('jwk',k.privateKey);console.log('VAPID_PUBLIC_KEY='+b(pub));console.log('VAPID_PRIVATE_KEY='+jwk.d)})()
   ```

   It prints two lines. The public key (87 characters) is not secret; the private key (43
   characters) is: it goes only into Supabase.
2. **Secrets.** Supabase → Edge Functions → Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and
   `VAPID_SUBJECT` = `mailto:` plus a contact email (push services use it if something goes wrong).
3. **Database.** SQL Editor → docs/migrations/2026-11-02-push.sql → Run.
4. **App.** The public key goes into `VAPID_PUBLIC_KEY` in web/src/app/push.ts (send it to
   Claude); then Profile shows Notifications.
5. **Try it.** Profile → Notifications → Turn on → allow → Send a test.

Changing the keys later unsubscribes every device: people turn notifications on again.
iPhone and iPad: works only from the app added to the Home Screen (iOS 16.4+).
