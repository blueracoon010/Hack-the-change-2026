// Split-screen layout for Login / Sign up: brand panel on the left, form on the right.
import type { ReactNode } from 'react'
import { Accessibility, BarChart3, ShieldCheck } from 'lucide-react'
import { APP } from '../config/app'
import { Logo } from './Logo'

const FEATURES = [
  { icon: BarChart3, text: 'Live, real data from AESO and the City of Calgary' },
  { icon: Accessibility, text: 'Built for everyone: keyboard, screen reader and text size friendly' },
  { icon: ShieldCheck, text: 'Your data stays yours: export or delete it any time' },
]

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="brand-gradient relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10" />
        <div aria-hidden className="absolute -bottom-32 -left-16 size-[28rem] rounded-full bg-[#00d3a9]/25 blur-2xl" />
        <Logo light />
        <div className="relative">
          <h2 className="max-w-md text-4xl font-extrabold leading-tight">{APP.tagline}</h2>
          <ul className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-lg font-semibold text-white/95">
                <span className="grid size-10 place-items-center rounded-xl bg-white/15" aria-hidden><Icon className="size-5" /></span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/80">Made in Calgary · {APP.org}</p>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-12">
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
