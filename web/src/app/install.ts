import { useEffect, useState } from 'react'

// Installing the site as an app. Chrome and Edge offer a prompt the page can trigger; Safari
// on iPhone has no prompt, only "Share → Add to Home Screen".

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | undefined
const listeners = new Set<() => void>()

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferred = event as InstallPromptEvent
  listeners.forEach((listener) => listener())
})
window.addEventListener('appinstalled', () => {
  deferred = undefined
  listeners.forEach((listener) => listener())
})

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => console.error('Service worker failed', error))
  })
}

export type InstallState = 'installed' | 'prompt' | 'ios' | 'unavailable'

function currentState(): InstallState {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (standalone) return 'installed'
  if (deferred) return 'prompt'
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return 'ios'
  return 'unavailable'
}

export function useInstall(): { state: InstallState; install: () => Promise<void> } {
  const [state, setState] = useState(currentState)
  useEffect(() => {
    const update = () => setState(currentState())
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])
  return {
    state,
    install: async () => {
      if (!deferred) return
      await deferred.prompt()
      await deferred.userChoice
      deferred = undefined
      setState(currentState())
    },
  }
}
