import { useEffect, useState, type ReactNode } from 'react'
import Logo from '../components/Logo'
import { useAuth } from './auth'
import { openUserDb } from './db'
import { migrateMeetingDividers } from './calendar'
import { migrateDumpName } from './quick'
import { getSyncStatus, onSyncStatus, runSync, startSyncLoop, stopSyncLoop } from './sync'

/** Opens this account's local store, then pulls from Supabase before the rest of the app mounts. */
export function SyncBoot({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const userId = session?.user.id
    if (!userId) {
      setReady(false)
      stopSyncLoop()
      return
    }
    let alive = true
    setReady(false)
    ;(async () => {
      await openUserDb(userId)
      await migrateDumpName()
      await migrateMeetingDividers()
      await runSync()
      if (!alive) return
      startSyncLoop()
      setReady(true)
    })()
    return () => {
      alive = false
      stopSyncLoop()
    }
  }, [session?.user.id])

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center px-5">
        <div className="page-enter text-center">
          <Logo size={48} />
          <p className="mt-6 font-display text-2xl">loading your notes…</p>
          <p className="mt-2 font-mono text-sm text-muted">bringing this device in line with your account</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export function useSyncStatus() {
  const [status, setStatus] = useState(getSyncStatus)
  useEffect(() => onSyncStatus(setStatus), [])
  return status
}
