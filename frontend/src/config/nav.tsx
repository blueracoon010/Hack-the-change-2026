// ADD A PAGE: create src/pages/MyPage.tsx, then add ONE line below. The route and sidebar icon appear automatically.
// Icons: https://lucide.dev/icons
import type { LucideIcon } from 'lucide-react'
import { House, Zap, MapPin, Settings as SettingsIcon } from 'lucide-react'
import type { ReactElement } from 'react'
import Home from '../pages/Home'
import Energy from '../pages/Energy'
import Community from '../pages/Community'
import Settings from '../pages/Settings'

export type NavItem = { path: string; label: string; icon: LucideIcon; element: ReactElement }

export const NAV: NavItem[] = [
  { path: '/', label: 'Home', icon: House, element: <Home /> },
  { path: '/energy', label: 'Energy', icon: Zap, element: <Energy /> },
  { path: '/community', label: 'Community', icon: MapPin, element: <Community /> },
  { path: '/settings', label: 'Settings', icon: SettingsIcon, element: <Settings /> },
]
