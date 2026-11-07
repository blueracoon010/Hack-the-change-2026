import { HashRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AppLayout } from './components/AppLayout'
import { Loading } from './components/ui'
import { NAV } from './config/nav'
import { AuthProvider, useAuth } from './context/AuthContext'
import { PreferencesProvider } from './context/PreferencesContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Invite from './pages/Invite'
import PersonProfile from './pages/PersonProfile'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <Loading label="Starting up" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  if (!ready) return <Loading label="Starting up" />
  return user ? <Navigate to="/" replace /> : children
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-3xl font-extrabold">Page not found</h1>
      <Link to="/" className="mt-4 inline-block font-bold text-brand-strong hover:underline">Go home</Link>
    </div>
  )
}

export default function App() {
  return (
    <PreferencesProvider>
      <AuthProvider>
        {/* HashRouter is required for Electron (pages load from file://) */}
        <HashRouter>
          <Routes>
            <Route path="/invite/:token" element={<Invite />} />
            <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
            <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
            <Route path="/forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
              {NAV.map((n) => <Route key={n.path} path={n.path} element={n.element} />)}
              <Route path="/people/:id" element={<PersonProfile />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </HashRouter>
      </AuthProvider>
    </PreferencesProvider>
  )
}
