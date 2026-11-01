import { keepReferral, referralCodeFrom, withoutReferral, type StoredReferral } from '../core/referral'

// Where a partner's link is remembered (SPEC section 8). Kept apart from referral.ts, which needs
// the cloud client, so the landing page, where partner links arrive, stays small.

const STORAGE_KEY = 'mirror.referral'

export function readStored(): StoredReferral | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredReferral>) : undefined
    return parsed && typeof parsed.code === 'string' && typeof parsed.at === 'number' ? { code: parsed.code, at: parsed.at } : undefined
  } catch {
    return undefined
  }
}

export function writeStored(value: StoredReferral | undefined): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Without storage the link counts only if the visitor signs up in this visit.
  }
}

/** Runs once at startup: keeps a `?ref=` code (the first one wins for 60 days) and cleans the address. */
export function captureReferral(): void {
  const code = referralCodeFrom(window.location.href)
  if (!code) return
  writeStored(keepReferral(readStored(), code, Date.now()))
  window.history.replaceState(window.history.state, '', withoutReferral(window.location.href))
}

