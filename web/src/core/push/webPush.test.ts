import { describe, expect, it } from 'vitest'
import { base64urlDecode, base64urlEncode, encryptPush, pushEndpointAllowed, vapidToken } from '../../../supabase/functions/_shared/webPush'

// Web Push's crypto, shared with the Supabase functions: checked by playing the browser's part.

type Bytes = Uint8Array<ArrayBuffer>

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

const text = (value: string): Bytes => new Uint8Array(new TextEncoder().encode(value))

/** A browser's subscription keys, with the private half kept for decrypting. */
async function browser() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const auth = crypto.getRandomValues(new Uint8Array(16))
  return { pair, publicKey, auth, keys: { p256dh: base64urlEncode(publicKey), auth: base64urlEncode(auth) } }
}

/** RFC 8291 decryption, as the browser does it. */
async function decrypt(body: Bytes, user: Awaited<ReturnType<typeof browser>>): Promise<string> {
  const salt = body.slice(0, 16)
  const recordSize = new DataView(body.buffer, body.byteOffset).getUint32(16)
  const idLength = body[20]!
  const senderPublic = body.slice(21, 21 + idLength)
  const ciphertext = body.slice(21 + idLength)
  expect(recordSize).toBe(4096)
  const senderKey = await crypto.subtle.importKey('raw', senderPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: senderKey }, user.pair.privateKey, 256))
  const info = new Uint8Array([...text('WebPush: info\0'), ...user.publicKey, ...senderPublic])
  const ikm = await hkdf(user.auth, shared, info, 32)
  const cek = await hkdf(salt, ikm, text('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, text('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext))
  expect(plain.at(-1)).toBe(2)
  return new TextDecoder().decode(plain.slice(0, -1))
}

describe('web push', () => {
  it('round-trips base64url', () => {
    const bytes = new Uint8Array([0, 251, 255, 62, 63, 1])
    expect(base64urlDecode(base64urlEncode(bytes))).toEqual(bytes)
    expect(base64urlEncode(bytes)).not.toMatch(/[+/=]/)
  })

  it('encrypts a message only the browser can read', async () => {
    const user = await browser()
    const message = JSON.stringify({ title: 'Tiltless', body: 'Сегодня: +$120,00 — ¿se mantuvo el plan?' })
    const body = await encryptPush(message, user.keys)
    expect(await decrypt(body, user)).toBe(message)
    // A fresh sender key and salt each time.
    expect(base64urlEncode(await encryptPush(message, user.keys))).not.toBe(base64urlEncode(body))
  })

  it('signs a VAPID token the public key verifies', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
    const publicKey = base64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
    const now = Date.UTC(2026, 10, 2, 12)
    const token = await vapidToken('https://fcm.googleapis.com/fcm/send/abc', { publicKey, privateKey: jwk.d!, subject: 'mailto:hi@tiltless.xyz' }, now)
    const [header, claims, signature] = token.split('.')
    expect(JSON.parse(new TextDecoder().decode(base64urlDecode(claims!)))).toEqual({ aud: 'https://fcm.googleapis.com', exp: now / 1000 + 43200, sub: 'mailto:hi@tiltless.xyz' })
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, base64urlDecode(signature!), text(`${header}.${claims}`))
    expect(valid).toBe(true)
  })

  it('calls only known push services', () => {
    expect(pushEndpointAllowed('https://fcm.googleapis.com/fcm/send/x')).toBe(true)
    expect(pushEndpointAllowed('https://web.push.apple.com/abc')).toBe(true)
    expect(pushEndpointAllowed('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true)
    expect(pushEndpointAllowed('https://evil.example.com/fcm.googleapis.com')).toBe(false)
    expect(pushEndpointAllowed('http://fcm.googleapis.com/x')).toBe(false)
    expect(pushEndpointAllowed('https://push.apple.com.evil.com/x')).toBe(false)
  })
})
