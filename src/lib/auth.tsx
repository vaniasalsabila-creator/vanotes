import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { flushPending } from './sync'

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

/**
 * The first name used in the greeting: a name the user set (stored on their account, so it follows them to every
 * device), otherwise the first part of their email address ("vania.salsabila@…" → "vania").
 */
export function firstNameFrom(user?: User | null): string {
  const meta = String(user?.user_metadata?.name ?? user?.user_metadata?.full_name ?? '').trim()
  if (meta) return meta.split(/\s+/)[0]
  const local = (user?.email ?? '').split('@')[0]
  const first = local.split(/[._\-+0-9]+/)[0]
  return first.length >= 2 ? first : ''
}

/** Saves the name on the account (empty = go back to using the email). */
export async function setDisplayName(name: string) {
  const { error } = await supabase!.auth.updateUser({ data: { name: name.trim() } })
  if (error) throw error
}

/** Lets unsent changes reach the account first, so signing out never loses anything. */
export async function signOut() {
  await flushPending(6000).catch(() => false)
  await supabase?.auth.signOut()
}

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
