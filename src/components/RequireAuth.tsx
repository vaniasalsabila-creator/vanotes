import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabaseConfigured } from '../lib/supabase'
import SetupScreen from '../pages/SetupScreen'

/** Everything inside this route needs a signed-in user. */
export default function RequireAuth() {
  const { session, loading } = useAuth()
  const loc = useLocation()

  if (!supabaseConfigured) return <SetupScreen />
  if (loading) return <div className="min-h-screen" aria-busy="true" /> // brief: just the paper colour, no flash of login
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <Outlet />
}
