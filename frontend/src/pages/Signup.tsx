import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Alert, Button, Field } from '../components/ui'
import { useAuth } from '../context/AuthContext'

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const passwordTooShort = form.password.length > 0 && form.password.length < 8

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signup(form.name, form.email, form.password)
      navigate(from, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="It takes less than a minute.">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label="Full name" autoComplete="name" required value={form.name} onChange={set('name')} />
        <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} placeholder="you@example.com" />
        <Field label="Password" type="password" autoComplete="new-password" required value={form.password} onChange={set('password')}
          hint="At least 8 characters." error={passwordTooShort ? 'Password is too short' : undefined} />
        <Button type="submit" loading={loading} className="w-full py-3">Create account</Button>
        <p className="text-center text-sm text-muted">
          We only store your name, email and a securely hashed password. You can export or delete them any time in Settings.
        </p>
        <p className="text-center text-muted">
          Already have an account? <Link to="/login" state={{ from }} className="font-bold text-brand-strong hover:underline">Sign in</Link> · <Link to="/forgot-password" className="font-bold text-brand-strong hover:underline">Forgot password?</Link>
        </p>
      </form>
    </AuthLayout>
  )
}
