import { Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useCloud } from '../../app/cloud'
import { disconnectTelegram, setTelegramSwitch, telegramConnectUrl, telegramStatus, type TelegramStatus, type TelegramSwitch } from '../../app/telegram'
import { Button, Card } from '../../design/components'
import { useI18n } from '../../i18n/i18n'

const SWITCHES: TelegramSwitch[] = ['dailySummary', 'limitAlerts', 'reviewReminder']
/** After "Connect", check every few seconds whether the trader pressed Start in Telegram. */
const POLL_MS = 4_000
const POLL_FOR_MS = 3 * 60_000

/** Profile: summaries, limit alerts and review reminders in Telegram (SPEC section 4.10). */
export function TelegramSection() {
  const { t, locale } = useI18n()
  const { cloud, state } = useCloud()
  const client = cloud.supabase
  const signedIn = Boolean(client && state.email)
  const [status, setStatus] = useState<TelegramStatus>()
  const [link, setLink] = useState<{ url: string; until: number }>()
  const [problem, setProblem] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!client) return
    try {
      const next = await telegramStatus(client, locale)
      setStatus(next)
      setProblem(false)
      if (next.linked) setLink(undefined)
    } catch {
      setProblem(true)
    }
  }, [client, locale])

  useEffect(() => {
    if (signedIn) void refresh()
  }, [signedIn, refresh])

  // Waiting for Start in Telegram.
  useEffect(() => {
    if (!link) return
    const timer = setInterval(() => (Date.now() > link.until ? setLink(undefined) : void refresh()), POLL_MS)
    return () => clearInterval(timer)
  }, [link, refresh])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
      setProblem(false)
    } catch {
      setProblem(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="form-stack telegram">
      <p className="secondary-text">{t('telegram.intro')}</p>
      {!signedIn ? (
        <p className="caption">{t('telegram.signIn')}</p>
      ) : status?.linked ? (
        <>
          <p className="telegram__state" role="status">
            <Send size={16} aria-hidden="true" />
            {t('telegram.linked')}
          </p>
          {SWITCHES.map((name) => (
            <label key={name} className="toggle-row">
              <input
                type="checkbox"
                checked={status[name]}
                disabled={busy}
                onChange={(event) => {
                  const value = event.target.checked
                  void run(async () => setStatus(await setTelegramSwitch(client!, name, value)))
                }}
              />
              <span>
                {t(`telegram.${name}`)}
                <span className="caption toggle-row__hint">{t(`telegram.${name}Hint`)}</span>
              </span>
            </label>
          ))}
          <Button variant="plain" disabled={busy} onClick={() => void run(async () => setStatus(await disconnectTelegram(client!)))}>
            {t('telegram.disconnect')}
          </Button>
        </>
      ) : link ? (
        <>
          <a className="button button--primary telegram__open" href={link.url} target="_blank" rel="noopener noreferrer">
            <Send size={18} aria-hidden="true" />
            {t('telegram.open')}
          </a>
          <p className="caption" role="status">
            {t('telegram.waiting')}
          </p>
          <Button variant="plain" onClick={() => void refresh()}>
            {t('telegram.check')}
          </Button>
        </>
      ) : (
        <Button
          icon={<Send size={18} aria-hidden="true" />}
          disabled={busy}
          onClick={() => void run(async () => setLink({ url: await telegramConnectUrl(client!, locale), until: Date.now() + POLL_FOR_MS }))}
        >
          {t('telegram.connect')}
        </Button>
      )}
      {problem && (
        <p className="caption field__error" role="alert">
          {t('telegram.problem')}
        </p>
      )}
      <p className="caption">{t('telegram.privacy')}</p>
    </Card>
  )
}
