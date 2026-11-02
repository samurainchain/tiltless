import type Big from 'big.js'
import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { Currency } from '../core/models'
import { formatMoney } from '../i18n/format'
import { useI18n } from '../i18n/i18n'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'plain'

export function Button({
  variant = 'secondary',
  icon,
  block = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; icon?: ReactNode; block?: boolean }) {
  const classes = ['button', `button--${variant}`, block ? 'button--block' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <button type="button" className={classes} {...props}>
      {icon}
      {children}
    </button>
  )
}

/** A money amount with its sign and profit/loss color. */
export function PnLText({
  amount,
  currency,
  size = 'regular',
}: {
  amount: Big
  currency: Currency
  size?: 'regular' | 'hero'
}) {
  const { locale } = useI18n()
  const tone = amount.gt(0) ? 'profit' : amount.lt(0) ? 'loss' : ''
  return <span className={['pnl', 'numeric', `pnl--${size}`, tone].filter(Boolean).join(' ')}>{formatMoney(amount, currency, locale)}</span>
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: ReactNode
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        {icon}
      </div>
      <h2 className="empty-state__title">{title}</h2>
      <p className="empty-state__message">{message}</p>
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={['card', className ?? ''].filter(Boolean).join(' ')}>{children}</section>
}

export function SectionHeader({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {trailing}
    </div>
  )
}

/**
 * A bottom sheet on phones and a centered dialog on wide screens, built on <dialog>,
 * which gives focus trapping and Escape to close for free.
 */
export function Sheet({
  open,
  title,
  onClose,
  header,
  footer,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const { t } = useI18n()

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose()
      }}
    >
      {open && (
        <div className="sheet__panel">
          <header className="sheet__header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-button" onClick={onClose} aria-label={t('common.close')}>
              <X size={20} aria-hidden="true" />
            </button>
          </header>
          {header}
          <div className="sheet__body">{children}</div>
          {footer && <footer className="sheet__footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'regular',
}: {
  label: string
  value: T
  options: readonly { value: T; label: string; tone?: 'profit' | 'loss' }[]
  onChange: (value: T) => void
  size?: 'regular' | 'large'
}) {
  return (
    <div className={`segmented segmented--${size}`} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={['segmented__option', option.value === value && option.tone ? `segmented__option--${option.tone}` : ''].join(' ')}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Chip({
  label,
  selected,
  colorHex,
  icon,
  onToggle,
}: {
  label: string
  selected: boolean
  colorHex?: string
  icon?: ReactNode
  onToggle?: () => void
}) {
  const style = colorHex ? ({ '--chip-color': colorHex } as React.CSSProperties) : undefined
  if (!onToggle) {
    return (
      <span className="chip chip--static" style={style}>
        {icon}
        {label}
      </span>
    )
  }
  return (
    <button type="button" className={`chip${selected ? ' chip--selected' : ''}`} aria-pressed={selected} style={style} onClick={onToggle}>
      {icon}
      {label}
    </button>
  )
}

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
  recognized,
}: {
  label: string
  error?: string
  hint?: string
  htmlFor?: string
  children: ReactNode
  /** Filled from a screenshot: `high` is highlighted, `low` also asks to check the value. */
  recognized?: 'high' | 'low'
}) {
  const { t } = useI18n()
  const status = recognized === 'low' ? ' field--check' : recognized === 'high' ? ' field--recognized' : ''
  return (
    <div className={`field${error ? ' field--invalid' : ''}${status}`}>
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : recognized === 'low' ? (
        <p className="field__hint field__hint--check">{t('entry.checkValue')}</p>
      ) : (
        hint && <p className="field__hint">{hint}</p>
      )}
    </div>
  )
}

/** A daily limit as a bar: neutral, then warning at 80% and loss color at 100%. */
export function LimitBar({
  label,
  value,
  ratio,
  level,
  tone = 'limit',
}: {
  label: string
  value: string
  ratio: number
  level: 'ok' | 'warning' | 'reached'
  /** 'progress' fills toward a goal (a profit target) in the profit color. */
  tone?: 'limit' | 'progress'
}) {
  return (
    <div className={`limit-bar limit-bar--${level}${tone === 'progress' ? ' limit-bar--progress' : ''}`}>
      <div className="limit-bar__text">
        <span>{label}</span>
        <span className="numeric">{value}</span>
      </div>
      <div className="limit-bar__track" role="progressbar" aria-label={label} aria-valuetext={value} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(ratio, 1) * 100)}>
        <span className="limit-bar__fill" style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
      </div>
    </div>
  )
}

/** Privacy Policy and Terms of Use: static pages at the site's root (public/privacy, public/terms). */
/** Privacy and Terms; `refund` adds the Refund Policy where Pro is sold. */
export function LegalLinks({ refund = false }: { refund?: boolean }) {
  const { t } = useI18n()
  return (
    <p className="legal-links caption">
      <a href="/privacy/">{t('legal.privacy')}</a>
      <span aria-hidden="true"> · </span>
      <a href="/terms/">{t('legal.terms')}</a>
      {refund && (
        <>
          <span aria-hidden="true"> · </span>
          <a href="/refund/">{t('legal.refund')}</a>
        </>
      )}
    </p>
  )
}
