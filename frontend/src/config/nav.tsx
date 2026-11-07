// ADD A PAGE: create src/pages/MyPage.tsx, then add ONE line below. The route and sidebar icon appear automatically.
// Icons: https://lucide.dev/icons
import type { LucideIcon } from 'lucide-react'
import { Map as MapIcon, Settings as SettingsIcon } from 'lucide-react'
import type { ReactElement } from 'react'
import Explore from '../pages/Explore'
import Settings from '../pages/Settings'

/** `fullBleed` pages fill the window under the top bar with no padding (used by the map). */
export type NavItem = { path: string; label: string; icon: LucideIcon; element: ReactElement; fullBleed?: boolean }

export const NAV: NavItem[] = [
  { path: '/', label: 'Explore', icon: MapIcon, element: <Explore />, fullBleed: true },
  { path: '/settings', label: 'Settings', icon: SettingsIcon, element: <Settings /> },
]
