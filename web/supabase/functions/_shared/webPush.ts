// Web Push without libraries (SPEC section 4.10): the VAPID signature (RFC 8292) and the
// message encryption (RFC 8291, aes128gcm) on WebCrypto, which both Deno and the tests' Node
// have. Push services (Google, Apple, Mozilla) only ever see the encrypted message.

export interface PushSubscriptionKeys {
  endpoint: string
  /** The browser's P-256 public key, base64url. */
  p256dh: string
  /** The browser's 16-byte auth secret, base64url. */
  auth: string
}

/** One row of push_subscriptions: a device, its owner and its schedule. */
export interface PushRow extends PushSubscriptionKeys {
  user_id: string
  time_zone: string
  language: 'en' | 'ru' | 'es'
  daily_summary: boolean
  review_reminder: boolean
  last_daily_sent: string | null
  last_review_sent: string | null
}

export interface VapidKeys {
  /** Uncompressed P-256 public key (65 bytes), base64url: the app's applicationServerKey. */
  publicKey: string
  /** The private scalar d (32 bytes), base64url. */
  privateKey: string
  /** mailto: or https: contact for the push services. */
  subject: string
}

const encoder = new TextEncoder()

/** Bytes on a plain ArrayBuffer, which WebCrypto and fetch accept. */
type Bytes = Uint8Array<ArrayBuffer>

const utf8 = (text: string): Bytes => new Uint8Array(encoder.encode(text))

export function base64urlEncode(bytes: Bytes): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64urlDecode(text: string): Bytes {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** HKDF-SHA-256: extract with `salt`, expand with `info` to `length` bytes. */
async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/** Record size written in the header; one record holds the whole message. */
const RECORD_SIZE = 4096

/**
 * Encrypts a message for one browser (RFC 8291 with the aes128gcm coding of RFC 8188):
 * salt(16) | record size(4) | key id length(1) | sender public key(65) | ciphertext.
 */
export async function encryptPush(payload: string, keys: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>, salt: Bytes = crypto.getRandomValues(new Uint8Array(16))): Promise<Bytes> {
  const userPublic = base64urlDecode(keys.p256dh)
  const authSecret = base64urlDecode(keys.auth)
  const sender = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey('raw', sender.publicKey))
  const userKey = await crypto.subtle.importKey('raw', userPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: userKey }, sender.privateKey, 256))

  const ikm = await hkdf(authSecret, shared, concat(utf8('WebPush: info\0'), userPublic, senderPublic), 32)
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12)

  // The message, then the delimiter of the last (and only) record.
  const plaintext = concat(utf8(payload), new Uint8Array([2]))
  if (plaintext.length + 16 > RECORD_SIZE) throw new Error('Push message too long')
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext))

  const header = new Uint8Array(21)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, RECORD_SIZE)
  header[20] = senderPublic.length
  return concat(header, senderPublic, ciphertext)
}

/** The VAPID JWT for a push service's origin, valid for 12 hours, signed ES256. */
export async function vapidToken(endpoint: string, vapid: VapidKeys, now = Date.now()): Promise<string> {
  const publicKey = base64urlDecode(vapid.publicKey)
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: base64urlEncode(publicKey.slice(1, 33)),
    y: base64urlEncode(publicKey.slice(33, 65)),
    d: vapid.privateKey,
    ext: true,
  }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = base64urlEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = base64urlEncode(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })))
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${claims}`)))
  return `${header}.${claims}.${base64urlEncode(signature)}`
}

/** What the service worker shows. */
export interface PushMessage {
  title: string
  body: string
  /** Opened when the notification is clicked. */
  url: string
  /** Replaces an earlier notification with the same tag. */
  tag: string
}

/** Sends a message; 'gone' means the browser unsubscribed and the row should be deleted. */
export async function sendPush(subscription: PushSubscriptionKeys, message: PushMessage, vapid: VapidKeys): Promise<'sent' | 'gone'> {
  const body = await encryptPush(JSON.stringify(message), subscription)
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${await vapidToken(subscription.endpoint, vapid)}, k=${vapid.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(12 * 3600),
      Urgency: 'normal',
    },
    body,
  })
  if (response.status === 404 || response.status === 410) return 'gone'
  if (!response.ok) throw new Error(`Push ${new URL(subscription.endpoint).host}: ${response.status} ${await response.text()}`)
  return 'sent'
}

/** Push services the browsers use; the server only ever calls these. */
const PUSH_HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com']

/** A push service address we are willing to call: https on a known push host. */
export function pushEndpointAllowed(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}
