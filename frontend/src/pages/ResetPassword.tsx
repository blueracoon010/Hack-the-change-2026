import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Alert, Button, Field } from '../components/ui'
import { useAuth } from '../context/AuthContext'

/** Step 2: opened from the emailed link (#/reset-password?token=…). Sets the new password and signs you in. */
export default function ResetPassword() {
  const { resetPassword } = useAuth()
  const navigate = useNavigate()
  const token = useSearchParams()[0].get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('The two passwords don’t match.'); return }
    setError(null); setLoading(true)
    try {
      await resetPassword(token, password)
      navigate('/', { replace: true })
    } catch (err) { setError((err as Error).message) } finally { setLoading(false) }
  }

  if (!token) {
    return (
      <AuthLayout title="Reset link missing" subtitle="Open the link from your email again, or ask for a new one.">
        <Link to="/forgot-password" className="font-bold text-brand-strong hover:underline">Send me a new link</Link>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title="Choose a new password" subtitle="You’ll be signed in straight after.">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error && <Alert>{error} {error.includes('expired') && <Link to="/forgot-password" className="underline">Get a new link</Link>}</Alert>}
        <Field label="New password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters." />
        <Field label="Confirm new password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Button type="submit" loading={loading} className="w-full py-3">Save new password</Button>
      </form>
    </AuthLayout>
  )
}
