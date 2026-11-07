import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { AuthLayout } from '../components/AuthLayout'
import { Alert, Button, Field } from '../components/ui'
import { api } from '../lib/api'

/** Step 1: ask for a reset link. The answer is the same whether or not the email has an account (privacy). */
export default function ForgotPassword() {
  const prefill = (useLocation().state as { email?: string } | null)?.email ?? ''
  const [email, setEmail] = useState(prefill)
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError('Enter the email you signed up with.'); return }
    setError(null); setLoading(true)
    try {
      const res = await api<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: { email } })
      setSent(res.message)
    } catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }

  return (
    <AuthLayout title="Forgot your password?" subtitle="Enter your email and we’ll send you a link to choose a new one.">
      {sent ? (
        <div className="space-y-5" role="status">
          <div className="flex items-start gap-3 rounded-2xl bg-brand-tint p-4 text-brand-strong">
            <MailCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
            <p className="font-semibold">{sent}</p>
          </div>
          <p className="text-sm text-muted">Didn’t get it? Check your spam folder, or try again in a minute.</p>
          <Button variant="secondary" className="w-full py-3" onClick={() => setSent(null)}>Send another link</Button>
          <p className="text-center text-muted"><Link to="/login" className="font-bold text-brand-strong hover:underline">Back to sign in</Link></p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {error && <Alert>{error}</Alert>}
          <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <Button type="submit" loading={loading} className="w-full py-3">Send reset link</Button>
          <p className="text-center text-muted">
            Remembered it? <Link to="/login" className="font-bold text-brand-strong hover:underline">Sign in</Link> · <Link to="/signup" className="font-bold text-brand-strong hover:underline">Create an account</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}
