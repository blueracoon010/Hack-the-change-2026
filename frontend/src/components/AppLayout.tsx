// Signed-in shell: icon sidebar (collapsible) + top bar + page content.
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NAV } from '../config/nav'
import { useAuth } from '../context/AuthContext'
import { Logo } from './Logo'
import { cx } from './ui'

export function AppLayout() {
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const current = NAV.find((n) => n.path === location.pathname)
  const fullBleed = !!current?.fullBleed
  const browsingAsGuest = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS !== 'false' && !user

  return (
    <div className="flex min-h-screen">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }}>Skip to content</a>

      <aside className={cx('sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface p-3 transition-all md:flex', collapsed ? 'w-20' : 'w-64')}>
        <div className={cx('mb-6 flex items-center px-2 pt-2', collapsed ? 'justify-center' : 'justify-between')}>
          <Logo compact={collapsed} />
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
          {NAV.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={path} end title={collapsed ? label : undefined}
              className={({ isActive }) => cx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold transition',
                collapsed && 'justify-center',
                isActive ? 'bg-brand-tint text-brand-strong' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )}>
              <Icon className="size-5 shrink-0" aria-hidden />
              <span className={collapsed ? 'sr-only' : ''}>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button type="button" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5 font-bold text-muted hover:bg-surface-2 hover:text-fg', collapsed && 'justify-center')}>
          {collapsed ? <PanelLeftOpen className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
          {!collapsed && 'Collapse'}
        </button>
      </aside>

      <div className={cx('flex min-w-0 flex-1 flex-col', fullBleed && 'h-screen')}>
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-bg/85 px-6 py-3 backdrop-blur">
          <div className="md:hidden"><Logo compact /></div>
          <p className="hidden text-sm font-bold text-muted md:block">{current?.label}</p>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-bold">{browsingAsGuest ? 'Development preview' : user?.name}</p>
              <p className="text-xs text-muted">{browsingAsGuest ? 'Browsing without an account' : user?.email}</p>
            </div>
            <span className="grid size-10 place-items-center rounded-full bg-pink font-extrabold text-[#8a1838]" aria-hidden>
              {user?.name?.[0]?.toUpperCase() ?? 'D'}
            </span>
            {!browsingAsGuest && <button type="button" onClick={logout} aria-label="Sign out" title="Sign out"
              className="grid size-10 place-items-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg">
              <LogOut className="size-5" aria-hidden />
            </button>}
          </div>
        </header>

        <main id="main" tabIndex={-1} className={cx('flex-1 outline-none', fullBleed
          ? 'min-h-0 overflow-hidden pb-16 md:pb-0'
          : 'mx-auto w-full max-w-7xl px-6 py-8 pb-28 md:pb-8')}>
          <Outlet />
        </main>
      </div>

      {/* Bottom icon bar on narrow screens */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-line bg-surface py-2 md:hidden">
        {NAV.map(({ path, label, icon: Icon }) => (
          <NavLink key={path} to={path} end
            className={({ isActive }) => cx('flex flex-col items-center gap-0.5 rounded-xl px-3 py-1 text-xs font-bold', isActive ? 'text-brand-strong' : 'text-muted')}>
            <Icon className="size-5" aria-hidden />{label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
