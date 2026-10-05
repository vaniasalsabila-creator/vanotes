import { useEffect, useState, type ReactNode } from 'react'
import Logo from '../components/Logo'
import Portal from '../components/Portal'
import { signOut, useAuth } from './auth'
import { cancelStop, describeSyncError, scheduleStop, startSync, useSyncInfo, type LegacyInfo } from './sync'

export { useSyncInfo }

type Phase = 'loading' | 'ready' | 'error'

/**
 * Loads the signed-in account's notes from Supabase before the rest of the app mounts. Nothing from this
 * browser is shown in the meantime — if the account's data can't be loaded, you get an error, not a stale copy.
 */
export function SyncBoot({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const userId = session?.user.id
  const [phase, setPhase] = useState<Phase>('loading')
  const [problem, setProblem] = useState<ReturnType<typeof describeSyncError>>()
  const [legacy, setLegacy] = useState<LegacyInfo | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!userId) return
    let alive = true
    cancelStop()
    setPhase('loading')
    setProblem(undefined)
    startSync(userId).then(
      (r) => {
        if (!alive) return
        setLegacy(r.legacy)
        setPhase('ready')
      },
      (e) => {
        if (!alive) return
        setProblem(describeSyncError(e))
        setPhase('error')
      },
    )
    return () => {
      alive = false
      scheduleStop() // wipes this window's copy when the account signs out or changes
    }
  }, [userId, attempt])

  if (!userId) return null

  if (phase === 'loading')
    return (
      <div className="grid min-h-screen place-items-center px-5">
        <div className="page-enter text-center">
          <Logo size={48} />
          <p className="mt-6 font-display text-2xl">loading your notes…</p>
          <p className="mt-2 font-mono text-sm text-muted">reading them from your account</p>
        </div>
      </div>
    )

  if (phase === 'error')
    return (
      <div className="grid min-h-screen place-items-center px-5">
        <div className="page-enter w-full max-w-md rounded-[26px] border border-line bg-card p-8 text-center shadow-[0_24px_40px_-30px_rgba(43,38,34,0.6)]">
          <Logo size={44} className="mx-auto" />
          <h1 className="mt-5 font-display text-2xl">{problem?.title ?? 'couldn’t load your notes'}</h1>
          <p className="mt-2 font-mono text-sm leading-relaxed text-muted">{problem?.detail}</p>
          <div className="mt-6 flex justify-center gap-2">
            <button onClick={() => setAttempt((n) => n + 1)} className="h-10 rounded-xl bg-ink px-5 text-sm text-paper hover:bg-black">
              try again
            </button>
            <button onClick={() => void signOut()} className="h-10 rounded-xl bg-pill px-5 text-sm hover:bg-[#e3d9c5]">
              sign out
            </button>
          </div>
        </div>
      </div>
    )

  return (
    <div key={userId} className="contents">
      {children}
      {legacy && <LegacyPrompt info={legacy} email={session?.user.email} onDone={() => setLegacy(null)} />}
    </div>
  )
}

function LegacyPrompt({ info, email, onDone }: { info: LegacyInfo; email?: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const { projects, notes, images, events } = info.counts
  const parts = [
    notes && `${notes} ${notes === 1 ? 'note' : 'notes'}`,
    projects && `${projects} ${projects === 1 ? 'project' : 'projects'}`,
    images && `${images} ${images === 1 ? 'image' : 'images'}`,
    events && `${events} calendar ${events === 1 ? 'event' : 'events'}`,
  ].filter(Boolean)

  return (
    <Portal>
      <div className="anim-fade fixed inset-0 z-[80] flex items-end justify-center bg-ink/30 p-4 backdrop-blur-[2px] sm:items-center">
        <div role="dialog" aria-label="Notes found on this browser" className="page-enter w-full max-w-md rounded-3xl bg-paper p-6 shadow-xl">
          <h2 className="font-display text-xl">notes found only on this browser</h2>
          <p className="mt-2 font-mono text-sm leading-relaxed text-muted">
            from before accounts existed, this browser still holds {parts.join(', ')} that aren’t saved to any account. add them to{' '}
            <span className="text-ink">{email ?? 'your account'}</span>?
          </p>
          {failed && <p className="mt-3 rounded-xl bg-[#f1d9d0] px-3 py-2 font-mono text-xs text-[#7a3b28]">couldn’t finish uploading — try again.</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              disabled={busy}
              onClick={async () => {
                if (confirm('Delete these notes from this browser? They are not saved anywhere else.')) {
                  await info.discard()
                  onDone()
                }
              }}
              className="mr-auto px-2 text-sm text-accent hover:underline disabled:opacity-40"
            >
              delete them
            </button>
            <button disabled={busy} onClick={onDone} className="h-10 rounded-xl bg-pill px-4 text-sm hover:bg-[#e3d9c5] disabled:opacity-40">
              not now
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setFailed(false)
                const ok = await info.importAll()
                setBusy(false)
                if (ok) onDone()
                else setFailed(true)
              }}
              className="h-10 rounded-xl bg-ink px-5 text-sm text-paper hover:bg-black disabled:opacity-60"
            >
              {busy ? 'adding…' : 'add to my account'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
