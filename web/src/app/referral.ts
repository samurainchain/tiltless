import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect } from 'react'
import { isFresh } from '../core/referral'
import { readStored, writeStored } from './referralLink'
import { useCloud } from './cloud'

// The browser side of the partner program (SPEC section 8): remember the partner link a
// visitor arrived with, hand it to the database once they sign in, and the partner's own
// calls. Storage keys keep the app's first name, like the rest.

export { captureReferral } from './referralLink'

/**
 * After sign-in, ties the account to the partner whose link the visitor opened. The database
 * accepts it only for a new account that hasn't paid; whatever it answers, the stored link has
 * done its job and is dropped. A network error keeps it for the next sign-in.
 */
export function useReferralClaim(): void {
  const { cloud, state } = useCloud()
  const signedIn = Boolean(state.email)
  useEffect(() => {
    const client = cloud.supabase
    const stored = readStored()
    if (!signedIn || !client || !stored) return
    if (!isFresh(stored, Date.now())) {
      writeStored(undefined)
      return
    }
    void client.rpc('claim_referral', { p_code: stored.code }).then(({ error }) => {
      if (!error) writeStored(undefined)
    })
  }, [cloud, signedIn])
}

export interface PartnerStats {
  code: string
  payoutWallet?: string
  referred: number
  paying: number
  /** Earned, still inside the 14-day hold. */
  pending: string
  /** Earned and payable at the next monthly payout. */
  available: string
  paid: string
}

interface StatsRow {
  code: string
  payout_wallet: string | null
  referred: number
  paying: number
  pending: number | string
  available: number | string
  paid: number | string
}

const money = (value: number | string) => String(value)

/** The signed-in partner's link and totals, or undefined when they aren't a partner yet. */
export async function fetchPartnerStats(client: SupabaseClient): Promise<PartnerStats | undefined> {
  const { data, error } = await client.rpc('partner_stats')
  if (error) throw error
  const row = data as StatsRow | null
  if (!row) return undefined
  return {
    code: row.code,
    payoutWallet: row.payout_wallet ?? undefined,
    referred: Number(row.referred),
    paying: Number(row.paying),
    pending: money(row.pending),
    available: money(row.available),
    paid: money(row.paid),
  }
}

export async function becomePartner(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('become_partner')
  if (error) throw error
}

export async function savePayoutWallet(client: SupabaseClient, wallet: string): Promise<void> {
  const { error } = await client.rpc('set_payout_wallet', { p_wallet: wallet.trim() })
  if (error) throw error
}

/** The link a partner shares. */
export function partnerLink(code: string): string {
  return `https://tiltless.xyz/?ref=${code}`
}
