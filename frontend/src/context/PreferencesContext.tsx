// Accessibility + display preferences, stored on this device only (never sent to the server).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Prefs = {
  theme: 'system' | 'light' | 'dark'
  textSize: 'md' | 'lg' | 'xl'
  highContrast: boolean
  reduceMotion: boolean
}

const DEFAULTS: Prefs = { theme: 'dark', textSize: 'md', highContrast: false, reduceMotion: false }
const KEY = 'display_prefs'

const PrefsContext = createContext<{ prefs: Prefs; update: (p: Partial<Prefs>) => void } | null>(null)

function load(): Prefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return DEFAULTS }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load)

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      root.classList.add('dark') // Nexus is dark-only
      root.classList.toggle('hc', prefs.highContrast)
      root.classList.toggle('reduce-motion', prefs.reduceMotion)
      root.dataset.text = prefs.textSize
    }
    apply()
    media.addEventListener('change', apply)
    try { localStorage.setItem(KEY, JSON.stringify(prefs)) } catch { /* ignore */ }
    return () => media.removeEventListener('change', apply)
  }, [prefs])

  const update = (p: Partial<Prefs>) => setPrefs((prev) => ({ ...prev, ...p }))
  return <PrefsContext.Provider value={{ prefs, update }}>{children}</PrefsContext.Provider>
}

export function usePrefs() {
  const ctx = useContext(PrefsContext)
  if (!ctx) throw new Error('usePrefs must be used inside <PreferencesProvider>')
  return ctx
}
