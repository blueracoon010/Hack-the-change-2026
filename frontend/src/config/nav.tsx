// ADD A PAGE: create src/pages/MyPage.tsx, then add ONE line below. The route and sidebar icon appear automatically.
// Icons: https://lucide.dev/icons
import type { LucideIcon } from 'lucide-react'
import { CalendarHeart, CalendarPlus, Map as MapIcon, NotebookPen, Users, UserRound, Settings as SettingsIcon } from 'lucide-react'
import type { ReactElement } from 'react'
import Explore from '../pages/Explore'
import CreateEvent from '../pages/CreateEvent'
import Settings from '../pages/Settings'
import Community from '../pages/Community'
import Profile from '../pages/Profile'
import Plan from '../pages/Plan'
import Journal from '../pages/Journal'

/** `fullBleed` pages fill the window under the top bar with no padding (used by the map). */
export type NavItem = { path: string; label: string; icon: LucideIcon; element: ReactElement; fullBleed?: boolean; backdrop?: 'soft' | 'bold' | 'none' }

export const NAV: NavItem[] = [
  { path: '/', label: 'Explore', icon: MapIcon, element: <Explore />, fullBleed: true, backdrop: 'none' },
  { path: '/plan', label: 'Plan', icon: CalendarHeart, element: <Plan /> },
  { path: '/create', label: 'Create event', icon: CalendarPlus, element: <CreateEvent /> },
  { path: '/community', label: 'Community', icon: Users, element: <Community /> },
  { path: '/journal', label: 'Journal', icon: NotebookPen, element: <Journal /> },
  { path: '/profile', label: 'Profile', icon: UserRound, element: <Profile /> },
  { path: '/settings', label: 'Settings', icon: SettingsIcon, element: <Settings /> },
]
