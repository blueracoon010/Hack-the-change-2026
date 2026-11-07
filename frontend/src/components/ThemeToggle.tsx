// One-click light/dark switch. Saves to the same Theme preference as the Settings page.
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { usePrefs } from '../context/PreferencesContext'
import { cx } from './ui'

function useSystemDark() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return dark
}

export function ThemeToggle({ className }: { className?: string }) {
  const { prefs, update } = usePrefs()
  const systemDark = useSystemDark()
  const isDark = prefs.theme === 'dark' || (prefs.theme === 'system' && systemDark)
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <button type="button" onClick={() => update({ theme: isDark ? 'light' : 'dark' })} aria-label={label} title={label}
      className={cx('grid size-10 place-items-center rounded-xl text-muted transition hover:bg-surface-2 hover:text-fg', className)}>
      {isDark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  )
}
