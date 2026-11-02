import { Bell } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useCloud } from '../../app/cloud'
import { pushStatus, pushSupport, setPushSwitch, subscribePush, testPush, unsubscribePush, type PushStatus, type PushSwitch } from '../../app/push'
import { Button, Card } from '../../design/components'
import { useI18n } from '../../i18n/i18n'

const SWITCHES: PushSwitch[] = ['dailySummary', 'reviewReminder']

/** Profile: the evening summary and review reminder as notifications on this device (SPEC 4.10). */
export function PushSection() {
  const { t, locale } = useI18n()
  const { cloud, state } = useCloud()
  const client = cloud.supabase
  const signedIn = Boolean(client && state.email)
  const [support, setSupport] = useState(pushSupport)
  const [status, setStatus] = useState<PushStatus>()
  const [note, setNote] = useState<'problem' | 'testSent' | 'testFailed'>()
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!client || pushSupport() !== 'ok') return
    try {
      setStatus(await pushStatus(client))
    } catch {
      setNote('problem')
    }
  }, [client])

  useEffect(() => {
    if (signedIn) void refresh()
  }, [signedIn, refresh])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setNote(undefined)
    try {
      await action()
    } catch {
      setSupport(pushSupport())
      setNote('problem')
    } finally {
      setBusy(false)
    }
  }

  let body
  if (!signedIn) body = <p className="caption">{t('push.signIn')}</p>
  else if (support !== 'ok') body = <p className="caption">{t(`push.${support}`)}</p>
  else if (status?.subscribed)
    body = (
      <>
        <p className="telegram__state" role="status">
          <Bell size={16} aria-hidden="true" />
          {t('push.on')}
        </p>
        {SWITCHES.map((name) => (
          <label key={name} className="toggle-row">
            <input
              type="checkbox"
              checked={status[name]}
              disabled={busy}
              onChange={(event) => {
                const value = event.target.checked
                void run(async () => setStatus(await setPushSwitch(client!, name, value)))
              }}
            />
            <span>
              {t(`telegram.${name}`)}
              <span className="caption toggle-row__hint">{t(`telegram.${name}Hint`)}</span>
            </span>
          </label>
        ))}
        <div className="button-row">
          <Button disabled={busy} onClick={() => void run(async () => setNote((await testPush(client!)) ? 'testSent' : 'testFailed'))}>
            {t('push.test')}
          </Button>
          <Button variant="plain" disabled={busy} onClick={() => void run(async () => setStatus(await unsubscribePush(client!)))}>
            {t('push.turnOff')}
          </Button>
        </div>
      </>
    )
  else
    body = (
      <Button icon={<Bell size={18} aria-hidden="true" />} disabled={busy} onClick={() => void run(async () => setStatus(await subscribePush(client!, locale)))}>
        {t('push.turnOn')}
      </Button>
    )

  return (
    <Card className="form-stack telegram">
      <p className="secondary-text">{t('push.intro')}</p>
      {body}
      {note && (
        <p className={note === 'testSent' ? 'caption' : 'caption field__error'} role={note === 'testSent' ? 'status' : 'alert'}>
          {t(`push.${note}`)}
        </p>
      )}
    </Card>
  )
}
