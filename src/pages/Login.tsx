import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { friendlyAuthError, useAuth } from '../lib/auth'
import { DrawCheck } from '../components/Icons'
import Logo from '../components/Logo'
import SetupScreen from './SetupScreen'
import { cx } from '../lib/utils'

type Mode = 'signin' | 'signup'

const input =
  'mt-1.5 h-12 w-full rounded-2xl border border-line bg-card px-4 text-[15px] outline-none transition-colors placeholder:text-muted/60 focus:border-ink'

export default function Login() {
  const { session, loading } = useAuth()
  const from = (useLocation().state as { from?: string } | null)?.from
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [sentTo, setSentTo] = useState<string>()

  if (!supabaseConfigured) return <SetupScreen />
  if (!loading && session) return <Navigate to={from && from !== '/login' ? from : '/'} replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || busy) return
    setBusy(true)
    setError(undefined)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) setError(friendlyAuthError(error.message))
        // on success the auth listener sets the session and this page redirects
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin, ...(name.trim() && { data: { name: name.trim() } }) },
        })
        if (error) setError(friendlyAuthError(error.message))
        // With "Confirm email" on, no session comes back yet. An empty identities list means the email already exists.
        else if (data.user && data.user.identities?.length === 0) setError(friendlyAuthError('already registered'))
        else if (!data.session) setSentTo(email.trim())
      }
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : 'Something went wrong.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-5 py-10">
      <div className="page-enter w-full max-w-sm">
        <div className="flex justify-center"><Logo size={60} /></div>

        <div className="relative isolate mt-8">
          <span aria-hidden className="absolute inset-x-3 -bottom-1.5 -z-10 h-full rounded-[26px] border border-line bg-card" />
          <div className="rounded-[26px] border border-line bg-card p-7 shadow-[0_24px_40px_-30px_rgba(43,38,34,0.6)]">
            {sentTo ? (
              <div className="anim-pop text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent">
                  <DrawCheck size={22} />
                </div>
                <h1 className="mt-4 font-display text-2xl">check your email.</h1>
                <p className="mt-2 font-mono text-sm leading-relaxed text-muted">
                  we sent a confirmation link to <span className="text-ink">{sentTo}</span>. open it in this browser, then come back and sign in.
                </p>
                <button
                  onClick={() => {
                    setSentTo(undefined)
                    setMode('signin')
                  }}
                  className="mt-6 text-sm underline underline-offset-4 hover:text-accent"
                >
                  back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <h1 key={mode} className="anim-fade font-display text-3xl">
                  {mode === 'signin' ? 'welcome back.' : 'create your account.'}
                </h1>
                <p className="mt-1 font-mono text-sm text-muted">
                  {mode === 'signin' ? 'sign in to open notes saved to this account.' : 'one email and a password is all it takes.'}
                </p>

                {mode === 'signup' && (
                  <label className="mt-6 block text-sm">
                    your name <span className="text-muted">(optional — for the greeting)</span>
                    <input
                      type="text"
                      autoComplete="given-name"
                      maxLength={30}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="vania"
                      className={input}
                    />
                  </label>
                )}
                <label className={mode === 'signup' ? 'mt-4 block text-sm' : 'mt-6 block text-sm'}>
                  email
                  <input
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@work.com"
                    className={input}
                  />
                </label>
                <label className="mt-4 block text-sm">
                  password
                  <input
                    type="password"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'at least 6 characters' : '••••••••'}
                    className={input}
                  />
                </label>

                {error && (
                  <p role="alert" key={error} className="anim-pop mt-4 rounded-xl bg-[#f1d9d0] px-4 py-3 font-mono text-sm text-[#7a3b28]">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy || !email || password.length < 1}
                  className={cx(
                    'mt-6 h-12 w-full rounded-2xl bg-ink text-paper transition hover:bg-black disabled:opacity-50',
                    busy && 'cursor-progress',
                  )}
                >
                  {busy ? 'one moment…' : mode === 'signin' ? 'sign in' : 'create account'}
                </button>
              </form>
            )}
          </div>
        </div>

        {!sentTo && (
          <p className="mt-6 text-center text-sm text-muted">
            {mode === 'signin' ? 'new here? ' : 'already have an account? '}
            <button
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin')
                setError(undefined)
              }}
              className="text-ink underline underline-offset-4 hover:text-accent"
            >
              {mode === 'signin' ? 'create an account' : 'sign in'}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
