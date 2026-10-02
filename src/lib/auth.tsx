import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthState {
  session: Session | null
  /** true until we know whether a saved session exists */
  loading: boolean
}

const AuthCtx = createContext<AuthState>({ session: null, loading: true })
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: !!supabase })

  useEffect(() => {
    if (!supabase) return
    let alive = true
    supabase.auth.getSession().then(({ data }) => alive && setState({ session: data.session, loading: false }))
    // fires on sign-in, sign-out, token refresh, and when an email link is opened
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }))
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>
}

export const signOut = () => supabase?.auth.signOut()

/** Turns Supabase's error strings into something kind. */
export function friendlyAuthError(message: string) {
  const m = message.toLowerCase()
  if (m.includes('invalid login')) return 'That email and password don’t match.'
  if (m.includes('email not confirmed')) return 'Please confirm your email first — check your inbox for the link.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'That email already has an account. Try signing in.'
  if (m.includes('password should be')) return 'Use a password with at least 6 characters.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts for now. Wait a minute and try again.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'Can’t reach Supabase. Check your connection and your project URL.'
  if (m.includes('valid email') || m.includes('invalid email')) return 'That doesn’t look like a valid email.'
  return message
}
