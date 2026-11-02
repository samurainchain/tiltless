import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { DEFAULT_REVENGE_MINUTES, detectMistakes, effectiveMistakeIds, type AutoFlag } from '../core/mistakeDetector'
import { demoAccountIds, type Account, type MistakeTag, type Trade } from '../core/models'
import type { JournalSnapshot, JournalStore } from '../core/storage/journalStore'
import { useI18n } from '../i18n/i18n'
import type { MessageKey } from '../i18n/messages/en'
import { useSettings } from './settings'

const StoreContext = createContext<JournalStore | null>(null)

export function JournalProvider({ store, children }: { store: JournalStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore(): JournalStore {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside JournalProvider')
  return store
}

export function useJournal(): JournalSnapshot {
  const store = useStore()
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

/**
 * Automatic mistake flags for every trade (SPEC section 13), keyed by trade id. Empty when the
 * trader turned them off; a flag whose system tag is archived is left out.
 */
export function useAutoFlags(): ReadonlyMap<string, AutoFlag[]> {
  const { trades, profile, mistakes, accounts } = useJournal()
  return useMemo(() => {
    if (profile.autoMistakes === false) return new Map<string, AutoFlag[]>()
    const archived = new Set(mistakes.filter((tag) => tag.isArchived && tag.systemKey).map((tag) => tag.systemKey))
    const settings = { revengeMinutes: profile.revengeMinutes ?? DEFAULT_REVENGE_MINUTES, dailyTradeLimit: profile.dailyTradeLimit }
    // Practice trades are checked on their own: a demo loss doesn't make a real trade revenge.
    const demo = demoAccountIds(accounts)
    const flags =
      demo.size === 0
        ? detectMistakes(trades, settings)
        : new Map([
            ...detectMistakes(trades.filter((trade) => !demo.has(trade.accountId)), settings),
            ...detectMistakes(trades.filter((trade) => demo.has(trade.accountId)), settings),
          ])
    if (archived.size === 0) return flags
    return new Map([...flags].map(([id, list]) => [id, list.filter((flag) => !archived.has(flag.key))]))
  }, [trades, profile, mistakes, accounts])
}

/** Every trade with its active automatic flags merged into `mistakeIds`, for lists and stats. */
export function useFlaggedTrades(): Trade[] {
  const { trades } = useJournal()
  const flags = useAutoFlags()
  return useMemo(
    () =>
      trades.map((trade) => {
        const mistakeIds = effectiveMistakeIds(trade, flags.get(trade.id))
        return mistakeIds.length === trade.mistakeIds.length ? trade : { ...trade, mistakeIds }
      }),
    [trades, flags],
  )
}

export function activeAccounts(accounts: readonly Account[]): Account[] {
  return accounts.filter((account) => !account.isArchived)
}

/**
 * The account chosen in the switcher, or undefined for "All accounts". Falls back to all
 * when the remembered account no longer exists.
 */
export function useSelectedAccount(): Account | undefined {
  const { accounts } = useJournal()
  const { selectedAccount } = useSettings()
  if (selectedAccount === 'all') {
    const active = activeAccounts(accounts)
    return active.length === 1 ? active[0] : undefined
  }
  return accounts.find((account) => account.id === selectedAccount)
}

/** Display name of a mistake tag: the user's name, or the translated system name. */
export function useMistakeName(): (tag: MistakeTag) => string {
  const { t } = useI18n()
  // Stable while the language stays, so memoized pictures and lists that use it don't redraw.
  return useCallback((tag: MistakeTag) => tag.name || (tag.systemKey ? t(`mistake.${tag.systemKey}` as MessageKey) : ''), [t])
}
