// Split-screen layout for Login / Sign up: brand panel on the left, form on the right.
import type { ReactNode } from 'react'
import { APP } from '../config/app'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="brand-gradient relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
        <Logo light />
        <div className="relative">
          <h2 className="max-w-md text-4xl font-extrabold leading-tight">{APP.tagline}</h2>
        </div>
        <p className="relative text-sm text-navy/75">Made in Calgary</p>
      </aside>

      <main className="relative flex items-center justify-center p-6 sm:p-12">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="w-full max-w-md animate-in">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-2 text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
