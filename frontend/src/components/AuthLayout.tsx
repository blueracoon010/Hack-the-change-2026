// Login / Sign up: the whole page in the app's teal, a big "Nexus" wordmark in the display face (charcoal on
// teal, 8.9:1), and the form in a charcoal card so fields read exactly like the rest of the (dark) app.
import type { ReactNode } from 'react'
import { APP } from '../config/app'
import { Splash } from './Backdrop'
import { Logo } from './Logo'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="auth-teal relative isolate grid min-h-screen overflow-hidden lg:grid-cols-[1.05fr_1fr]">
      {/* Splashes peeking in from the edges, behind everything */}
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <Splash x="102%" y="-4%" size={760} rotate={215} tone="pink" />
        <Splash x="-3%" y="104%" size={680} rotate={35} tone="pink" />
        <Splash x="48%" y="104%" size={300} rotate={150} petals={3} tone="white" />
        <Splash x="-3%" y="8%" size={260} rotate={120} petals={3} tone="white" />
      </div>
      <aside className="hidden flex-col justify-between p-12 lg:flex">
        <Logo />
        <div>
          <p className="font-brand text-[clamp(5rem,11vw,9.5rem)] leading-[0.9]">{APP.name}</p>
          <p className="mt-6 max-w-md font-brand text-[1.9rem] leading-tight">{APP.tagline}</p>
        </div>
        <p className="text-sm text-muted">Made in Calgary</p>
      </aside>

      <main className="flex items-center justify-center p-4 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-6 px-2 lg:hidden">
            <p className="font-brand text-6xl leading-none">{APP.name}</p>
            <p className="mt-3 font-brand text-xl">{APP.tagline}</p>
          </div>
          <div className="auth-card animate-in rounded-[1.75rem] p-7 shadow-2xl shadow-black/20 sm:p-9">
            <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">{title}</h1>
            <p className="mt-2 text-muted">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </main>
    </div>
  )
}
